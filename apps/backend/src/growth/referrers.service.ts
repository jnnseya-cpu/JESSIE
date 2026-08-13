import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  isValidReferrerCode,
  type ReferrerKind,
  type ReferrerRecord,
} from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * Codes for the organisations that already have the people.
 *
 * A small table and a small service, deliberately. The value is not in the
 * software — it is in a link worker being willing to hand something over,
 * and what makes them willing is the page behind the code rather than
 * anything in this file. All this does is resolve a code to a name, so the
 * page can say "you were sent here by Camden Falls Prevention" and so a
 * report can say which route actually reached anybody.
 */
@Injectable()
export class ReferrersService implements OnModuleDestroy {
  private readonly logger = new Logger(ReferrersService.name);
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 1);
  }

  async create(input: { code: string; label: string; kind: ReferrerKind }): Promise<ReferrerRecord | null> {
    const code = input.code.trim().toLowerCase();
    if (!isValidReferrerCode(code) || !this.pool) return null;
    try {
      await this.pool.query(
        `INSERT INTO referrers (code, label, kind) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, kind = EXCLUDED.kind, active = true`,
        [code, input.label.trim().slice(0, 80), input.kind],
      );
      return { code, label: input.label.trim(), kind: input.kind, active: true };
    } catch (error) {
      this.logger.warn(`referrer create: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Resolve a code. Returns retired codes too, with `active: false`.
   *
   * A leaflet printed two years ago should reach something that explains
   * itself rather than a 404 — the person holding it did nothing wrong.
   */
  async find(code: string): Promise<ReferrerRecord | null> {
    const key = code.trim().toLowerCase();
    if (!isValidReferrerCode(key) || !this.pool) return null;
    try {
      const { rows } = await this.pool.query(
        `SELECT code, label, kind, active FROM referrers WHERE code = $1`,
        [key],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        code: String(row.code),
        label: String(row.label),
        kind: row.kind as ReferrerKind,
        active: Boolean(row.active),
      };
    } catch {
      return null;
    }
  }

  /**
   * Every code with what it has actually produced.
   *
   * Registrations against arrivals, per code. This is the number that says
   * which of these relationships is worth spending a morning on, and it is
   * the reason the codes exist at all — a route that brings forty people
   * and no accounts is telling you something specific about that route.
   */
  async report(days = 90): Promise<Record<string, unknown>> {
    if (!this.pool) return { available: false, referrers: [] };
    try {
      const { rows } = await this.pool.query(
        `SELECT r.code, r.label, r.kind, r.active,
                count(DISTINCT f.source) FILTER (WHERE f.step = 'landed')::int     AS arrived,
                count(DISTINCT f.source) FILTER (WHERE f.step = 'opened')::int     AS opened,
                count(*) FILTER (WHERE f.step = 'registered')::int                 AS registered
           FROM referrers r
           LEFT JOIN funnel_events f
             ON f.referrer_code = r.code
            AND f.at > now() - ($1 || ' days')::interval
          GROUP BY r.code, r.label, r.kind, r.active
          ORDER BY registered DESC, arrived DESC`,
        [String(days)],
      );
      return {
        available: true,
        windowDays: days,
        referrers: rows,
        note:
          'A route that brings people who never open the account page is a route reaching the ' +
          'wrong people, or a leaflet that promised something else. A route that brings few ' +
          'people who nearly all register is worth another morning.',
      };
    } catch (error) {
      this.logger.warn(`referrer report: ${(error as Error).message}`);
      return { available: false, referrers: [] };
    }
  }

  async retire(code: string): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query(`UPDATE referrers SET active = false WHERE code = $1`, [
        code.trim().toLowerCase(),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}
