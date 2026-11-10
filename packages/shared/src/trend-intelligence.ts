/**
 * Trend intelligence: reading demand, scoring it, and binding one brief.
 *
 * This is the folded form of the Trend Intelligence AI specification.
 * The spec describes a standalone, multi-tenant, resaleable engine with
 * installations, entitlements, metering, its own console and optional
 * self-hosted inference. None of that is built here, deliberately: this
 * platform is one product with one tenant, and a second multi-tenant API
 * architecture inside it would be duplicate architecture with no customer
 * on the other end of it.
 *
 * What is built is the part that was missing. The platform already has an
 * SEO agent that finds a topic gap, drafts, audits deterministically and
 * queues for a human; it already has a newsletter composer; it already
 * collects first-party reads and funnel steps. What it has never had is a
 * reason to act and a single contract the agents share. The SEO agent and
 * the communications router currently agree about nothing — not the
 * audience, not the claim, not the window. A brief fixes that.
 *
 * Three rules shape every decision in this file.
 *
 * **Nothing here can publish.** The specification offers a tier where a
 * high enough score plus a high enough confidence earns "bounded
 * automatic action", and floats automatically running a CTA variant on a
 * tenth of traffic. On a health platform that is a draft-to-published
 * edge, and there must not be one. The tier is implemented as priority
 * for a reviewer's attention and nothing else. `trend-intelligence.test.ts`
 * fails if an automatic outcome is ever added to the decision type.
 *
 * **A gap is unknown, never zero.** A feed that did not report is not a
 * feed reporting no interest. Every function here distinguishes absent
 * from zero and refuses to score what it cannot see.
 *
 * **No new vendor.** The specification's richest signals — Search
 * Console, Trends, Keyword Planner — each need a credential this platform
 * is not allowed to hold. So detection runs on first-party evidence
 * only, which the spec explicitly permits: "First-party events alone can
 * support a deployment when enough independent evidence is available."
 * The honest consequence is written into the scoring: with few
 * independent families, most topics will land in watch rather than in a
 * brief, and that is the correct answer rather than a limitation to
 * engineer around.
 */

/* ------------------------------------------------------------------ *
 * Source families
 * ------------------------------------------------------------------ */

/**
 * Where a signal can come from, and how much a single one is worth.
 *
 * Only first-party families, because every other family in the
 * specification needs a credential. `quality` is the 0–100 source-quality
 * input to confidence. A conversion is worth most because it is the
 * outcome itself rather than a proxy for it; engagement is worth least
 * because attention is not intent.
 *
 * `context_only` families can corroborate nothing — the spec is explicit
 * that a context source cannot satisfy the corroboration minimum, and
 * attention data is the classic case of a signal that looks like demand
 * and is not.
 */
export interface SourceFamilyDefinition {
  readonly family: SourceFamily;
  readonly name: string;
  readonly quality: number;
  /** Context corroborates nothing, however much of it there is. */
  readonly contextOnly: boolean;
  /** Hours after window close at which an observation is stale. */
  readonly staleAfterHours: number;
  readonly what: string;
}

export const SOURCE_FAMILIES = [
  'conversion',
  'funnel',
  'blog_engagement',
  'support_topic',
] as const;
export type SourceFamily = (typeof SOURCE_FAMILIES)[number];

export const SOURCE_FAMILY_DEFINITIONS: Readonly<
  Record<SourceFamily, SourceFamilyDefinition>
> = {
  conversion: {
    family: 'conversion',
    name: 'Completed conversions',
    quality: 95,
    contextOnly: false,
    staleAfterHours: 24 * 14,
    what: 'An account created or a plan taken. Recorded server-side, so it is the one family a browser cannot forge.',
  },
  funnel: {
    family: 'funnel',
    name: 'Funnel steps',
    quality: 75,
    contextOnly: false,
    staleAfterHours: 24 * 7,
    what: 'Landed, viewed the ask, opened, started. Written by the page, so it says what people did rather than what they wanted.',
  },
  blog_engagement: {
    family: 'blog_engagement',
    name: 'Engaged reads',
    quality: 60,
    contextOnly: true,
    staleAfterHours: 24 * 7,
    what: 'Reads that passed the dwell and scroll floor, by topic. Attention, not intent — which is why it cannot corroborate.',
  },
  support_topic: {
    family: 'support_topic',
    name: 'Support and enquiry topics',
    quality: 80,
    contextOnly: false,
    staleAfterHours: 24 * 30,
    what: 'Aggregated subjects people wrote in about. Closest thing here to a stated need, and the slowest to arrive.',
  },
};

