import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { makeJoinCode } from '../challenges/challenges.logic';
import {
  householdReport,
  organisationReport,
  sharedDaysFrom,
  type HouseholdReport,
  type MemberStat,
  type OrganisationReport,
} from './groups.logic';

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

export type GroupKind = 'household' | 'organisation';

export interface GroupSummary {
  id: string;
  kind: GroupKind;
  name: string;
  joinCode: string;
  isOwner: boolean;
  size: number;
}

interface MemoryGroup {
  id: string;
  kind: GroupKind;
  name: string;
  ownerId: string;
  joinCode: string;
  members: Map<string, { displayName: string; age: number }>;
}

/**
 * Households and organisations, and the wall between them.
 *
 * Both are a list of people with a join code. What differs is what may
 * be asked of that list: a family may see each other by name; an
 * employer may only ever receive an aggregate above the k-anonymity
 * floor, computed here so no caller can request the other thing.
 */
@Injectable()
export class GroupsService implements OnModuleDestroy {
  private readonly logger = new Logger(GroupsService.name);
  private readonly memory = new Map<string, MemoryGroup>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => PgPoolLike };
      this.pool = new Pool({
        connectionString: url,
        max: 2,
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
    } else {
      this.logger.warn('groups: in-memory — they will not survive a restart');
    }
  }

  async create(
    kind: GroupKind,
    name: string,
    userId: string,
    displayName: string,
    age: number,
  ): Promise<GroupSummary> {
    if (name.trim().length < 2) throw new BadRequestException('give it a name');
    const id = `gr_${randomUUID().slice(0, 8)}`;
    const joinCode = makeJoinCode();

    if (this.pool) {
      await this.pool.query(
        'INSERT INTO groups (id, kind, name, owner_id, join_code) VALUES ($1, $2, $3, $4, $5)',
        [id, kind, name.trim(), userId, joinCode],
      );
      await this.pool.query(
        `INSERT INTO group_members (group_id, user_id, display_name)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, userId, displayName],
      );
    } else {
      this.memory.set(id, {
        id,
        kind,
        name: name.trim(),
        ownerId: userId,
        joinCode,
        members: new Map([[userId, { displayName, age }]]),
      });
    }

    return { id, kind, name: name.trim(), joinCode, isOwner: true, size: 1 };
  }

  async join(code: string, userId: string, displayName: string, age: number): Promise<GroupSummary> {
    const wanted = code.trim().toUpperCase();

    if (this.pool) {
      const found = await this.pool.query(
        'SELECT id, kind, name, owner_id, join_code FROM groups WHERE join_code = $1',
        [wanted],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundException('no group has that code');
      await this.pool.query(
        `INSERT INTO group_members (group_id, user_id, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [row.id, userId, displayName],
      );
      const size = await this.sizeOf(String(row.id));
      return {
        id: String(row.id),
        kind: row.kind as GroupKind,
        name: String(row.name),
        joinCode: String(row.join_code),
        isOwner: String(row.owner_id) === userId,
        size,
      };
    }

    const match = [...this.memory.values()].find((g) => g.joinCode === wanted);
    if (!match) throw new NotFoundException('no group has that code');
    match.members.set(userId, { displayName, age });
    return {
      id: match.id,
      kind: match.kind,
      name: match.name,
      joinCode: match.joinCode,
      isOwner: match.ownerId === userId,
      size: match.members.size,
    };
  }

  async mine(userId: string): Promise<GroupSummary[]> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT g.id, g.kind, g.name, g.owner_id, g.join_code,
                (SELECT count(*) FROM group_members m2 WHERE m2.group_id = g.id) AS size
         FROM groups g
         JOIN group_members m ON m.group_id = g.id
         WHERE m.user_id = $1
         ORDER BY g.created_at DESC`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        kind: row.kind as GroupKind,
        name: String(row.name),
        joinCode: String(row.join_code),
        isOwner: String(row.owner_id) === userId,
        size: Number(row.size ?? 1),
      }));
    }
    return [...this.memory.values()]
      .filter((g) => g.members.has(userId))
      .map((g) => ({
        id: g.id,
        kind: g.kind,
        name: g.name,
        joinCode: g.joinCode,
        isOwner: g.ownerId === userId,
        size: g.members.size,
      }));
  }

  /**
   * The report. Which one you get is decided by the group's kind, not by
   * the caller — an organisation cannot ask for the household shape.
   */
  async report(groupId: string): Promise<HouseholdReport | OrganisationReport> {
    const { kind, stats, daysByUser } = await this.gather(groupId);
    if (kind === 'organisation') return organisationReport(stats);
    return householdReport(stats, sharedDaysFrom(daysByUser, stats.length));
  }

  private async gather(groupId: string): Promise<{
    kind: GroupKind;
    stats: MemberStat[];
    daysByUser: Map<string, Set<string>>;
  }> {
    const daysByUser = new Map<string, Set<string>>();

    if (this.pool) {
      const group = await this.pool.query('SELECT kind FROM groups WHERE id = $1', [groupId]);
      if (!group.rows[0]) throw new NotFoundException('no such group');

      const rows = await this.pool.query(
        `SELECT m.user_id, m.display_name, u.age,
                count(DISTINCT a.on_day) FILTER (WHERE a.kind = 'snap_completed') AS days_moved,
                array_remove(array_agg(DISTINCT a.on_day::text) FILTER (WHERE a.kind = 'snap_completed'), NULL) AS days
         FROM group_members m
         LEFT JOIN app_users u ON u.user_id = m.user_id
         LEFT JOIN member_activity a
           ON a.user_id = m.user_id AND a.on_day >= current_date - interval '13 days'
         WHERE m.group_id = $1
         GROUP BY m.user_id, m.display_name, u.age`,
        [groupId],
      );

      const stats: MemberStat[] = rows.rows.map((r) => {
        const days = (r.days as string[] | null) ?? [];
        daysByUser.set(String(r.user_id), new Set(days));
        return {
          userId: String(r.user_id),
          displayName: String(r.display_name),
          daysMoved: Number(r.days_moved ?? 0),
          minor: Number(r.age ?? 99) < 18,
        };
      });
      return { kind: group.rows[0].kind as GroupKind, stats, daysByUser };
    }

    const group = this.memory.get(groupId);
    if (!group) throw new NotFoundException('no such group');
    const stats: MemberStat[] = [...group.members.entries()].map(([userId, m]) => {
      daysByUser.set(userId, new Set());
      return { userId, displayName: m.displayName, daysMoved: 0, minor: m.age < 18 };
    });
    return { kind: group.kind, stats, daysByUser };
  }

  private async sizeOf(groupId: string): Promise<number> {
    if (!this.pool) return this.memory.get(groupId)?.members.size ?? 1;
    const result = await this.pool.query(
      'SELECT count(*)::int AS n FROM group_members WHERE group_id = $1',
      [groupId],
    );
    return Number(result.rows[0]?.n ?? 1);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
