/**
 * Editorial and SEO contract.
 *
 * The blog is written by an agent (SEO, added to the agent registry) and
 * published by a person. Everything an agent produces is a *draft*: the
 * status machine has no transition from `draft` straight to `published`,
 * and `publish()` requires a named human reviewer. An AI system writing
 * unreviewed health copy at scale is precisely the failure this product
 * exists not to be.
 *
 * The SEO rules here are deterministic and testable. They are the part of
 * search optimisation that is actually knowable — length, structure,
 * uniqueness, internal linking, machine-readable metadata — as opposed to
 * the part that is guesswork about a ranking function nobody outside
 * Google has seen.
 */

import { BANNED_LEXICON, BANNED_LEXICON_STRICT } from './brand';

/* ------------------------------------------------------------------ *
 * Taxonomy
 * ------------------------------------------------------------------ */

export const POST_CATEGORIES = [
  'Product decisions',
  'Engineering',
  'Design',
  'Behaviour',
  'Research',
  'Accessibility',
  'Privacy',
  'Nutrition',
  'Later life',
  'Workplace',
] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

/**
 * The status machine. Transitions are explicit; anything not listed is
 * rejected. Note there is no `draft -> published` edge.
 */
export const POST_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const STATUS_TRANSITIONS: Readonly<Record<PostStatus, readonly PostStatus[]>> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'published', 'archived'],
  published: ['archived'],
  archived: ['draft'],
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/* ------------------------------------------------------------------ *
 * Topic clusters — the actual SEO architecture
 * ------------------------------------------------------------------ */

/**
 * Search visibility comes from covering a subject completely and linking
 * it together, not from repeating a phrase. Each cluster has one pillar
 * page and the supporting posts that link up to it.
 */
export interface TopicCluster {
  readonly key: string;
  readonly pillar: string;
  readonly pillarPath: string;
  readonly intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  readonly supporting: readonly string[];
}

export const TOPIC_CLUSTERS: readonly TopicCluster[] = [
  {
    key: 'micro-movement',
    pillar: 'What micro-movement actually is',
    pillarPath: '/micro-movement',
    intent: 'informational',
    supporting: [
      'sedentary work and the sitting problem',
      'movement snacks versus exercise sessions',
      'how long a movement break needs to be',
      'movement at a desk without changing clothes',
    ],
  },
  {
    key: 'weight-control',
    pillar: 'Weight management you actually control',
    pillarPath: '/body-balance',
    intent: 'commercial',
    supporting: [
      'why weekly weigh-ins mislead',
      'waist measurement versus BMI',
      'what a realistic rate of change looks like',
      'keeping progress when life interrupts',
    ],
  },
  {
    key: 'food-intelligence',
    pillar: 'Reading a meal from a photograph',
    pillarPath: '/foodlens',
    intent: 'informational',
    supporting: [
      'why calorie estimates from photographs are ranges',
      'plant points and why we count them',
      'allergen labelling and what a photograph cannot tell you',
      'swapping one component instead of the whole meal',
    ],
  },
  {
    key: 'later-life',
    pillar: 'Movement after 65, seated and supported',
    pillarPath: '/micro-movement',
    intent: 'informational',
    supporting: [
      'chair-supported movement for balance',
      'falls confidence and standing clearance',
      'movement with arthritis flare-ups',
      'staying independent at home',
    ],
  },
  {
    key: 'workplace',
    pillar: 'Workplace movement programmes that are not surveillance',
    pillarPath: '/industries',
    intent: 'commercial',
    supporting: [
      'what an employer can and cannot see',
      'k-anonymity in workforce reporting',
      'measuring a wellbeing programme honestly',
      'sedentary risk in hybrid teams',
    ],
  },
  {
    key: 'children',
    pillar: 'Movement for children without body talk',
    pillarPath: '/for-children',
    intent: 'informational',
    supporting: [
      'why we never show a child a weight',
      'screen breaks that children will actually take',
      'guardian visibility and what it includes',
      'school-day movement that fits a timetable',
    ],
  },
] as const;

/* ------------------------------------------------------------------ *
 * SEO rules
 * ------------------------------------------------------------------ */

/**
 * Bounds, not preferences. Titles longer than ~62 characters are cut in
 * the result listing; descriptions past ~158 likewise. The word floor is
 * where a page stops being able to answer a query completely.
 */
export const SEO_RULES = {
  titleMin: 30,
  titleMax: 62,
  descriptionMin: 110,
  descriptionMax: 158,
  slugMaxLength: 72,
  slugMaxWords: 9,
  bodyWordsMin: 600,
  bodyWordsMax: 2600,
  headingsMin: 3,
  /** Internal links out of the article, to the pillar and to siblings. */
  internalLinksMin: 2,
  /** Above this, repetition reads as stuffing to a reader and a ranker alike. */
  keywordDensityMax: 0.025,
  keywordDensityMin: 0.003,
  /** A passing audit. Below this the agent's draft does not reach review. */
  scorePass: 80,
} as const;