/* ------------------------------------------------------------------ *
 * Observations
 * ------------------------------------------------------------------ */

/**
 * One normalised signal, with enough provenance to be argued with.
 *
 * The specification's observation schema, minus the tenant scope that a
 * single-tenant product does not have. Four separate times are kept on
 * purpose: when the thing happened, the window it was counted in, and
 * when it reached us. Collapsing them is how a late batch becomes a
 * spike.
 */
export interface Observation {
  readonly sourceId: string;
  readonly sourceFamily: SourceFamily;
  /** Stable per source, so a replay cannot inflate a count. */
  readonly sourceRecordId: string;
  readonly observedAt: string;
  /** Inclusive. */
  readonly windowStart: string;
  /** Exclusive. The spec's convention, kept so windows cannot overlap. */
  readonly windowEnd: string;
  /** Set on arrival, not by the producer — a sender cannot backdate itself. */
  readonly ingestedAt?: string;
  readonly topicId: string;
  readonly metric: string;
  readonly value: number;
  readonly unit: 'count' | 'rate' | 'index';
  /**
   * Observed divided by expected, 0–1. A proxy where a true denominator
   * does not exist, and recorded as a proxy rather than presented as a
   * measurement.
   */
  readonly coverage: number;
  readonly evidenceUri?: string;
  readonly evidenceHash?: string;
}

/* ------------------------------------------------------------------ *
 * Movement, robustly
 * ------------------------------------------------------------------ */

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Median absolute deviation. Resistant to the one outlier a mean is not. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const centre = median(values);
  return median(values.map((v) => Math.abs(v - centre)));
}

/**
 * Log lift of a current count against its baseline.
 *
 * The +1 is not cosmetic: without it a baseline of zero makes every lift
 * infinite, and a baseline of zero is the normal state of a topic nobody
 * has written about yet.
 */
export function logLift(current: number, baseline: number): number {
  return Math.log((current + 1) / (baseline + 1));
}

/**
 * How unusual the current count is, in robust standard deviations.
 *
 * The 1.4826 converts a median absolute deviation into a comparable
 * standard deviation for normally distributed data. The 0.2 floor stops a
 * perfectly flat history — a topic that was exactly 3 every week — from
 * dividing by zero and declaring the fourth week a miracle.
 */
export const MAD_TO_SIGMA = 1.4826;
export const Z_DENOMINATOR_FLOOR = 0.2;

export function robustZ(current: number, history: readonly number[]): number {
  if (history.length === 0) return Number.NaN;
  const logs = history.map((x) => Math.log1p(x));
  const spread = Math.max(
    MAD_TO_SIGMA * medianAbsoluteDeviation(logs),
    Z_DENOMINATOR_FLOOR,
  );
  return (Math.log1p(current) - median(logs)) / spread;
}

/* ------------------------------------------------------------------ *
 * Gates
 * ------------------------------------------------------------------ */

/** Minimum comparable periods before a baseline means anything. */
export const MIN_COMPARABLE_PERIODS = 4;

/** Initial count-feed gate. Adjustable per source, never per topic. */
export const COUNT_GATE = { minCount: 20, minZ: 2 } as const;

export type GateVerdict =
  | { readonly open: true; readonly z: number; readonly lift: number }
  | {
      readonly open: false;
      readonly why:
        | 'insufficient_history'
        | 'below_count_floor'
        | 'not_unusual_enough';
      readonly detail: string;
      readonly z: number | null;
      readonly lift: number | null;
    };

/**
 * Whether a count feed has moved enough to be worth a person's time.
 *
 * Two gates, because either alone is wrong. A count of 4 against a
 * baseline of 0 is a huge z and still four people. A count of 5,000
 * against a baseline of 5,000 is a big number and no news.
 */
