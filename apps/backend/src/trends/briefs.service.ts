import { Injectable, Logger } from '@nestjs/common';
import {
  AVAILABLE_BRIEF_CHANNELS,
  BRIEF_EXPIRY_HOURS,
  checkBrief,
  type BriefChannel,
  type GrowthBrief,
} from '@jessmove/shared';
import { makePool, withTransaction, type PgPoolLike } from '../db/pg';

/**
 * A refusal, thrown so it rolls the transaction back on its way out.
 *
 * Distinguished from a real fault because a refusal is an answer — "that
 * revision is not a draft" is the system working — and logging it as a
 * failure trains whoever reads the logs to ignore them.
 */
class BriefRefusal extends Error {}

/**
 * The one contract the agents share.
 *
 * Before this existed, the SEO agent and the communications router agreed
 * about nothing. Each decided its own audience, picked its own framing,
 * and chose its own moment, which is why the same week could produce an
 * article for people with stiff hips and a newsletter about something
 * else entirely. A brief is the thing that makes them agree, and the
 * version and expiry are what stop that agreement outliving its evidence.
 *
 * Two rules do the real work. A brief is served only while approved,
 * fresh and evidenced — checked on every resolution, and again
 * immediately before any write, because the gap between those two moments
 * is where a queue lives. And the claim and CTA are identifiers, never
 * text: the words are resolved from the approved revision server-side, so
 * a brief cannot carry a sentence nobody signed for.
 */
