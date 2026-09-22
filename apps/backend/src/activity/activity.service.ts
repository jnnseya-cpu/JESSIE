import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { computeRewards, type Rewards } from './rewards.logic';
import {
  buildDashboard,
  dayKey,
  BODY_READING_DAYS,
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

  /**
   * How many prompts this member has already had today, and how long ago
   * the last one was.
   *
   * These two numbers decide whether the engine is allowed to speak, and
   * they used to arrive in the request body. The browser sent
   * `snapsDeliveredToday: 0` and `minutesSinceLastNudge: 120` on every
   * call, so the daily cap — described on the marketing page as "a hard
   * ceiling the engine may never exceed" — was a ceiling the caller set
   * for itself. Anything that decides whether a health product may
   * interrupt somebody has to be counted where the caller cannot reach
   * it.
   *
   * `snap_held` counts towards the interval but not towards the cap: a
   * held prompt is one the engine decided not to send, so it is evidence
   * about timing and not a delivery.
   */
  async nudgeState(userId: string): Promise<{ deliveredToday: number; minutesSinceLastNudge: number }> {
    const FAR = 24 * 60;

    if (this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT
             count(*) FILTER (
               WHERE kind = 'snap_offered' AND on_day = current_date
             ) AS delivered_today,
             max(at) FILTER (
               WHERE kind IN ('snap_offered', 'snap_held')
             ) AS last_nudge
           FROM member_activity
           WHERE user_id = $1`,
          [userId],
        );
        const row = result.rows[0] ?? {};
        const last = row.last_nudge == null ? null : new Date(String(row.last_nudge));
        return {
          deliveredToday: Number(row.delivered_today ?? 0),
          minutesSinceLastNudge:
            last && !Number.isNaN(last.getTime())
              ? Math.max(0, Math.floor((Date.now() - last.getTime()) / 60_000))
              : FAR,
        };
      } catch (error) {
        /*
         * A cap that cannot be read must not become an uncapped engine.
         * Reporting the cap as already reached makes the failure a silence
         * rather than a flood, which is the safe direction for a product
         * that pushes notifications at people.
         */
        this.logger.error(`nudge state read failed, treating the cap as reached: ${(error as Error).message}`);
        return { deliveredToday: Number.MAX_SAFE_INTEGER, minutesSinceLastNudge: 0 };
      }
    }

    const rows = this.memory.get(userId) ?? [];
    const today = dayKey(new Date());
    const nudges = rows.filter((r) => r.kind === 'snap_offered' || r.kind === 'snap_held');
    const last = nudges.length ? new Date(nudges[nudges.length - 1]!.at).getTime() : null;
    return {
      deliveredToday: rows.filter((r) => r.kind === 'snap_offered' && r.onDay === today).length,
      minutesSinceLastNudge: last ? Math.max(0, Math.floor((Date.now() - last) / 60_000)) : FAR,
    };
  }

  /**
   * A member's own weight readings, over a horizon long enough to be a
   * trajectory.
   *
   * `dashboard()` reads a fourteen-day window, which is right for
   * completion curves and useless for weight: two weeks of readings
   * cannot distinguish a plateau from noise, and that distinction is the
   * whole point of the trend. So this is a separate read with its own
   * horizon rather than a widening of the dashboard's.
   *
   * It exists because the readings had two homes. Every reading was
   * written here *and* kept in a `member_state` blob, and the account
   * page computed its trend from the blob — which meant the warnings
   * `warningsFor` produces, including a `stop`, were derived from an
   * array the client had sent us rather than from what the member
   * actually recorded. Both stores are durable; only one of them is a
   * record.
   *
   * One reading per day, latest wins. Somebody who weighs themselves
   * twice on a Tuesday has not created two days of trend.
   */
  async readings(userId: string, days = BODY_READING_DAYS): Promise<{ day: string; kg: number }[]> {
    const horizon = Math.max(1, Math.min(Math.floor(days), 3650));
    let rows: { day: string; kg: number; at: string }[] = [];

    if (this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT on_day, value, at
             FROM member_activity
            WHERE user_id = $1
              AND kind = 'body_read'
              AND value IS NOT NULL
              AND on_day >= current_date - make_interval(days => $2)
            ORDER BY at ASC`,
          [userId, horizon],
        );
        rows = result.rows.map((r) => ({
          day: r.on_day instanceof Date ? r.on_day.toISOString().slice(0, 10) : String(r.on_day).slice(0, 10),
          kg: Number(r.value),
          at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
        }));
      } catch (error) {
        this.logger.warn(`reading history failed: ${(error as Error).message}`);
        return [];
      }
    } else {
      const cutoff = dayKey(new Date(Date.now() - horizon * 86_400_000));
      rows = (this.memory.get(userId) ?? [])
        .filter((r) => r.kind === 'body_read' && typeof r.value === 'number' && r.onDay >= cutoff)
        .map((r) => ({ day: r.onDay, kg: r.value as number, at: r.at }));
    }

    const latestPerDay = new Map<string, { day: string; kg: number }>();
    for (const row of rows) latestPerDay.set(row.day, { day: row.day, kg: row.kg });
    return [...latestPerDay.values()].sort((a, b) => a.day.localeCompare(b.day));
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
