import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { computeRewards, type Rewards } from './rewards.logic';
import {
  buildDashboard,
  dayKey,
  type ActivityKind,
  type ActivityRow,
  type Dashboard,
} from './activity.logic';

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

export interface RecordInput {
  userId: string;
  kind: ActivityKind;
  category?: string | null;
  seconds?: number;
  detail?: string;
  /** A measurement: kilograms for a body read, kcal for a meal. */
  value?: number | null;
}

/**
 * The member's own history.
 *
 * Written on every act the platform takes on their behalf, and read back
 * as the dashboard. Failing to record must never break the act itself —
 * a Snap that was delivered but not logged is a lesser problem than a
 * Snap that was never delivered.
 */
@Injectable()
export class ActivityService implements OnModuleDestroy {
  private readonly logger = new Logger(ActivityService.name);
  private readonly memory = new Map<string, ActivityRow[]>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
    } else {
      this.logger.warn('activity: in-memory — history will not survive a restart');
    }
  }

  async record(input: RecordInput): Promise<void> {
    const row: ActivityRow = {
      kind: input.kind,
      category: input.category ?? null,
      seconds: Math.max(0, Math.min(7200, Math.round(input.seconds ?? 0))),
      onDay: dayKey(new Date()),
      at: new Date().toISOString(),
      detail: (input.detail ?? '').slice(0, 200),
      value: input.value ?? null,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO member_activity (user_id, kind, category, seconds, detail, value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [input.userId, row.kind, row.category, row.seconds, row.detail, row.value ?? null],
        );
        return;
      } catch (error) {
        this.logger.warn(`activity write failed: ${(error as Error).message}`);
        return;
      }
    }

    const existing = this.memory.get(input.userId) ?? [];
    existing.push(row);
    this.memory.set(input.userId, existing);
  }

  async dashboard(userId: string): Promise<Dashboard & { rewards: Rewards }> {
    const today = dayKey(new Date());
    let rows: ActivityRow[] = [];

    if (this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT kind, category, seconds, on_day, at, detail, value
           FROM member_activity
           WHERE user_id = $1 AND on_day >= current_date - interval '13 days'
           ORDER BY at ASC`,
          [userId],
        );
        rows = result.rows.map((r) => ({
          kind: String(r.kind) as ActivityKind,
          category: r.category == null ? null : String(r.category),
          seconds: Number(r.seconds ?? 0),
          onDay: r.on_day instanceof Date ? r.on_day.toISOString().slice(0, 10) : String(r.on_day).slice(0, 10),
          at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
          detail: String(r.detail ?? ''),
          value: r.value == null ? null : Number(r.value),
        }));
      } catch (error) {
        this.logger.warn(`activity read failed: ${(error as Error).message}`);
      }
    } else {
      rows = this.memory.get(userId) ?? [];
    }

    // Rewards are composed here rather than inside buildDashboard so the
    // pure day maths stays importable by the type-stripping test runner.
    const dashboard = buildDashboard(rows, today);
    const inWindow = rows.filter((r) => r.onDay >= dashboard.days[0]!.day);
    return {
      ...dashboard,
      rewards: computeRewards(inWindow, dashboard.days, userId, dashboard.streak),
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
