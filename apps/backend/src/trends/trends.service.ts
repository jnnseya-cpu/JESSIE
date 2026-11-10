import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  SOURCE_FAMILY_DEFINITIONS,
  confidenceScore,
  corroborationScore,
  countFeedGate,
  decide,
  demandFromZ,
  freshnessScore,
  trendOpportunityScore,
  type Observation,
  type SourceFamily,
  type TrendOpportunityVeto,
  type TrendVerdict,
} from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * Reading demand from what this platform already knows.
 *
 * The scoring itself lives in `@jessmove/shared` because it is pure and
 * belongs with the rest of the business truth. This service is the part
 * that cannot be pure: it reads windows out of Postgres, decides which
 * observations are comparable, and freezes a snapshot so an approval has
 * something fixed to have been given against.
 *
 * It consults no external feed. Every signal the specification would
 * rather have — Search Console, Trends, Keyword Planner — needs a
 * credential this platform is not allowed to hold, so detection runs on
 * first-party evidence and the scoring is honest about what that costs:
 * with few independent families, most topics land in `watch`.
 */

/** Bumped when the scoring changes, so old snapshots stay readable. */
export const SCORING_VERSION = 1;

/** The number of complete prior windows a baseline is built from. */
export const BASELINE_WINDOWS = 8;

export interface TopicProfile {
  readonly topicId: string;
  /** 0–100, from the platform's own topic map. Verified, never inferred. */
  readonly fit: number;
  readonly intent: number;
  /** Whether an approved asset and an approved claim exist right now. */
  readonly readiness: number;
  readonly vetoes: readonly TrendOpportunityVeto[];
}

export interface ScoredTopic {
  readonly topicId: string;
  readonly verdict: TrendVerdict;
  readonly breakdown: {
    readonly demand: number;
    readonly fit: number;
    readonly intent: number;
    readonly timing: number;
    readonly readiness: number;
  };
  readonly confidenceInputs: {
    readonly sourceQuality: number;
    readonly corroboration: number;
    readonly coverage: number;
    readonly freshness: number;
    readonly independentFamilies: number;
  };
  /** Why each family did or did not contribute. Shown, not summarised. */
  readonly families: readonly {
    readonly family: SourceFamily;
    readonly current: number;
    readonly baselinePeriods: number;
    readonly contributed: boolean;
    readonly why: string;
  }[];
  readonly evidenceIds: readonly string[];
  readonly windowEnd: string | null;
}

export interface IngestResult {
  readonly accepted: number;
  readonly duplicate: number;
  readonly rejected: readonly { readonly index: number; readonly why: string }[];
}

