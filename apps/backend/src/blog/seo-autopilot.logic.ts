import { SEO_RULES, TOPIC_CLUSTERS, type SeoAudit } from '@jessmove/shared';

/**
 * What autopilot is, and the one thing it is not.
 *
 * It is not an auto-publisher. There is no edge in the status machine from
 * `draft` to `published`, `publish()` requires a named human reviewer, and
 * nothing in this file goes near either. An AI system putting unreviewed
 * health copy on a public site at a schedule is the exact failure this
 * product exists not to be, and "the SEO agent runs on autopilot" is how
 * every organisation that did it described it beforehand.
 *
 * What it does automate is everything up to the point a person is needed:
 *
 *   1. decide what to write next, from where the coverage is thinnest;
 *   2. commission it;
 *   3. audit it, deterministically;
 *   4. repair it once if it failed;
 *   5. queue it for review, or bin it and say why.
 *
 * The editor arrives to a queue of drafts that have already passed the
 * audit, instead of a blank page. That is the whole benefit, and it is a
 * large one — but the last step stays human, permanently.
 */

/* ------------------------------------------------------------------ *
 * Cadence
 * ------------------------------------------------------------------ */

/**
 * How often it may commission, in hours.
 *
 * Weekly. Publishing frequency is not a ranking factor, and a site that
 * suddenly produces a thousand pages is a site that gets classified as one
 * producing a thousand pages. One well-linked article a week that covers a
 * real gap beats forty that repeat each other, and the ACU cost of the
 * second strategy is forty times the first for a worse outcome.
 */
export const AUTOPILOT_INTERVAL_HOURS = 168;

/** Never more than this many drafts sitting unreviewed. */
export const MAX_QUEUE_DEPTH = 5;

/**
 * The spend ceiling for one run, in ACU.
 *
 * A run is a draft plus at most one repair. If a model starts failing in a
 * loop this is what stops the loop costing money — the run ends, the
 * failure is recorded, and the next scheduled run tries again rather than
 * this one retrying forever.
 */
export const RUN_ACU_CEILING = 60;

export interface AutopilotState {
  readonly enabled: boolean;
  readonly lastRunAt: string | null;
  readonly queueDepth: number;
}

export type SkipReason =
  | 'disabled'
  | 'too_soon'
  | 'queue_full'
  | 'no_gap'
  | 'budget';

export interface Decision {
  readonly run: boolean;
  readonly reason: SkipReason | 'due';
  /** Said in the words an operator would use, not a code. */
  readonly says: string;
  readonly nextDueAt: string | null;
}

/**
 * Whether to run, decided from state rather than from a clock inside a
 * service. Pure, so the schedule is testable without waiting a week.
 */
export function decide(state: AutopilotState, now: Date, gapCount: number): Decision {
  const nextDue = state.lastRunAt
    ? new Date(new Date(state.lastRunAt).getTime() + AUTOPILOT_INTERVAL_HOURS * 3_600_000)
    : null;
  const nextDueAt = nextDue ? nextDue.toISOString() : null;

  if (!state.enabled) {
    return {
      run: false,
      reason: 'disabled',
      says: 'Autopilot is off. Nothing is commissioned until it is switched on.',
      nextDueAt: null,
    };
  }
  if (state.queueDepth >= MAX_QUEUE_DEPTH) {
    return {
      run: false,
      reason: 'queue_full',
      says:
        `${state.queueDepth} drafts are already waiting for review. Writing more would bury the ` +
        'ones that are ready rather than help — the queue is the constraint, not the writing.',
      nextDueAt,
    };
  }
  if (gapCount === 0) {
    return {
      run: false,
      reason: 'no_gap',
      says:
        'Every cluster is fully covered. There is nothing left that would answer a question the ' +
        'site does not already answer, and writing anyway produces the near-duplicate that ' +
        'competes with the original.',
      nextDueAt,
    };
  }
  if (nextDue && now < nextDue) {
    const hours = Math.ceil((nextDue.getTime() - now.getTime()) / 3_600_000);
    return {
      run: false,
      reason: 'too_soon',
      says: `Ran within the last week. Next commission in about ${hours} hours.`,
      nextDueAt,
    };
  }
  return {
    run: true,
    reason: 'due',
    says: 'Due. Commissioning the article that closes the widest gap.',
    nextDueAt,
  };
}