export function countFeedGate(
  current: number,
  history: readonly number[],
  gate: { minCount: number; minZ: number } = COUNT_GATE,
): GateVerdict {
  if (history.length < MIN_COMPARABLE_PERIODS) {
    return {
      open: false,
      why: 'insufficient_history',
      detail:
        `${history.length} comparable periods, and a baseline needs at least ` +
        `${MIN_COMPARABLE_PERIODS}. This is unknown, not flat.`,
      z: null,
      lift: null,
    };
  }

  const z = robustZ(current, history);
  const lift = logLift(current, median(history));

  if (current < gate.minCount) {
    return {
      open: false,
      why: 'below_count_floor',
      detail: `${current} observations, under the floor of ${gate.minCount}.`,
      z,
      lift,
    };
  }
  if (!(z >= gate.minZ)) {
    return {
      open: false,
      why: 'not_unusual_enough',
      detail: `z of ${z.toFixed(2)}, under the floor of ${gate.minZ}.`,
      z,
      lift,
    };
  }
  return { open: true, z, lift };
}

/**
 * A count feed's z turned into a 0–100 demand component.
 *
 * The reference mapping from the specification, applied only after the
 * gates above. Clamped at both ends so a single enormous z cannot carry a
 * topic on its own.
 */
export function demandFromZ(z: number): number {
  return Math.min(100, Math.max(0, 50 + 10 * z));
}

/* ------------------------------------------------------------------ *
 * Opportunity
 * ------------------------------------------------------------------ */

/**
 * What a trend opportunity score is made of.
 *
 * Named `trend`-prefixed because `opportunityScore` is already taken in
 * this codebase, by `core-concepts.ts`, for something unrelated: whether
 * to prompt one member to move in the next few minutes. Two different
 * 'opportunities' sharing a name is how a reader ends up reading the
 * wrong function, so this one carries the qualifier and the older,
 * member-facing concept keeps the bare name.
 *
 * Demand and fit are equal and together are half the score, which is the
 * whole argument of the product: demand the platform cannot serve is not
 * an opportunity, however large.
 */
export const TREND_OPPORTUNITY_WEIGHTS = {
  demand: 0.25,
  fit: 0.25,
  intent: 0.2,
  timing: 0.15,
  readiness: 0.15,
} as const;

export interface TrendOpportunityInputs {
  readonly demand: number;
  readonly fit: number;
  readonly intent: number;
  readonly timing: number;
  readonly readiness: number;
}

/**
 * Hard vetoes. Each one is a reason no score can overcome.
 *
 * `unsupported_claim` and `restricted_topic` are the clinical ones and
 * the reason this list exists at all: a topic can be in genuine, rising,
 * well-evidenced demand and still be something this platform must not
 * say anything about.
 */
export const TREND_OPPORTUNITY_VETOES = [
  'out_of_market',
  'unsupported_claim',
  'restricted_topic',
  'no_approved_asset',
  'readiness_missing',
] as const;
export type TrendOpportunityVeto = (typeof TREND_OPPORTUNITY_VETOES)[number];

export function trendOpportunityScore(inputs: TrendOpportunityInputs): number {
  return (
    TREND_OPPORTUNITY_WEIGHTS.demand * inputs.demand +
    TREND_OPPORTUNITY_WEIGHTS.fit * inputs.fit +
    TREND_OPPORTUNITY_WEIGHTS.intent * inputs.intent +
    TREND_OPPORTUNITY_WEIGHTS.timing * inputs.timing +
    TREND_OPPORTUNITY_WEIGHTS.readiness * inputs.readiness
  );
}

/* ------------------------------------------------------------------ *
 * Confidence
 * ------------------------------------------------------------------ */

export const CONFIDENCE_WEIGHTS = {
  sourceQuality: 0.35,
  corroboration: 0.25,
  coverage: 0.2,
  freshness: 0.2,
} as const;

/**
 * What a lone source family is allowed to be worth.
 *
 * One family agreeing with itself is not corroboration, and a cap is the
 * only honest way to say so in a number. 69 keeps a single-family topic
 * permanently below the 75 a brief needs, whatever else is perfect about
 * it — which, on a platform whose signals are all first-party, is the
 * difference between a reader's opinion and a finding.
 */
export const SINGLE_FAMILY_CONFIDENCE_CAP = 69;