@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);
  private readonly pool: PgPoolLike | null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  get available(): boolean {
    return this.pool !== null;
  }

  /**
   * Take a batch of observations, and say what happened to each.
   *
   * A duplicate is not an error and not an acceptance. The specification
   * is specific about returning all three counts, and the reason is that
   * a producer retrying a batch needs to know its retry was understood as
   * a retry — otherwise it either gives up or sends again.
   */
  async ingest(observations: readonly Observation[]): Promise<IngestResult> {
    if (!this.pool) {
      return {
        accepted: 0,
        duplicate: 0,
        rejected: observations.map((_, index) => ({
          index,
          why: 'no database configured, so nothing was stored',
        })),
      };
    }

    let accepted = 0;
    let duplicate = 0;
    const rejected: { index: number; why: string }[] = [];

    for (const [index, o] of observations.entries()) {
      if (!(Date.parse(o.windowStart) < Date.parse(o.windowEnd))) {
        rejected.push({ index, why: 'window start must be before window end' });
        continue;
      }
      try {
        const { rows } = await this.pool.query(
          `INSERT INTO trend_observations
             (source_id, source_family, source_record_id, topic_id, metric, value,
              unit, observed_at, window_start, window_end, coverage,
              evidence_hash, evidence_uri)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (source_id, source_record_id) DO NOTHING
           RETURNING id`,
          [
            o.sourceId,
            o.sourceFamily,
            o.sourceRecordId,
            o.topicId,
            o.metric,
            o.value,
            o.unit,
            o.observedAt,
            o.windowStart,
            o.windowEnd,
            o.coverage,
            o.evidenceHash ?? null,
            o.evidenceUri ?? null,
          ],
        );
        // No row back means the conflict clause caught a replay. Read from
        // `rows` rather than `rowCount` so this does not depend on a driver
        // field the pool interface does not promise.
        if (rows.length === 0) duplicate += 1;
        else accepted += 1;
      } catch (error) {
        // A constraint refusal is information, not an outage. It names the
        // promise the payload broke.
        rejected.push({ index, why: (error as Error).message });
      }
    }

    return { accepted, duplicate, rejected };
  }

  /**
   * Score one topic against its own history.
   *
   * Each source family is treated separately and then combined, because a
   * family agreeing with itself is not corroboration. A family that
   * cannot clear its gates is reported with the reason rather than
   * dropped, so a reader can tell "no evidence" from "evidence that did
   * not move".
   */
  async score(profile: TopicProfile, now = new Date()): Promise<ScoredTopic> {
    const families: {
      family: SourceFamily;
      current: number;
      baselinePeriods: number;
      contributed: boolean;
      why: string;
    }[] = [];
    const demands: number[] = [];
    const qualities: number[] = [];
    const coverages: number[] = [];
    const freshnesses: number[] = [];
    const evidenceIds: string[] = [];
    let independentFamilies = 0;
    let latestWindowEnd: string | null = null;

    for (const family of Object.keys(SOURCE_FAMILY_DEFINITIONS) as SourceFamily[]) {
      const windows = await this.familyWindows(profile.topicId, family);
      if (windows.length === 0) {
        families.push({
          family,
          current: 0,
          baselinePeriods: 0,
          contributed: false,
          why: 'No observations. Unknown, not zero interest.',
        });
        continue;
      }

      const [current, ...history] = windows;
      const gate = countFeedGate(
        current!.value,
        history.map((w) => w.value),
      );

      if (!gate.open) {
        families.push({
          family,
          current: current!.value,
          baselinePeriods: history.length,
          contributed: false,
          why: gate.detail,
        });
        continue;
      }

      const definition = SOURCE_FAMILY_DEFINITIONS[family];
      const hoursSinceClose =
        (now.getTime() - Date.parse(current!.windowEnd)) / 3_600_000;

      demands.push(demandFromZ(gate.z));
      qualities.push(definition.quality);
      coverages.push(current!.coverage * 100);
      freshnesses.push(freshnessScore(hoursSinceClose, definition.staleAfterHours));
      evidenceIds.push(...current!.evidenceIds);

      // Context-only families inform the demand picture and corroborate
      // nothing. Attention is not intent, and counting it as a second
      // opinion is how one signal looks like two.
      if (!definition.contextOnly) independentFamilies += 1;

      if (!latestWindowEnd || current!.windowEnd > latestWindowEnd) {
        latestWindowEnd = current!.windowEnd;
      }

      families.push({
        family,
        current: current!.value,
        baselinePeriods: history.length,
        contributed: true,
        why: `z of ${gate.z.toFixed(2)} on ${current!.value} observations.`,
      });
    }

    const demand = demands.length > 0 ? medianOf(demands) : 0;
    const breakdown = {
      demand,
      fit: profile.fit,
      intent: profile.intent,
      timing: latestWindowEnd
        ? freshnessScore(
            (now.getTime() - Date.parse(latestWindowEnd)) / 3_600_000,
            SOURCE_FAMILY_DEFINITIONS.funnel.staleAfterHours,
          )
        : 0,
      readiness: profile.readiness,
    };

    const confidenceInputs = {
      sourceQuality: qualities.length > 0 ? meanOf(qualities) : 0,
      corroboration: corroborationScore(independentFamilies),
      coverage: coverages.length > 0 ? meanOf(coverages) : 0,
      freshness: freshnesses.length > 0 ? meanOf(freshnesses) : 0,
      independentFamilies,
    };

    /*
     * Readiness of zero is a veto, not a low score. The specification is
     * explicit: missing readiness blocks activation. A topic with no
     * approved asset and no approved claim cannot be acted on at all, and
     * averaging that away into an 80 is exactly how an unservable topic
     * reaches a reviewer looking actionable.
     */
    const vetoes: TrendOpportunityVeto[] = [...profile.vetoes];
    if (profile.readiness <= 0 && !vetoes.includes('readiness_missing')) {
      vetoes.push('readiness_missing');
    }

    return {
      topicId: profile.topicId,
      verdict: decide(
        trendOpportunityScore(breakdown),
        confidenceScore(confidenceInputs),
        vetoes,
      ),
      breakdown,
      confidenceInputs,
      families,
      evidenceIds,
      windowEnd: latestWindowEnd,
    };
  }

  /**
   * Freeze a score, so an approval has fixed evidence behind it.
   *
   * Keyed by the inputs that produced it, so rescoring the same window
   * with the same data is a no-op and a change of scoring version
   * supersedes rather than overwrites. An experiment whose evidence can
   * be edited afterwards is not evidence.
   */
  async snapshot(scored: ScoredTopic): Promise<{ id: string | null; frozen: boolean }> {
    if (!this.pool || !scored.windowEnd) return { id: null, frozen: false };

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          breakdown: scored.breakdown,
          confidence: scored.confidenceInputs,
          evidence: [...scored.evidenceIds].sort(),
        }),
      )
      .digest('hex');

    const { rows } = await this.pool.query(
      `INSERT INTO trend_opportunity_snapshots
         (topic_id, window_end, scoring_version, input_digest, demand, fit,
          intent, timing, readiness, opportunity, confidence,
          independent_families, decision, vetoes, why, evidence_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (topic_id, window_end, scoring_version, input_digest)
         DO UPDATE SET topic_id = EXCLUDED.topic_id
       RETURNING id`,
      [
        scored.topicId,
        scored.windowEnd,
        SCORING_VERSION,
        digest,
        scored.breakdown.demand,
        scored.breakdown.fit,
        scored.breakdown.intent,
        scored.breakdown.timing,
        scored.breakdown.readiness,
        scored.verdict.opportunity,
        scored.verdict.confidence,
        scored.confidenceInputs.independentFamilies,
        scored.verdict.decision,
        JSON.stringify(scored.verdict.vetoes),
        scored.verdict.why,
        JSON.stringify(scored.evidenceIds),
      ],
    );
    return { id: rows[0]?.id ? String(rows[0].id) : null, frozen: true };
  }

  /**
   * Read back a frozen snapshot.
   *
   * A brief is drafted from one of these rather than from a fresh score,
   * so the evidence a reviewer approves is the evidence that was scored.
   * Rescoring at draft time would mean the numbers on the approval screen
   * were not the numbers the decision was made from.
   */
  async readSnapshot(snapshotId: string): Promise<{
    topicId: string;
    opportunity: number;
    confidence: number;
    decision: string;
    evidenceIds: string[];
    vetoes: string[];
  } | null> {
    if (!this.pool) return null;
    const { rows } = await this.pool.query(
      `SELECT topic_id, opportunity, confidence, decision, evidence_ids, vetoes
         FROM trend_opportunity_snapshots WHERE id = $1`,
      [snapshotId],
    );
    if (!rows[0]) return null;
    return {
      topicId: String(rows[0].topic_id),
      opportunity: Number(rows[0].opportunity),
      confidence: Number(rows[0].confidence),
      decision: String(rows[0].decision),
      evidenceIds: Array.isArray(rows[0].evidence_ids)
        ? (rows[0].evidence_ids as string[])
        : [],
      vetoes: Array.isArray(rows[0].vetoes) ? (rows[0].vetoes as string[]) : [],
    };
  }

  /**
   * Complete windows for one family, newest first.
   *
   * Only windows that have closed. A window still open is a partial count
   * and comparing it against eight complete ones manufactures a decline
   * every single time it is read.
   */
  private async familyWindows(
    topicId: string,
    family: SourceFamily,
  ): Promise<
    { value: number; windowEnd: string; coverage: number; evidenceIds: string[] }[]
  > {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `SELECT window_end,
              SUM(value)       AS value,
              AVG(coverage)    AS coverage,
              array_agg(id::text) AS evidence_ids
         FROM trend_observations
        WHERE topic_id = $1 AND source_family = $2 AND window_end <= now()
        GROUP BY window_end
        ORDER BY window_end DESC
        LIMIT $3`,
      [topicId, family, BASELINE_WINDOWS + 1],
    );
    return rows.map((r) => ({
      value: Number(r.value),
      windowEnd: new Date(r.window_end as string).toISOString(),
      coverage: Number(r.coverage),
      evidenceIds: (r.evidence_ids as string[]) ?? [],
    }));
  }
}

function meanOf(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Median, with the specification's deterministic tie-break.
 *
 * Local rather than imported because the shared `median` is the
 * statistical one used by the scoring; this one exists to combine already
 * normalised per-family demand scores, and keeping them separate means a
 * change to one cannot silently alter the other.
 */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}