/* ------------------------------------------------------------------ *
 * What to write next
 * ------------------------------------------------------------------ */

export interface Commission {
  readonly clusterKey: string;
  readonly pillar: string;
  readonly topic: string;
  readonly keyword: string;
  readonly category: string;
  /** Why this one and not another — shown to the editor, not just logged. */
  readonly because: string;
  /** Clusters aimed at minors or later life get the strict lexicon. */
  readonly strict: boolean;
}

const CATEGORY_FOR: Record<string, string> = {
  'micro-movement': 'Behaviour',
  'weight-control': 'Product decisions',
  'food-intelligence': 'Nutrition',
  'later-life': 'Later life',
  workplace: 'Workplace',
  children: 'Accessibility',
};

/** Clusters where a reader may be a minor or in a later-life mode. */
const STRICT_CLUSTERS = new Set(['children', 'later-life']);

/**
 * The thinnest cluster wins, and within it the first unwritten subject.
 *
 * Coverage rather than volume is the whole strategy: a cluster with one of
 * four subjects written ranks for none of them, because the site has not
 * demonstrated it knows the subject. Filling the gap is worth more than
 * another article on the subject already covered.
 */
export function nextCommission(
  publishedClusterKeys: readonly (string | null)[],
  writtenSubjects: readonly string[] = [],
): Commission | null {
  const written = new Set(writtenSubjects.map((s) => s.toLowerCase()));

  const ranked = TOPIC_CLUSTERS.map((cluster) => {
    const done = publishedClusterKeys.filter((k) => k === cluster.key).length;
    const remaining = cluster.supporting.filter((s) => !written.has(s.toLowerCase()));
    return { cluster, done, remaining, coverage: done / cluster.supporting.length };
  })
    .filter((c) => c.remaining.length > 0)
    .sort((a, b) => a.coverage - b.coverage);

  const winner = ranked[0];
  if (!winner) return null;

  const subject = winner.remaining[0]!;
  return {
    clusterKey: winner.cluster.key,
    pillar: winner.cluster.pillar,
    topic: subject,
    keyword: subject,
    category: CATEGORY_FOR[winner.cluster.key] ?? 'Research',
    because:
      `The "${winner.cluster.pillar}" cluster has ${winner.done} of ` +
      `${winner.cluster.supporting.length} subjects covered, which is the thinnest on the site. ` +
      `"${subject}" is the first one nothing answers.`,
    strict: STRICT_CLUSTERS.has(winner.cluster.key),
  };
}

/* ------------------------------------------------------------------ *
 * The outcome of a run
 * ------------------------------------------------------------------ */

export type RunOutcome = 'queued' | 'rejected' | 'skipped' | 'failed';

export interface RunRecord {
  readonly at: string;
  readonly outcome: RunOutcome;
  readonly says: string;
  readonly commission: Commission | null;
  readonly slug: string | null;
  readonly score: number | null;
  readonly blockers: readonly string[];
  readonly acuSpent: number;
}

/**
 * What to do with a draft once it has been audited.
 *
 * A draft that fails is not queued. Putting a failing draft in front of an
 * editor trains them to skim the audit, and an editor who skims the audit
 * is the reason a banned phrase reaches a published page.
 */
export function verdict(audit: SeoAudit): { queue: boolean; says: string } {
  const blockers = audit.findings.filter((f) => f.severity === 'blocker');
  if (blockers.length > 0) {
    return {
      queue: false,
      says:
        `Rejected at ${audit.score}/100 with ${blockers.length} blocker` +
        `${blockers.length === 1 ? '' : 's'}: ${blockers.map((b) => b.rule).join(', ')}. ` +
        'Not queued — a failing draft in the review queue teaches the editor to stop reading the audit.',
    };
  }
  if (!audit.passes) {
    return {
      queue: false,
      says:
        `Rejected at ${audit.score}/100, below the ${SEO_RULES.scorePass} pass mark. ` +
        'No blockers, but not good enough to spend an editor’s time on.',
    };
  }
  return {
    queue: true,
    says:
      `Queued for review at ${audit.score}/100, ${audit.measured.words} words, ` +
      `${audit.measured.internalLinks} internal links. A person publishes it or does not.`,
  };
}
