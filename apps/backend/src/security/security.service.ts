import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EVENT_SEVERITY, type SecurityEvent, type SecurityEventKind } from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * The record of what was refused.
 *
 * Three properties, each of which is a decision rather than an accident:
 *
 * **Recording never fails the request.** Every write is fire-and-forget
 * behind a catch. A database hiccup must not be the reason somebody cannot
 * sign in, and a security log that can take the platform down is a denial
 * of service we built ourselves.
 *
 * **The source is hashed, with a salt that changes daily.** The questions
 * this log has to answer are "is this the same caller as ten minutes ago"
 * and "how many distinct callers", both of which a hash answers. The
 * question it must not be able to answer is "where has this person been
 * for the last three months", so the salt rotates and yesterday's rows
 * stop correlating with today's. This is the same construction the blog's
 * view counter uses, for the same reason.
 *
 * **Rows expire.** Ninety days, swept on write rather than by a scheduler,
 * because a deployment without a cron is exactly the deployment where a
 * log quietly becomes permanent.
 */
@Injectable()
export class SecurityService implements OnModuleDestroy {
  private readonly logger = new Logger(SecurityService.name);
  private pool: PgPoolLike | null = null;

  /** Kept when there is no database, so the local pilot still shows something. */
  private readonly memory: (SecurityEvent & { severity: string })[] = [];

  private salt = randomBytes(16).toString('hex');
  private saltDay = new Date().toISOString().slice(0, 10);
  private lastSweep = 0;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) this.pool = makePool(url, 2);
  }

  /**
   * A stable-for-today, useless-tomorrow identifier for a caller.
   *
   * The raw value never outlives this call — it is not held in a field, not
   * logged, and not passed on.
   */
  private fingerprint(source: string): string {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.saltDay) {
      this.salt = randomBytes(16).toString('hex');
      this.saltDay = today;
    }
    return createHash('sha256').update(`${this.salt}:${source}`).digest('hex').slice(0, 24);
  }

  /**
   * Record a refusal. Never throws, never awaited by a caller on the hot
   * path, never the reason a request fails.
   */
  record(event: SecurityEvent & { userId?: string | null }): void {
    const severity = EVENT_SEVERITY[event.kind];
    const row = {
      ...event,
      severity,
      source: this.fingerprint(event.source),
      detail: event.detail.slice(0, 500),
    };

    if (!this.pool) {
      this.memory.push(row);
      if (this.memory.length > 500) this.memory.shift();
      return;
    }

    void this.pool
      .query(
        `INSERT INTO security_events (kind, severity, source, surface, detail, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.kind, severity, row.source, event.surface ?? null, row.detail, event.userId ?? null],
      )
      .then(() => this.sweep())
      .catch((error) => {
        // Logged at debug, not warn. A noisy security log that fills the
        // application log is how the real signal gets lost.
        this.logger.debug(`security event not stored: ${(error as Error).message}`);
      });
  }

  /** Ninety days, at most once an hour. */
  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < 3_600_000) return;
    this.lastSweep = now;
    void this.pool
      ?.query(`DELETE FROM security_events WHERE at < now() - interval '90 days'`)
      .catch(() => undefined);
  }

  /** The queue a reviewer or the agent reads: worst first, newest first. */
  async pending(limit = 40): Promise<Record<string, unknown>[]> {
    if (!this.pool) {
      return this.memory
        .slice(-limit)
        .reverse()
        .map((e) => ({ ...e, triage: null }));
    }
    try {
      const { rows } = await this.pool.query(
        `SELECT id, kind, severity, source, surface, detail, at, triage
           FROM security_events
          WHERE triage IS NULL
          ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, at DESC
          LIMIT $1`,
        [limit],
      );
      return rows;
    } catch {
      return [];
    }
  }

  /** Counts by kind over a window, for the summary a person actually reads. */
  async summary(hours = 24): Promise<{ kind: SecurityEventKind; severity: string; count: number }[]> {
    if (!this.pool) {
      const counts = new Map<string, number>();
      for (const e of this.memory) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
      return [...counts.entries()].map(([kind, count]) => ({
        kind: kind as SecurityEventKind,
        severity: EVENT_SEVERITY[kind as SecurityEventKind],
        count,
      }));
    }
    try {
      const { rows } = await this.pool.query(
        `SELECT kind, severity, count(*)::int AS count
           FROM security_events
          WHERE at > now() - ($1 || ' hours')::interval
          GROUP BY kind, severity
          ORDER BY count DESC`,
        [String(hours)],
      );
      return rows as unknown as { kind: SecurityEventKind; severity: string; count: number }[];
    } catch {
      return [];
    }
  }

  /** Attach what the agent wrote. Explanation only — it changes no access. */
  async triage(id: number, text: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE security_events SET triage = $2, triaged_at = now() WHERE id = $1`,
        [id, text.slice(0, 2000)],
      );
    } catch {
      /* an untriaged row is a visible gap, which is the safe failure */
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}