export const WORDS_PER_MINUTE = 220;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, SEO_RULES.slugMaxWords)
    .join('-')
    .slice(0, SEO_RULES.slugMaxLength)
    .replace(/-+$/, '');
}

export function countWords(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_>[\]()]/g, ' ');
  return stripped.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(countWords(text) / WORDS_PER_MINUTE));
}

/* ------------------------------------------------------------------ *
 * Editorial safety — the rule the SEO agent must not be able to trade away
 * ------------------------------------------------------------------ */

export class EditorialSafetyError extends Error {
  constructor(readonly terms: readonly string[]) {
    super(
      `editorial copy contains banned lexicon: ${terms.join(', ')} — ` +
        'search performance is never a reason to publish this framing',
    );
    this.name = 'EditorialSafetyError';
  }
}

/**
 * Copy aimed at minors, or at the later-life modes, uses the strict list.
 * Everything else uses the standard one. Neither is negotiable, and there
 * is no keyword argument that lifts it: "burn calories" is a high-volume
 * query and it is still not something this product says.
 */
export function bannedTermsIn(text: string, strict = false): string[] {
  const list = strict ? BANNED_LEXICON_STRICT : BANNED_LEXICON;
  const haystack = text.toLowerCase();
  return list.filter((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  });
}

export function assertEditorialSafe(text: string, strict = false): void {
  const found = bannedTermsIn(text, strict);
  if (found.length > 0) throw new EditorialSafetyError(found);
}

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

export interface PostDraft {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly category: PostCategory;
  readonly keyword: string;
  readonly secondaryKeywords: readonly string[];
  readonly body: string;
  readonly clusterKey?: string;
  readonly internalLinks: readonly string[];
}

export type FindingSeverity = 'blocker' | 'warning' | 'note';

export interface SeoFinding {
  readonly rule: string;
  readonly severity: FindingSeverity;
  readonly detail: string;
  /** What to change. A finding without a fix is just a complaint. */
  readonly fix: string;
}

export interface SeoAudit {
  readonly score: number;
  readonly passes: boolean;
  readonly findings: readonly SeoFinding[];
  readonly measured: {
    readonly titleLength: number;
    readonly descriptionLength: number;
    readonly words: number;
    readonly headings: number;
    readonly internalLinks: number;
    readonly keywordDensity: number;
    readonly readingMinutes: number;
  };
}

const WEIGHTS: Readonly<Record<FindingSeverity, number>> = {
  blocker: 25,
  warning: 8,
  note: 3,
};

/**
 * Deterministic. The same draft always produces the same audit, which is
 * what makes it usable as a build gate rather than a suggestion.
 */