/** Corroboration by count of *independent, non-context* families. */
export function corroborationScore(independentFamilies: number): number {
  if (independentFamilies >= 3) return 100;
  if (independentFamilies === 2) return 80;
  return 0;
}

/**
 * Freshness: 100 at window close, falling linearly to 0 when stale.
 *
 * Linear rather than a cliff because a brief that was excellent at 23
 * hours and worthless at 25 describes no real phenomenon.
 */
export function freshnessScore(hoursSinceWindowClose: number, staleAfterHours: number): number {
  if (staleAfterHours <= 0) return 0;
  if (hoursSinceWindowClose <= 0) return 100;
  if (hoursSinceWindowClose >= staleAfterHours) return 0;
  return 100 * (1 - hoursSinceWindowClose / staleAfterHours);
}

export interface ConfidenceInputs {
  readonly sourceQuality: number;
  readonly corroboration: number;
  readonly coverage: number;
  readonly freshness: number;
  /**
   * Independent, non-context families contributing. Used only for the
   * single-family cap; the corroboration component is passed in so a
   * caller can show its working.
   */
  readonly independentFamilies: number;
}

export function confidenceScore(inputs: ConfidenceInputs): number {
  const raw =
    CONFIDENCE_WEIGHTS.sourceQuality * inputs.sourceQuality +
    CONFIDENCE_WEIGHTS.corroboration * inputs.corroboration +
    CONFIDENCE_WEIGHTS.coverage * inputs.coverage +
    CONFIDENCE_WEIGHTS.freshness * inputs.freshness;
  return inputs.independentFamilies <= 1
    ? Math.min(raw, SINGLE_FAMILY_CONFIDENCE_CAP)
    : raw;
}

/* ------------------------------------------------------------------ *
 * The decision
 * ------------------------------------------------------------------ */

/**
 * Every outcome a scored topic can reach.
 *
 * There is no automatic outcome, and this is the clinical safety control
 * rather than a conservative default. The specification's fourth band
 * makes a high enough score "eligible for bounded automatic action"; here
 * it earns `priority_review`, which moves a topic up a reviewer's queue
 * and does nothing else. Adding a member to this union that acts without
 * a person is the one change to this file that must never be made, and
 * `trend-intelligence.test.ts` pins the union by name so it cannot happen
 * quietly.
 */
export const TREND_DECISIONS = [
  'vetoed',
  'archive',
  'watch',
  'reviewable_brief',
  'priority_review',
] as const;
export type TrendDecision = (typeof TREND_DECISIONS)[number];

export const DECISION_CUTOFFS = {
  archiveBelowScore: 60,
  archiveBelowConfidence: 55,
  briefScore: 75,
  briefConfidence: 75,
  priorityScore: 85,
  priorityConfidence: 85,
} as const;

export interface TrendVerdict {
  readonly decision: TrendDecision;
  readonly opportunity: number;
  readonly confidence: number;
  /** Plain-language reason, for the console and the audit trail. */
  readonly why: string;
  readonly vetoes: readonly TrendOpportunityVeto[];
  /** True only for `reviewable_brief` and `priority_review`. */
  readonly mayCreateBrief: boolean;
}

export function decide(
  opportunity: number,
  confidence: number,
  vetoes: readonly TrendOpportunityVeto[] = [],
): TrendVerdict {
  const base = { opportunity, confidence, vetoes };

  if (vetoes.length > 0) {
    return {
      ...base,
      decision: 'vetoed',
      mayCreateBrief: false,
      why: `Vetoed: ${vetoes.join(', ')}. No score overcomes a veto.`,
    };
  }
  if (
    opportunity < DECISION_CUTOFFS.archiveBelowScore ||
    confidence < DECISION_CUTOFFS.archiveBelowConfidence
  ) {
    return {
      ...base,
      decision: 'archive',
      mayCreateBrief: false,
      why:
        `Archived at ${opportunity.toFixed(2)} opportunity and ` +
        `${confidence.toFixed(2)} confidence. Reopens on new evidence.`,
    };
  }
  if (
    opportunity >= DECISION_CUTOFFS.priorityScore &&
    confidence >= DECISION_CUTOFFS.priorityConfidence
  ) {
    return {
      ...base,
      decision: 'priority_review',
      mayCreateBrief: true,
      why:
        `Strong on both at ${opportunity.toFixed(2)} and ` +
        `${confidence.toFixed(2)}, so it goes to the front of the review ` +
        'queue. It does not go live on its own, and nothing here can put ' +
        'it there.',
    };
  }
  if (
    opportunity >= DECISION_CUTOFFS.briefScore &&
    confidence >= DECISION_CUTOFFS.briefConfidence
  ) {
    return {
      ...base,
      decision: 'reviewable_brief',
      mayCreateBrief: true,
      why:
        `${opportunity.toFixed(2)} opportunity and ${confidence.toFixed(2)} ` +
        'confidence clears the brief threshold. A reviewer decides.',
    };
  }
  return {
    ...base,
    decision: 'watch',
    mayCreateBrief: false,
    why:
      `Watching at ${opportunity.toFixed(2)} opportunity and ` +
      `${confidence.toFixed(2)} confidence — above the archive cutoff, ` +
      'short of a brief. Drafts may be written internally.',
  };
}

