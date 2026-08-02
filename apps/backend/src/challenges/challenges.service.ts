import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { randomUUID } from 'node:crypto';
import { CHALLENGE_TEMPLATES } from '@jessmove/shared';
import {
  computeProgress,
  makeJoinCode,
  runLengthDays,
  templateByKey,
  type MemberActivity,
  type TeamProgress,
} from './challenges.logic';

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

export interface ChallengeSummary {
  id: string;
  template: string;
  name: string;
  joinCode: string;
  startsOn: string;
  endsOn: string;
  isOwner: boolean;
}

interface MemoryChallenge {
  id: string;
  template: string;
  name: string;
  ownerId: string;
  joinCode: string;
  startsOn: string;
  endsOn: string;
  members: Map<string, string>;
  activity: { userId: string; kind: 'moved' | 'support'; onDay: string }[];
}

const today = (): string => new Date().toISOString().slice(0, 10);
const addDays = (from: string, days: number): string =>
  new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Challenges you can actually join.
 *
 * A challenge is created from one of the published templates, and the
 * creator gets a six-character code to pass around a kitchen or an
 * office. There is no directory, no search for people, and nothing
 * public — which is also what makes it safe for a family with a minor in
 * it.
 */
@Injectable()
export class ChallengesService implements OnModuleDestroy {
  private readonly logger = new Logger(ChallengesService.name);
  private readonly memory = new Map<string, MemoryChallenge>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
    } else {
      this.logger.warn('challenges: in-memory — they will not survive a restart');
    }
  }

  templates() {
    return {
      templates: CHALLENGE_TEMPLATES,
      note: 'Start one and share the code. Nothing here is public, and no individual is ever ranked.',
    };
  }

  async create(templateKey: string, userId: string, displayName: string): Promise<ChallengeSummary> {
    const template = templateByKey(templateKey);
    if (!template) throw new BadRequestException('that is not one of the challenge formats');

    const id = `ch_${randomUUID().slice(0, 8)}`;
    const startsOn = today();
    const endsOn = addDays(startsOn, runLengthDays(template.runs));
    const joinCode = makeJoinCode();

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO challenges (id, template, name, owner_id, join_code, starts_on, ends_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, template.key, template.name, userId, joinCode, startsOn, endsOn],
      );
      await this.pool.query(
        `INSERT INTO challenge_members (challenge_id, user_id, display_name)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, userId, displayName],
      );
    } else {
      this.memory.set(id, {
        id,
        template: template.key,
        name: template.name,
        ownerId: userId,
        joinCode,
        startsOn,
        endsOn,
        members: new Map([[userId, displayName]]),
        activity: [],
      });
    }

    return { id, template: template.key, name: template.name, joinCode, startsOn, endsOn, isOwner: true };
  }

  async join(code: string, userId: string, displayName: string): Promise<ChallengeSummary> {
    const wanted = code.trim().toUpperCase();

    if (this.pool) {
      const found = await this.pool.query(
        'SELECT id, template, name, owner_id, join_code, starts_on, ends_on FROM challenges WHERE join_code = $1',
        [wanted],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundException('no challenge has that code');
      await this.pool.query(
        `INSERT INTO challenge_members (challenge_id, user_id, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (challenge_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [row.id, userId, displayName],
      );
      return this.rowToSummary(row, userId);
    }

    const match = [...this.memory.values()].find((c) => c.joinCode === wanted);
    if (!match) throw new NotFoundException('no challenge has that code');
    match.members.set(userId, displayName);
    return {
      id: match.id,
      template: match.template,
      name: match.name,
      joinCode: match.joinCode,
      startsOn: match.startsOn,
      endsOn: match.endsOn,
      isOwner: match.ownerId === userId,
    };
  }

  async mine(userId: string): Promise<ChallengeSummary[]> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT c.id, c.template, c.name, c.owner_id, c.join_code, c.starts_on, c.ends_on
         FROM challenges c
         JOIN challenge_members m ON m.challenge_id = c.id
         WHERE m.user_id = $1
         ORDER BY c.created_at DESC`,
        [userId],
      );
      return result.rows.map((row) => this.rowToSummary(row, userId));
    }
    return [...this.memory.values()]
      .filter((c) => c.members.has(userId))
      .map((c) => ({
        id: c.id,
        template: c.template,
        name: c.name,
        joinCode: c.joinCode,
        startsOn: c.startsOn,
        endsOn: c.endsOn,
        isOwner: c.ownerId === userId,
      }));
  }

  /** One act. Repeats on the same day are welcome but count once. */
  async record(challengeId: string, userId: string, kind: 'moved' | 'support'): Promise<TeamProgress> {
    if (this.pool) {
      const member = await this.pool.query(
        'SELECT 1 FROM challenge_members WHERE challenge_id = $1 AND user_id = $2',
        [challengeId, userId],
      );
      if (member.rows.length === 0) throw new NotFoundException('you are not in that challenge');
      await this.pool.query(
        'INSERT INTO challenge_activity (challenge_id, user_id, kind) VALUES ($1, $2, $3)',
        [challengeId, userId, kind],
      );
    } else {
      const challenge = this.memory.get(challengeId);
      if (!challenge?.members.has(userId)) throw new NotFoundException('you are not in that challenge');
      challenge.activity.push({ userId, kind, onDay: today() });
    }
    return this.progress(challengeId);
  }

  async progress(challengeId: string): Promise<TeamProgress> {
    if (this.pool) {
      const found = await this.pool.query(
        'SELECT starts_on, ends_on FROM challenges WHERE id = $1',
        [challengeId],
      );
      const row = found.rows[0];
      if (!row) throw new NotFoundException('no such challenge');
      const startsOn = this.dateText(row.starts_on);
      const endsOn = this.dateText(row.ends_on);
      const midpoint = addDays(startsOn, Math.floor(this.elapsed(startsOn) / 2));

      const rows = await this.pool.query(
        `SELECT m.user_id, m.display_name,
                count(DISTINCT a.on_day) FILTER (WHERE a.kind = 'moved') AS days_active,
                count(DISTINCT a.on_day) FILTER (WHERE a.kind = 'moved' AND a.on_day < $2) AS baseline_days,
                count(*) FILTER (WHERE a.kind = 'support') AS support_acts
         FROM challenge_members m
         LEFT JOIN challenge_activity a
           ON a.challenge_id = m.challenge_id AND a.user_id = m.user_id
         WHERE m.challenge_id = $1
         GROUP BY m.user_id, m.display_name`,
        [challengeId, midpoint],
      );

      const members: MemberActivity[] = rows.rows.map((r) => ({
        userId: String(r.user_id),
        displayName: String(r.display_name),
        daysActive: Number(r.days_active ?? 0),
        baselineDaysActive: Number(r.baseline_days ?? 0),
        supportActs: Number(r.support_acts ?? 0),
      }));
      return computeProgress(members, startsOn, endsOn, today());
    }

    const challenge = this.memory.get(challengeId);
    if (!challenge) throw new NotFoundException('no such challenge');
    const midpoint = addDays(challenge.startsOn, Math.floor(this.elapsed(challenge.startsOn) / 2));
    const members: MemberActivity[] = [...challenge.members.entries()].map(([userId, displayName]) => {
      const acts = challenge.activity.filter((a) => a.userId === userId);
      const movedDays = new Set(acts.filter((a) => a.kind === 'moved').map((a) => a.onDay));
      const baseline = new Set(
        acts.filter((a) => a.kind === 'moved' && a.onDay < midpoint).map((a) => a.onDay),
      );
      return {
        userId,
        displayName,
        daysActive: movedDays.size,
        baselineDaysActive: baseline.size,
        supportActs: acts.filter((a) => a.kind === 'support').length,
      };
    });
    return computeProgress(members, challenge.startsOn, challenge.endsOn, today());
  }

  private elapsed(startsOn: string): number {
    return Math.max(
      1,
      Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000) + 1,
    );
  }

  private dateText(value: unknown): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }

  private rowToSummary(row: Record<string, unknown>, userId: string): ChallengeSummary {
    return {
      id: String(row.id),
      template: String(row.template),
      name: String(row.name),
      joinCode: String(row.join_code),
      startsOn: this.dateText(row.starts_on),
      endsOn: this.dateText(row.ends_on),
      isOwner: String(row.owner_id) === userId,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