@Injectable()
export class BriefsService {
  private readonly logger = new Logger(BriefsService.name);
  private readonly pool: PgPoolLike | null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  /** Draft a brief from a frozen snapshot. Draft, never approved. */
  async draft(input: {
    snapshotId: string;
    topicId: string;
    opportunityScore: number;
    confidence: number;
    evidenceIds: readonly string[];
    audience: string;
    intent: string;
    approvedClaimIds: readonly string[];
    ctaId: string;
    allowedChannels: readonly BriefChannel[];
    prohibitedClaims: readonly string[];
    objective: string;
    policyVersion: number;
    breaking: boolean;
  }): Promise<{ briefId: string; briefVersion: number } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };

    const unavailable = input.allowedChannels.filter(
      (c) => !AVAILABLE_BRIEF_CHANNELS.includes(c),
    );
    if (unavailable.length > 0) {
      return {
        refused:
          `No adapter for ${unavailable.join(', ')}. A brief naming a channel ` +
          'nothing can act on would read as a capability this platform has.',
      };
    }

    const hours = input.breaking
      ? BRIEF_EXPIRY_HOURS.breaking
      : BRIEF_EXPIRY_HOURS.persistent;
    const validFrom = new Date();
    const expiresAt = new Date(validFrom.getTime() + hours * 3_600_000);

    /*
     * A new version rather than an edit. The previous revision stays
     * readable because an action already approved against it has to
     * remain explicable after the brief moves on.
     */
    const { rows: prior } = await this.pool.query(
      `SELECT brief_id, MAX(brief_version) AS v FROM growth_briefs
        WHERE topic_id = $1 GROUP BY brief_id LIMIT 1`,
      [input.topicId],
    );
    const briefId = prior[0]?.brief_id
      ? String(prior[0].brief_id)
      : `gb_${input.topicId.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}`;
    const briefVersion = prior[0]?.v ? Number(prior[0].v) + 1 : 1;

    await this.pool.query(
      `INSERT INTO growth_briefs
         (brief_id, brief_version, snapshot_id, topic_id, opportunity_score,
          confidence, valid_from, expires_at, evidence_ids, audience, intent,
          approved_claim_ids, cta_id, allowed_channels, prohibited_claims,
          objective, policy_version, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft')`,
      [
        briefId,
        briefVersion,
        input.snapshotId,
        input.topicId,
        input.opportunityScore,
        input.confidence,
        validFrom.toISOString(),
        expiresAt.toISOString(),
        JSON.stringify(input.evidenceIds),
        input.audience,
        input.intent,
        JSON.stringify(input.approvedClaimIds),
        input.ctaId,
        JSON.stringify(input.allowedChannels),
        JSON.stringify(input.prohibitedClaims),
        input.objective,
        input.policyVersion,
      ],
    );
    return { briefId, briefVersion };
  }

  /**
   * Approve one exact revision, in the name of one person.
   *
   * The reviewer is recorded rather than inferred from whoever held an
   * admin session, which is the same rule the editorial pipeline already
   * applies to a post. Approving supersedes any previously approved
   * revision for the topic in the same transaction, so the partial unique
   * index never sees two active briefs and the swap cannot half-happen.
   */
  async approve(
    briefId: string,
    briefVersion: number,
    approver: string,
  ): Promise<{ approved: true } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };
    if (!approver.trim()) return { refused: 'an approval needs a named person' };

    try {
      return await withTransaction(this.pool, async (client) => {
        const { rows } = await client.query(
          `SELECT topic_id, status, expires_at FROM growth_briefs
            WHERE brief_id = $1 AND brief_version = $2 FOR UPDATE`,
          [briefId, briefVersion],
        );
        const brief = rows[0];
        if (!brief) throw new BriefRefusal('no such brief revision');
        if (brief.status !== 'draft') {
          throw new BriefRefusal(`that revision is ${String(brief.status)}, not a draft`);
        }
        if (Date.parse(String(brief.expires_at)) <= Date.now()) {
          throw new BriefRefusal(
            'that revision has already expired. Rescore the topic rather than ' +
              'approving evidence that is out of date.',
          );
        }

        await client.query(
          `UPDATE growth_briefs SET status = 'superseded'
            WHERE topic_id = $1 AND status = 'approved'`,
          [brief.topic_id],
        );
        await client.query(
          `UPDATE growth_briefs
              SET status = 'approved', approved_by = $3, approved_at = now()
            WHERE brief_id = $1 AND brief_version = $2`,
          [briefId, briefVersion, approver.trim()],
        );
        return { approved: true as const };
      });
    } catch (error) {
      if (!(error instanceof BriefRefusal)) {
        this.logger.warn(`brief approval failed: ${(error as Error).message}`);
      }
      return { refused: (error as Error).message };
    }
  }

  /**
   * Resolve the one brief an agent should act on, or nothing.
   *
   * Nothing is a legitimate, common answer and is reported as such rather
   * than as a failure — an agent with no brief falls back to its baseline
   * behaviour, which is the correct thing for it to do and must not look
   * like an outage.
   */
  async effective(
    topicId: string,
    channel: BriefChannel,
    now = new Date(),
  ): Promise<
    | { brief: GrowthBrief }
    | { brief: null; why: string }
  > {
    if (!this.pool) return { brief: null, why: 'no database configured' };

    const { rows } = await this.pool.query(
      `SELECT * FROM growth_briefs
        WHERE topic_id = $1 AND status = 'approved'
        ORDER BY brief_version DESC LIMIT 1`,
      [topicId],
    );
    if (!rows[0]) {
      return { brief: null, why: 'no approved brief for that topic' };
    }

    const brief = rowToBrief(rows[0]);
    const check = checkBrief(brief, now, channel);
    if (!check.ok) return { brief: null, why: check.why };
    return { brief };
  }

  /** The brief behind an action, re-read at execution time. */
  async revision(briefId: string, briefVersion: number): Promise<GrowthBrief | null> {
    if (!this.pool) return null;
    const { rows } = await this.pool.query(
      `SELECT * FROM growth_briefs WHERE brief_id = $1 AND brief_version = $2`,
      [briefId, briefVersion],
    );
    return rows[0] ? rowToBrief(rows[0]) : null;
  }
}

export function rowToBrief(row: Record<string, unknown>): GrowthBrief {
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? (value as string[]) : [];
  return {
    schemaVersion: 1,
    briefId: String(row.brief_id),
    briefVersion: Number(row.brief_version),
    topicId: String(row.topic_id),
    opportunityScore: Number(row.opportunity_score),
    confidence: Number(row.confidence),
    validFrom: new Date(String(row.valid_from)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    evidenceIds: list(row.evidence_ids),
    audience: String(row.audience),
    intent: String(row.intent),
    approvedClaimIds: list(row.approved_claim_ids),
    ctaId: String(row.cta_id),
    allowedChannels: list(row.allowed_channels) as BriefChannel[],
    prohibitedClaims: list(row.prohibited_claims),
    objective: String(row.objective),
    experimentId: row.experiment_id ? String(row.experiment_id) : null,
    policyVersion: Number(row.policy_version),
    approvedBy: row.approved_by ? String(row.approved_by) : '',
  };
}