/* ------------------------------------------------------------------ *
 * The Growth Brief
 * ------------------------------------------------------------------ */

/**
 * The channels a brief can address.
 *
 * Two are live in v1 and the rest are reserved routing values that make
 * nothing available on their own — the specification is explicit about
 * that, and it matters here because `lifecycle` and `paid` would both
 * mean sending to real people or spending real money.
 */
export const BRIEF_CHANNELS = [
  'seo',
  'organic_social',
  'owned_placement',
  'lifecycle',
  'paid',
] as const;
export type BriefChannel = (typeof BRIEF_CHANNELS)[number];

/**
 * The channels with a platform-owned producer behind them.
 *
 * One, for now, and the reason is worth writing down rather than
 * discovering again. `seo` has the editorial autopilot: the platform's
 * own agent, drafting the platform's own pages, into a review queue a
 * person empties.
 *
 * `organic_social` does not, and the thing that looks like it is not it.
 * The only social copy writer here is the partner growth engine, which
 * writes for affiliates, bills their own allowance and carries their own
 * brief. Steering a partner's marketing with the platform's brief would
 * be the platform putting words in a customer's mouth, and it would be
 * visible to that customer — so it is not wired, and `organic_social`
 * stays unavailable until the platform has a social writer of its own.
 *
 * `lifecycle` means sending email to real people and `paid` means
 * spending real money. Both stay reserved.
 */
export const AVAILABLE_BRIEF_CHANNELS: readonly BriefChannel[] = ['seo'];

/**
 * The one contract every agent reads.
 *
 * Deliberately closed: an agent must reject an unknown field rather than
 * ignore it, because a brief with a field nobody validates is how an
 * instruction smuggles itself into a prompt. The claim and CTA are
 * *identifiers* — the text is resolved server-side against the approved
 * revision, so a brief cannot carry a sentence nobody signed off.
 */
export interface GrowthBrief {
  readonly schemaVersion: 1;
  readonly briefId: string;
  readonly briefVersion: number;
  readonly topicId: string;
  readonly opportunityScore: number;
  readonly confidence: number;
  readonly validFrom: string;
  readonly expiresAt: string;
  readonly evidenceIds: readonly string[];
  readonly audience: string;
  readonly intent: string;
  readonly approvedClaimIds: readonly string[];
  readonly ctaId: string;
  readonly allowedChannels: readonly BriefChannel[];
  readonly prohibitedClaims: readonly string[];
  readonly objective: string;
  readonly experimentId: string | null;
  readonly policyVersion: number;
  /** Who approved this revision. A brief without one cannot be served. */
  readonly approvedBy: string;
}

export const BRIEF_EXPIRY_HOURS = { persistent: 24 * 7, breaking: 24 } as const;

export type BriefRejection =
  | 'window_inverted'
  | 'not_yet_valid'
  | 'expired'
  | 'no_evidence'
  | 'no_approved_claim'
  | 'no_channel'
  | 'unavailable_channel'
  | 'channel_not_in_brief'
  | 'no_reviewer';

export interface BriefCheck {
  readonly ok: boolean;
  readonly rejections: readonly BriefRejection[];
  readonly why: string;
}

