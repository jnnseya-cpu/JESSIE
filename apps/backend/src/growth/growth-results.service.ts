import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GrowthResult, GrowthToolId, PlatformId } from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * What a partner published, and what it did.
 *
 * The four measuring tools are only as honest as this table. Every number
 * in it was observed by somebody — the partner reading their own network's
 * figures, or the platform counting a signup that arrived through their
 * link. Nothing is modelled and nothing is filled in, which is what makes
 * "not enough data yet" a true statement rather than a stalling tactic.
 *
 * The funnel constraint lives in the database rather than here on purpose.
 * More clicks than people reached is not a validation preference, it is
 * two different sources of truth pasted together, and every rate computed
 * from it afterwards is nonsense presented to somebody making decisions.
 */
@Injectable()
export class GrowthResultsService implements OnModuleDestroy {
  private readonly logger = new Logger(GrowthResultsService.name);
  private readonly memory = new Map<string, GrowthResult[]>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('growth results: in-memory — campaign history will not survive a restart');
    }
  }

  async record(
    partnerId: string,
    input: {
      toolId?: GrowthToolId | null;
      platform?: PlatformId | null;
      campaign?: string | null;
      subject?: string | null;
      postedAt?: string;
      reach: number;
      clicks: number;
      signups: number;
      paid: number;
    },
  ): Promise<GrowthResult> {
    const row: GrowthResult = {
      id: `gr_${randomUUID().slice(0, 12)}`,
      partnerId,
      toolId: input.toolId ?? null,
      platform: input.platform ?? null,
      campaign: input.campaign?.trim() || null,
      subject: input.subject?.trim() || null,
      postedAt: input.postedAt ?? new Date().toISOString(),
      reach: input.reach,
      clicks: input.clicks,
      signups: input.signups,
      paid: input.paid,
    };

    // Checked here as well as in the database, so the partner gets a
    // sentence they can act on instead of a constraint-violation string.
    if (row.clicks > row.reach || row.signups > row.clicks || row.paid > row.signups) {
      throw new BadRequestException(
        'the funnel only narrows: clicks cannot exceed reach, signups cannot exceed clicks, ' +
          'and paid cannot exceed signups. Numbers that break that came from two different ' +
          'places, and every rate worked out from them would be wrong.',
      );
    }

    if (!this.pool) {
      this.memory.set(partnerId, [...(this.memory.get(partnerId) ?? []), row]);
      return row;
    }

    await this.pool.query(
      `INSERT INTO growth_results
         (id, partner_id, tool_id, platform, campaign, subject, posted_at, reach, clicks, signups, paid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.id,
        partnerId,
        row.toolId,
        row.platform,
        row.campaign,
        row.subject,
        row.postedAt,
        row.reach,
        row.clicks,
        row.signups,
        row.paid,
      ],
    );
    return row;
  }

  async forPartner(partnerId: string): Promise<GrowthResult[]> {
    if (!this.pool) return this.memory.get(partnerId) ?? [];
    try {
      const result = await this.pool.query(
        `SELECT id, partner_id, tool_id, platform, campaign, subject, posted_at,
                reach, clicks, signups, paid
           FROM growth_results
          WHERE partner_id = $1
          ORDER BY posted_at DESC
          LIMIT 5000`,
        [partnerId],
      );
      return result.rows.map((r) => ({
        id: String(r.id),
        partnerId: String(r.partner_id),
        toolId: (r.tool_id as GrowthToolId | null) ?? null,
        platform: (r.platform as PlatformId | null) ?? null,
        campaign: r.campaign === null ? null : String(r.campaign),
        subject: r.subject === null ? null : String(r.subject),
        postedAt: r.posted_at instanceof Date ? r.posted_at.toISOString() : String(r.posted_at),
        reach: Number(r.reach),
        clicks: Number(r.clicks),
        signups: Number(r.signups),
        paid: Number(r.paid),
      }));
    } catch (error) {
      // A read that failed is not an empty history. Returning [] would
      // make every measuring tool say "not enough data" and send a partner
      // off to collect results they already have.
      this.logger.error(`growth results read: ${(error as Error).message}`);
      throw error;
    }
  }

  async remove(partnerId: string, id: string): Promise<{ removed: boolean }> {
    if (!this.pool) {
      const held = this.memory.get(partnerId) ?? [];
      const kept = held.filter((r) => r.id !== id);
      this.memory.set(partnerId, kept);
      return { removed: kept.length !== held.length };
    }
    const result = await this.pool.query(
      'DELETE FROM growth_results WHERE partner_id = $1 AND id = $2 RETURNING id',
      [partnerId, id],
    );
    return { removed: result.rows.length > 0 };
  }

  /** Keeps a generated draft, so a partner can come back to it. */
  async saveOutput(
    partnerId: string,
    output: {
      toolId: GrowthToolId;
      platform: PlatformId | null;
      brief: string;
      output: unknown;
      passed: boolean;
      problems: readonly string[];
      acuSpent: number;
    },
  ): Promise<string> {
    const id = `go_${randomUUID().slice(0, 12)}`;
    if (!this.pool) return id;
    try {
      await this.pool.query(
        `INSERT INTO growth_outputs
           (id, partner_id, tool_id, platform, brief, output, passed, problems, acu_spent)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)`,
        [
          id,
          partnerId,
          output.toolId,
          output.platform,
          output.brief.slice(0, 4000),
          JSON.stringify(output.output ?? {}),
          output.passed,
          JSON.stringify(output.problems),
          output.acuSpent,
        ],
      );
    } catch (error) {
      // A draft that failed to save is still a draft the partner is
      // looking at. Losing the record is a gap in an audit trail, not a
      // reason to fail the request they are waiting on.
      this.logger.warn(`growth output write: ${(error as Error).message}`);
    }
    return id;
  }

  async outputs(partnerId: string, limit = 25): Promise<Record<string, unknown>[]> {
    if (!this.pool) return [];
    try {
      const result = await this.pool.query(
        `SELECT id, tool_id, platform, brief, output, passed, problems, acu_spent, created_at
           FROM growth_outputs
          WHERE partner_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [partnerId, limit],
      );
      return result.rows.map((r) => ({
        id: String(r.id),
        toolId: String(r.tool_id),
        platform: r.platform === null ? null : String(r.platform),
        brief: String(r.brief),
        output: r.output,
        passed: Boolean(r.passed),
        problems: r.problems,
        acuSpent: Number(r.acu_spent),
        createdAt:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));
    } catch (error) {
      this.logger.warn(`growth outputs read: ${(error as Error).message}`);
      return [];
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