export function seoAudit(draft: PostDraft, strict = false): SeoAudit {
  const findings: SeoFinding[] = [];
  const add = (
    rule: string,
    severity: FindingSeverity,
    detail: string,
    fix: string,
  ): void => {
    findings.push({ rule, severity, detail, fix });
  };

  const words = countWords(draft.body);
  const headings = (draft.body.match(/^#{2,3}\s+/gm) ?? []).length;
  const h1s = (draft.body.match(/^#\s+/gm) ?? []).length;

  const keyword = draft.keyword.trim().toLowerCase();
  const occurrences = keyword
    ? (draft.body.toLowerCase().match(
        new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
      ) ?? []).length
    : 0;
  const density = words > 0 ? occurrences / words : 0;

  /* --- title --- */
  if (draft.title.length < SEO_RULES.titleMin) {
    add('title.length', 'warning', `${draft.title.length} characters`,
      `Lengthen to at least ${SEO_RULES.titleMin}. A short title wastes the result listing.`);
  } else if (draft.title.length > SEO_RULES.titleMax) {
    add('title.length', 'warning', `${draft.title.length} characters`,
      `Trim to ${SEO_RULES.titleMax}. Beyond this it is truncated with an ellipsis.`);
  }
  if (keyword && !draft.title.toLowerCase().includes(keyword)) {
    add('title.keyword', 'warning', `"${draft.keyword}" is not in the title`,
      'Work the primary phrase into the title, ideally near the front.');
  }

  /* --- description --- */
  if (draft.description.length < SEO_RULES.descriptionMin) {
    add('description.length', 'warning', `${draft.description.length} characters`,
      `Lengthen to at least ${SEO_RULES.descriptionMin}.`);
  } else if (draft.description.length > SEO_RULES.descriptionMax) {
    add('description.length', 'warning', `${draft.description.length} characters`,
      `Trim to ${SEO_RULES.descriptionMax} or it is cut mid-sentence.`);
  }

  /* --- slug --- */
  if (draft.slug !== slugify(draft.slug)) {
    add('slug.format', 'blocker', `"${draft.slug}" is not a normalised slug`,
      'Use lowercase words separated by single hyphens.');
  }

  /* --- body --- */
  if (words < SEO_RULES.bodyWordsMin) {
    add('body.length', 'blocker', `${words} words`,
      `At least ${SEO_RULES.bodyWordsMin}. Below this the page cannot answer the query completely.`);
  } else if (words > SEO_RULES.bodyWordsMax) {
    add('body.length', 'note', `${words} words`,
      `Consider splitting. Over ${SEO_RULES.bodyWordsMax} usually means two articles.`);
  }
  if (h1s > 0) {
    add('body.h1', 'blocker', `${h1s} level-one heading(s) in the body`,
      'The page title is the H1. Use ## and ### inside the body.');
  }
  if (headings < SEO_RULES.headingsMin) {
    add('body.headings', 'warning', `${headings} section headings`,
      `At least ${SEO_RULES.headingsMin}, so the article is scannable and can win a snippet.`);
  }

  /* --- keyword --- */
  if (!keyword) {
    add('keyword.missing', 'blocker', 'no primary phrase set',
      'Every article targets one primary phrase.');
  } else if (density > SEO_RULES.keywordDensityMax) {
    add('keyword.density', 'warning', `${(density * 100).toFixed(2)}% — ${occurrences} occurrences`,
      'Reduce repetition. Use natural variants instead of the exact phrase.');
  } else if (density < SEO_RULES.keywordDensityMin) {
    add('keyword.density', 'note', `${(density * 100).toFixed(2)}% — ${occurrences} occurrences`,
      'The phrase barely appears. Confirm the article is actually about it.');
  }

  /* --- linking --- */
  if (draft.internalLinks.length < SEO_RULES.internalLinksMin) {
    add('links.internal', 'warning', `${draft.internalLinks.length} internal links`,
      `At least ${SEO_RULES.internalLinksMin} — one to the cluster pillar, one to a sibling.`);
  }
  if (draft.clusterKey && !TOPIC_CLUSTERS.some((c) => c.key === draft.clusterKey)) {
    add('links.cluster', 'warning', `unknown cluster "${draft.clusterKey}"`,
      'Assign the article to a real cluster, or leave it unassigned.');
  }

  /* --- editorial safety, always last and always heaviest --- */
  const banned = bannedTermsIn(`${draft.title} ${draft.description} ${draft.body}`, strict);
  for (const term of banned) {
    add('editorial.lexicon', 'blocker', `contains "${term}"`,
      'Rewrite. No search volume justifies this framing.');
  }

  const penalty = findings.reduce((sum, f) => sum + WEIGHTS[f.severity], 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    passes: score >= SEO_RULES.scorePass && !findings.some((f) => f.severity === 'blocker'),
    findings,
    measured: {
      titleLength: draft.title.length,
      descriptionLength: draft.description.length,
      words,
      headings,
      internalLinks: draft.internalLinks.length,
      keywordDensity: Number(density.toFixed(5)),
      readingMinutes: readingMinutes(draft.body),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Structured data
 * ------------------------------------------------------------------ */

export interface PublishedPost extends PostDraft {
  readonly status: PostStatus;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly author: string;
  readonly reviewedBy: string | null;
  /** True when the first draft came from the SEO agent. Disclosed on the page. */
  readonly agentDrafted: boolean;
}

/** schema.org Article, as a plain object ready for JSON.stringify. */
export function articleJsonLd(post: PublishedPost, siteUrl: string): Record<string, unknown> {
  const url = `${siteUrl.replace(/\/$/, '')}/blog/${post.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    articleSection: post.category,
    keywords: [post.keyword, ...post.secondaryKeywords].join(', '),
    wordCount: countWords(post.body),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: 'en-GB',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'JESS MOVE' },
  };
}

/* ------------------------------------------------------------------ *
 * View tracking
 * ------------------------------------------------------------------ */

/**
 * A view is not a read. Anything can request a page; a person who stays
 * long enough to have read it is a different and more useful number, so
 * both are recorded and reported separately.
 */
export const ENGAGED_READ_SECONDS = 25;
export const ENGAGED_SCROLL_PERCENT = 55;

/**
 * What a view event may carry. There is no IP address and no user agent
 * on this type on purpose — the server hashes those on arrival and keeps
 * only the digest, so the raw values never reach storage.
 */
export interface ViewEvent {
  readonly slug: string;
  /** Daily-rotating salted digest. Not reversible, not stable across days. */
  readonly visitorDigest: string;
  readonly at: string;
  readonly dwellSeconds: number;
  readonly scrollPercent: number;
  readonly referrerHost: string | null;
  readonly device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
}

export interface PostMetrics {
  readonly slug: string;
  readonly views: number;
  readonly uniqueVisitors: number;
  readonly engagedReads: number;
  readonly readRate: number;
  readonly medianDwellSeconds: number;
  readonly completionRate: number;
  readonly topReferrers: readonly { host: string; views: number }[];
  readonly byDevice: Readonly<Record<ViewEvent['device'], number>>;
}

export function isEngagedRead(event: ViewEvent): boolean {
  return (
    event.dwellSeconds >= ENGAGED_READ_SECONDS &&
    event.scrollPercent >= ENGAGED_SCROLL_PERCENT
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

export function aggregateViews(slug: string, events: readonly ViewEvent[]): PostMetrics {
  const mine = events.filter((e) => e.slug === slug);
  const engaged = mine.filter(isEngagedRead);

  const referrers = new Map<string, number>();
  for (const e of mine) {
    if (!e.referrerHost) continue;
    referrers.set(e.referrerHost, (referrers.get(e.referrerHost) ?? 0) + 1);
  }

  const byDevice: Record<ViewEvent['device'], number> = {
    mobile: 0,
    tablet: 0,
    desktop: 0,
    unknown: 0,
  };
  for (const e of mine) byDevice[e.device] += 1;

  return {
    slug,
    views: mine.length,
    uniqueVisitors: new Set(mine.map((e) => e.visitorDigest)).size,
    engagedReads: engaged.length,
    readRate: mine.length === 0 ? 0 : Number((engaged.length / mine.length).toFixed(3)),
    medianDwellSeconds: median(mine.map((e) => e.dwellSeconds)),
    completionRate:
      mine.length === 0
        ? 0
        : Number(
            (mine.filter((e) => e.scrollPercent >= 90).length / mine.length).toFixed(3),
          ),
    topReferrers: [...referrers.entries()]
      .map(([host, views]) => ({ host, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5),
    byDevice,
  };
}

/* ------------------------------------------------------------------ *
 * The corpus that exists today
 * ------------------------------------------------------------------ */

export interface SeedPost {
  readonly slug: string;
  readonly title: string;
  readonly category: PostCategory;
  readonly publishedAt: string;
  readonly keyword: string;
  readonly clusterKey: string | null;
}

/**
 * Slugs live here rather than in either app, so the site's routes and the
 * API's analytics cannot drift apart. Bodies live in the frontend — the
 * API has no reason to carry prose.
 */
export const SEED_POSTS: readonly SeedPost[] = [
  {
    slug: 'charter-rule-c6-conflict',
    title: 'Charter rule C6, and the conflict we could not design around',
    category: 'Product decisions',
    publishedAt: '2026-07-18',
    keyword: 'body composition',
    clusterKey: 'weight-control',
  },
  {
    slug: 'rules-in-postgresql',
    title: 'We moved the rules into PostgreSQL, and it found four bugs the same afternoon',
    category: 'Engineering',
    publishedAt: '2026-07-09',
    keyword: 'database constraints',
    clusterKey: null,
  },
  {
    slug: 'six-modes-not-a-font-size',
    title: 'Six modes, not one interface with a font-size setting',
    category: 'Design',
    publishedAt: '2026-07-02',
    keyword: 'accessible interface design',
    clusterKey: 'later-life',
  },
  {
    slug: 'the-nudge-we-did-not-send',
    title: 'The nudge we did not send',
    category: 'Behaviour',
    publishedAt: '2026-06-24',
    keyword: 'notification timing',
    clusterKey: 'micro-movement',
  },
  {
    slug: 'why-the-streak-forgives',
    title: 'Why the streak forgives',
    category: 'Research',
    publishedAt: '2026-06-11',
    keyword: 'habit streak',
    clusterKey: 'micro-movement',
  },
  {
    slug: 'five-variants-or-it-does-not-ship',
    title: 'Five variants or it does not ship',
    category: 'Accessibility',
    publishedAt: '2026-05-30',
    keyword: 'seated movement',
    clusterKey: 'later-life',
  },
  {
    slug: 'the-employer-dashboard-that-does-not-exist',
    title: 'The employer dashboard that does not exist',
    category: 'Privacy',
    publishedAt: '2026-05-17',
    keyword: 'workplace wellbeing data',
    clusterKey: 'workplace',
  },
  {
    slug: 'a-photograph-cannot-tell-you-the-calories',
    title: 'A photograph cannot tell you the energy, so we stopped pretending',
    category: 'Nutrition',
    publishedAt: '2026-05-05',
    keyword: 'food photo analysis',
    clusterKey: 'food-intelligence',
  },
];