/**
 * The rules a schema cannot express.
 *
 * A structurally valid brief can still be a brief nobody may act on: out
 * of its window, carrying no evidence, naming a channel with no adapter,
 * or approved by nobody. Checked on every resolution and again before
 * every write, because the gap between those two moments is where a queue
 * lives.
 */
export function checkBrief(
  brief: GrowthBrief,
  at: Date,
  channel?: BriefChannel,
): BriefCheck {
  const rejections: BriefRejection[] = [];
  const from = Date.parse(brief.validFrom);
  const until = Date.parse(brief.expiresAt);
  const now = at.getTime();

  if (!(from < until)) rejections.push('window_inverted');
  if (now < from) rejections.push('not_yet_valid');
  if (now >= until) rejections.push('expired');
  if (brief.evidenceIds.length === 0) rejections.push('no_evidence');
  if (brief.approvedClaimIds.length === 0) rejections.push('no_approved_claim');
  if (brief.allowedChannels.length === 0) rejections.push('no_channel');
  if (!brief.approvedBy.trim()) rejections.push('no_reviewer');

  const unavailable = brief.allowedChannels.filter(
    (c) => !AVAILABLE_BRIEF_CHANNELS.includes(c),
  );
  if (unavailable.length > 0) rejections.push('unavailable_channel');
  if (channel && !brief.allowedChannels.includes(channel)) {
    rejections.push('channel_not_in_brief');
  }

  return {
    ok: rejections.length === 0,
    rejections,
    why:
      rejections.length === 0
        ? 'Brief is approved, in window, evidenced and on an available channel.'
        : `Brief refused: ${rejections.join(', ')}.`,
  };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/**
 * What a brief can turn into.
 *
 * The two `_patch` kinds change something a reader can see and are
 * therefore reversible, pre-bound and approval-gated. The two `_draft`
 * kinds produce text for a person and change nothing. Everything the
 * specification lists as out of scope for v1 automation — URLs,
 * redirects, canonicals, robots, structured data, permissions, template
 * code — is absent from this union rather than guarded elsewhere, because
 * a kind that does not exist cannot be requested.
 */
export const ACTION_KINDS = [
  'seo_metadata_patch',
  'owned_content_patch',
  'seo_page_draft',
  'organic_social_draft',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** The kinds that change a live, reader-visible asset. */
export const LIVE_ACTION_KINDS: readonly ActionKind[] = [
  'seo_metadata_patch',
  'owned_content_patch',
];

/**
 * The kinds that have an adapter and a policy behind them in v1.
 *
 * `owned_content_patch` is reserved and unavailable, for the same reason
 * `lifecycle` and `paid` are reserved channels: there is no safe adapter
 * for it yet. Patching body copy means editing markdown in place, and a
 * partial edit that mangles a published article about somebody's body is
 * a worse outcome than not having the feature. It stays in the union as a
 * stable value and is refused with a reason.
 */
export const AVAILABLE_ACTION_KINDS: readonly ActionKind[] = [
  'seo_metadata_patch',
  'seo_page_draft',
  'organic_social_draft',
];

/**
 * Fields a patch may touch, per kind.
 *
 * An allowlist rather than a denylist, and the names are the post
 * columns themselves rather than a parallel vocabulary — `description` is
 * the meta description. One translation layer fewer is one place fewer
 * for a field name to be mapped wrongly and patch something adjacent.
 *
 * A new column added to a post is not automatically patchable, which is
 * the right default for a schema that will grow.
 */
export const PATCHABLE_FIELDS: Readonly<Record<ActionKind, readonly string[]>> = {
  seo_metadata_patch: ['title', 'description'],
  owned_content_patch: [],
  seo_page_draft: [],
  organic_social_draft: [],
};

export const ACTION_STATES = [
  'proposed',
  'validated',
  'pending_approval',
  'approved',
  'queued',
  'executing',
  'applied',
  'failed',
  'reconciliation_required',
  'rolled_back',
] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const ACTION_TRANSITIONS: Readonly<Record<ActionState, readonly ActionState[]>> = {
  proposed: ['validated', 'failed'],
  validated: ['pending_approval', 'failed'],
  pending_approval: ['approved', 'failed'],
  approved: ['queued', 'failed'],
  queued: ['executing', 'failed'],
  executing: ['applied', 'failed', 'reconciliation_required'],
  applied: ['rolled_back'],
  failed: [],
  reconciliation_required: ['applied', 'failed'],
  rolled_back: [],
};

export function canTransitionAction(from: ActionState, to: ActionState): boolean {
  return ACTION_TRANSITIONS[from].includes(to);
}

/**
 * The key that makes a retry safe.
 *
 * Derived from everything that makes the write what it is, so the same
 * intent produces the same key and a different intent cannot reuse one.
 * The base revision is in it deliberately: retrying against a target that
 * has since moved is a different write, and must not dedupe against the
 * original.
 */
export function idempotencyKeyParts(input: {
  briefId: string;
  briefVersion: number;
  channel: BriefChannel;
  actionKind: ActionKind;
  targetId: string;
  baseRevision: number;
  canonicalPatchHash: string;
}): string {
  return [
    input.briefId,
    String(input.briefVersion),
    input.channel,
    input.actionKind,
    input.targetId,
    String(input.baseRevision),
    input.canonicalPatchHash,
  ].join('|');
}

/**
 * Whether a live write may even be proposed.
 *
 * Separate from approval on purpose. This answers "is this the kind of
 * thing we do automatically at all", before anybody is asked to sign it.
 */
export interface WriteEligibility {
  readonly allowed: boolean;
  readonly why: string;
}

export function mayProposeLiveWrite(input: {
  kind: ActionKind;
  decision: TrendDecision;
  fields: readonly string[];
  targetIsPreBound: boolean;
}): WriteEligibility {
  if (!AVAILABLE_ACTION_KINDS.includes(input.kind)) {
    return {
      allowed: false,
      why: `${input.kind} is a reserved kind with no adapter. It is refused rather than attempted.`,
    };
  }
  if (!LIVE_ACTION_KINDS.includes(input.kind)) {
    return { allowed: true, why: 'A draft changes nothing a reader can see.' };
  }
  if (!input.targetIsPreBound) {
    return {
      allowed: false,
      why: 'The target is not pre-bound. An asset must be bound and approved before anything may patch it.',
    };
  }
  if (input.decision !== 'reviewable_brief' && input.decision !== 'priority_review') {
    return {
      allowed: false,
      why: `A ${input.decision} topic cannot propose a live write.`,
    };
  }
  const allowedFields = PATCHABLE_FIELDS[input.kind];
  const forbidden = input.fields.filter((f) => !allowedFields.includes(f));
  if (forbidden.length > 0) {
    return {
      allowed: false,
      why: `Not patchable by a ${input.kind}: ${forbidden.join(', ')}.`,
    };
  }
  return {
    allowed: true,
    why: 'Eligible to be proposed. It still needs an approver who is not the author.',
  };
}

/* ------------------------------------------------------------------ *
 * Fit and intent, from the platform's own topic map
 * ------------------------------------------------------------------ */

/**
 * What a cluster's own search intent is worth as commercial intent.
 *
 * A verified mapping, not an inference. The specification is explicit
 * that a model may suggest fit and intent and that they take effect only
 * from a verified mapping, so these come from the intent each topic
 * cluster already declares about itself in `blog.ts`.
 *
 * Transactional is somebody ready to act; navigational is somebody
 * looking for a page they already know exists, which is the weakest
 * commercial signal there is and the easiest to mistake for demand.
 */
export const TOPIC_INTENT_SCORES = {
  transactional: 95,
  commercial: 85,
  informational: 60,
  navigational: 40,
} as const;

/**
 * Platform fit for one of this platform's own topic clusters.
 *
 * A hundred, and not a hedge. On a single-product platform, fit asks
 * whether the business can serve the demand — and `TOPIC_CLUSTERS` is
 * this platform's own statement of exactly what it covers. A topic in
 * that list is by definition something JESS MOVE does; a topic outside it
 * is never scored at all rather than scored low, because an unservable
 * topic should not be on the board.
 *
 * This is the one number in the scoring that a multi-tenant installation
 * would have to compute per tenant, and the one place the folded form is
 * genuinely simpler than the specification rather than smaller.
 */
export const PLATFORM_CLUSTER_FIT = 100;
