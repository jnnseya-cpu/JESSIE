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
import { isKnownPath, normalisePath } from './site-paths';

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
  /*
   * ── How the supporting subjects are chosen ──
   *
   * Every one of these is a sentence somebody types into a search box, not
   * a name for a feature. That distinction is the whole difference between
   * content that acquires customers and content that does not, and this
   * site got it wrong for its entire life: the published corpus targets
   * "database constraints", "notification timing" and "accessible
   * interface design", which are things an engineer searches when they are
   * building something, not things a sixty-eight-year-old searches when
   * they are worried about their balance.
   *
   * The feature is what the article is *about*. The phrase is what the
   * reader is *asking*. "AI Growth Engine" is a product name nobody has
   * ever searched; "how to keep exercising when your knees hurt" has
   * people typing it every day, and it is answered by the same variant
   * system the product name refers to.
   *
   * Nothing here is a keyword to be stuffed. A cluster's job is to
   * demonstrate that this site knows a subject completely, which is why
   * coverage beats volume in the commissioning logic below.
   */
  {
    key: 'micro-movement',
    pillar: 'What micro-movement actually is',
    pillarPath: '/micro-movement',
    intent: 'informational',
    supporting: [
      'how to be more active with a desk job',
      'how long a movement break needs to be',
      'exercise without changing clothes or going to a gym',
      'what to do when you have no time to exercise',
      'movement snacks versus one long workout',
    ],
  },
  {
    key: 'weight-control',
    pillar: 'Weight management you actually control',
    pillarPath: '/body-balance',
    intent: 'commercial',
    supporting: [
      'why does my weight go up and down every day',
      'waist measurement versus BMI',
      'what is a realistic rate of weight loss',
      'how to keep progress when life gets in the way',
      'what to track instead of the scales',
    ],
  },
  {
    key: 'food-intelligence',
    pillar: 'Reading a meal from a photograph',
    pillarPath: '/foodlens',
    intent: 'informational',
    supporting: [
      'how accurate are calorie counting apps',
      'how to eat more plants without changing your diet',
      'reading a food label without the maths',
      'how much salt is actually in my food',
      'swapping one thing instead of changing the whole meal',
    ],
  },
  {
    key: 'strength-and-balance',
    pillar: 'Strength and balance, without a gym',
    pillarPath: '/micro-movement',
    intent: 'informational',
    supporting: [
      'exercises to stop falling',
      'how many times should I be able to stand up from a chair',
      'chair based exercises for older adults',
      'how to improve balance at home safely',
      'how much protein do you need after 65',
      'what a falls assessment actually involves',
    ],
  },
  {
    key: 'living-with',
    pillar: 'Moving with a condition, not around it',
    pillarPath: '/body-balance',
    intent: 'informational',
    supporting: [
      'exercise with arthritis when it flares up',
      'what to eat on appetite suppressing medication',
      'staying strong while losing weight on medication',
      'low salt eating when you have kidney disease',
      'exercise and type 2 diabetes for beginners',
      'eating well with pancreatic insufficiency',
    ],
  },
  {
    key: 'later-life',
    pillar: 'Movement after 65, seated and supported',
    pillarPath: '/micro-movement',
    intent: 'informational',
    supporting: [
      'staying independent at home as you get older',
      'how to get moving again after an illness',
      'exercise when you use a walking frame',
      'what to do if you are afraid of falling',
    ],
  },
  {
    key: 'coaching',
    pillar: 'A coach that knows when to say nothing',
    pillarPath: '/mova',
    intent: 'commercial',
    supporting: [
      'do fitness apps actually work',
      'why reminder apps stop working after a week',
      'how to build a habit that survives a bad week',
      'what to do when you have broken your streak',
    ],
  },
  {
    key: 'wearables',
    pillar: 'What a watch adds, and what it cannot settle',
    pillarPath: '/wearables',
    intent: 'commercial',
    supporting: [
      'do I need a fitness tracker to get fitter',
      'why is my step count different on every device',
      'how many steps a day actually matters',
      'using a fitness app without a smartwatch',
    ],
  },
  {
    key: 'together',
    pillar: 'Moving with other people',
    pillarPath: '/challenges',
    intent: 'commercial',
    supporting: [
      'step challenges that do not just reward the fittest person',
      'how to get a family moving together',
      'exercising with a partner who is a different fitness level',
      'workplace wellbeing challenges that people actually finish',
    ],
  },
  {
    key: 'workplace',
    pillar: 'Workplace movement programmes that are not surveillance',
    pillarPath: '/industries',
    intent: 'commercial',
    supporting: [
      'what can my employer see in a wellbeing app',
      'sedentary risk in hybrid teams',
      'measuring a wellbeing programme honestly',
      'wellbeing benefits staff will actually use',
    ],
  },
  {
    key: 'children',
    pillar: 'Movement for children without body talk',
    pillarPath: '/for-children',
    intent: 'informational',
    supporting: [
      'fitness apps that are safe for children',
      'getting children moving without talking about weight',
      'screen breaks children will actually take',
      'what a parent can see in a child’s health app',
    ],
  },
  {
    key: 'trust',
    pillar: 'What this platform refuses to do',
    pillarPath: '/assurance',
    intent: 'commercial',
    supporting: [
      'are health apps safe with your data',
      'what happens to health data in a fitness app',
      'how to tell if a health app is trustworthy',
      'health apps that do not sell your data',
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
  /**
   * Internal links out of the article, to the pillar and to siblings.
   *
   * Raised from two. Two is the floor at which an article is not an
   * island; it is not the number that makes a cluster read as one subject
   * to a crawler. Four means the pillar, a sibling, and two of the product
   * pages the article actually talks about — which is what an article
   * written by somebody who knew the site would contain anyway.
   */
  internalLinksMin: 4,
  /** Past this the links stop being navigation and start being a farm. */
  internalLinksMax: 12,
  /** Above this, repetition reads as stuffing to a reader and a ranker alike. */
  keywordDensityMax: 0.025,
  keywordDensityMin: 0.003,

  /**
   * A passing audit. Below this the agent's draft does not reach review.
   *
   * Ninety, raised from eighty, and it is worth knowing exactly what that
   * buys because the weights make it steep. A blocker costs 25, a warning
   * 8, a note 3. So 90 permits one warning and nothing else, or three
   * notes and nothing else. Eighty permitted two warnings and a note — an
   * article with a truncated title, no link to its pillar and a thin
   * keyword, which is a publishable article and not a competitive one.
   *
   * The number is not the point. What makes it reachable is that the
   * repair pass gets the findings back with their fixes, so the agent is
   * told precisely which two things to change rather than asked to try
   * harder.
   */
  scorePass: 90,

  /**
   * The opening answer, in words.
   *
   * Everything downstream of a search box now extracts a passage rather
   * than ranking a page: a featured snippet, an AI overview, an assistant
   * asked a question. All of them take the first self-contained answer
   * they can find, and an article that opens by setting the scene has
   * nothing to take. Below 25 words there is no answer; above 90 it stops
   * fitting in the box it is competing for.
   */
  answerWordsMin: 25,
  answerWordsMax: 90,

  /**
   * Question-and-answer pairs, which become `FAQPage` structured data.
   *
   * The most reliable way to be quoted rather than merely ranked. A
   * question phrased the way somebody asks it, answered in the length an
   * answer engine will lift.
   */
  faqMin: 2,
  faqAnswerWordsMax: 60,
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

/** One question, phrased as somebody would ask it, and its answer. */
export interface FaqPair {
  readonly q: string;
  readonly a: string;
}

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
  /**
   * Questions this article answers outright.
   *
   * Optional on the type because the corpus predates it; required by the
   * audit, which is where a rule belongs when the old rows still have to
   * load.
   */
  readonly faq?: readonly FaqPair[];
}

/**
 * The article's opening answer — everything before the first section.
 *
 * Split out because three things read it: the audit, which judges whether
 * it can be lifted; the page, which renders it; and `articleJsonLd`, which
 * hands it to `description` when nothing better exists. One definition of
 * "the opening" rather than three near-misses.
 */
export function leadParagraph(body: string): string {
  const beforeFirstHeading = body.split(/^#{2,6}\s+/m)[0] ?? '';
  return beforeFirstHeading
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#\s+[^\n]*$/gm, ' ')
    .trim();
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
    /** Words in the opening answer — what an answer engine would lift. */
    readonly answerWords: number;
    readonly faqPairs: number;
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
export function seoAudit(
  draft: PostDraft,
  strict = false,
  /** Article slugs that exist, so a link to a sibling is not called dead. */
  knownSlugs: readonly string[] = SEED_POSTS.map((p) => p.slug),
): SeoAudit {
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

  /* --- the opening answer --- */
  /*
   * Nothing downstream of a search box ranks a page any more; it extracts
   * a passage. A featured snippet, an AI overview and an assistant asked a
   * question all take the first self-contained answer they can find, and
   * an article that opens by setting the scene offers them nothing to
   * take. This is the rule that decides whether the article is quotable.
   */
  const lead = leadParagraph(draft.body);
  const leadWords = countWords(lead);
  if (leadWords === 0) {
    add('answer.missing', 'blocker', 'the article opens straight into a heading',
      `Open with ${SEO_RULES.answerWordsMin}–${SEO_RULES.answerWordsMax} words that answer the question outright. That paragraph is what an answer engine quotes.`);
  } else if (leadWords < SEO_RULES.answerWordsMin) {
    add('answer.length', 'warning', `the opening is ${leadWords} words`,
      `At least ${SEO_RULES.answerWordsMin}. Below that there is no answer to lift, only a sentence.`);
  } else if (leadWords > SEO_RULES.answerWordsMax) {
    add('answer.length', 'warning', `the opening is ${leadWords} words`,
      `Trim to ${SEO_RULES.answerWordsMax}. Past that it stops fitting the box it is competing for.`);
  }
  if (keyword && leadWords > 0 && !lead.toLowerCase().includes(keyword)) {
    add('answer.keyword', 'warning', `the opening does not contain "${draft.keyword}"`,
      'An extracted passage has to stand alone. If the phrase is absent, the quote does not obviously answer the question.');
  }

  /* --- questions answered outright --- */
  const faq = draft.faq ?? [];
  if (faq.length < SEO_RULES.faqMin) {
    add('faq.count', 'warning', `${faq.length} question-and-answer pairs`,
      `At least ${SEO_RULES.faqMin}. These become FAQPage structured data, which is the most reliable way to be quoted rather than merely ranked.`);
  }
  for (const pair of faq) {
    if (!pair.q.trim().endsWith('?')) {
      add('faq.question', 'note', `"${pair.q.slice(0, 48)}" is not phrased as a question`,
        'Phrase it the way somebody types it, ending in a question mark.');
    }
    const answerWords = countWords(pair.a);
    if (answerWords > SEO_RULES.faqAnswerWordsMax) {
      add('faq.answer', 'note', `an answer runs to ${answerWords} words`,
        `Keep answers under ${SEO_RULES.faqAnswerWordsMax} words. A long one is summarised by the engine instead of quoted, and the summary is not ours.`);
    }
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
      `At least ${SEO_RULES.internalLinksMin} — the cluster pillar, a sibling article, and the product pages the article actually discusses.`);
  } else if (draft.internalLinks.length > SEO_RULES.internalLinksMax) {
    add('links.internal', 'note', `${draft.internalLinks.length} internal links`,
      `Past ${SEO_RULES.internalLinksMax} each link is worth less and the page reads as a list. Cut to the ones a reader would follow.`);
  }

  /*
   * A link to a page that does not exist is worse than no link. It sends a
   * reader to a 404, it spends crawl budget on nothing, and it is the
   * failure a model makes most often — inventing a plausible URL from the
   * shape of the others. So the paths are checked against the registry
   * rather than trusted, and an invented one is a blocker.
   */
  const seen = new Set<string>();
  for (const link of draft.internalLinks) {
    const path = normalisePath(link);
    if (/^https?:\/\//i.test(link.trim())) {
      add('links.external', 'warning', `"${link}" is an absolute URL`,
        'Internal links are site-relative paths, so they survive a domain change.');
      continue;
    }
    if (seen.has(path)) {
      add('links.duplicate', 'note', `"${path}" is linked more than once`,
        'One link per destination. The second one adds nothing.');
      continue;
    }
    seen.add(path);
    if (!isKnownPath(path, knownSlugs)) {
      add('links.dead', 'blocker', `"${path}" does not exist on this site`,
        'Link to a real page. An invented path is a 404 for the reader and wasted crawl for everyone else.');
    }
  }

  if (draft.clusterKey) {
    const cluster = TOPIC_CLUSTERS.find((c) => c.key === draft.clusterKey);
    if (!cluster) {
      add('links.cluster', 'warning', `unknown cluster "${draft.clusterKey}"`,
        'Assign the article to a real cluster, or leave it unassigned.');
    } else if (!seen.has(normalisePath(cluster.pillarPath))) {
      // The single most valuable link an article in a cluster can carry.
      add('links.pillar', 'warning', `no link up to the "${cluster.pillar}" pillar`,
        `Link to ${cluster.pillarPath}. A cluster whose articles do not point at their pillar is not a cluster.`);
    }
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
      answerWords: leadWords,
      faqPairs: faq.length,
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
/**
 * What an article looks like to a search engine.
 *
 * Structural rather than `PublishedPost`, because two things render an
 * article — the seeded corpus and the editorial pipeline — and their
 * shapes differ. The narrow signature is why the blog page grew its own
 * copy of this object instead of calling it, and the copy was worse in
 * three ways that each cost real indexing: only the primary keyword
 * reached `keywords`, `dateModified` was set to the publication date so
 * an edited article never looked edited, and the author was hardcoded
 * rather than taken from the post.
 *
 * `wordCount` prefers a count the caller already has. Recomputing it from
 * the body is correct and wasteful when the page has measured it to show
 * a reading time.
 */
export interface JsonLdArticle {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly keyword: string;
  readonly secondaryKeywords?: readonly string[];
  readonly body?: string;
  readonly words?: number;
  readonly publishedAt: string;
  readonly updatedAt?: string;
  readonly author?: string;
  /**
   * The person who cleared it for publication.
   *
   * Never invented: `posts` refuses a published row without one, so this
   * is either a real name or absent.
   */
  readonly reviewedBy?: string | null;
}

export function articleJsonLd(post: JsonLdArticle, siteUrl: string): Record<string, unknown> {
  const url = `${siteUrl.replace(/\/$/, '')}/blog/${post.slug}`;
  const keywords = [post.keyword, ...(post.secondaryKeywords ?? [])].filter(Boolean).join(', ');

  /*
   * The named reviewer, published as `reviewedBy`.
   *
   * Not a marketing flourish — it is the one E-E-A-T signal this platform
   * can make truthfully and most cannot, because the review is already a
   * clinical safety control rather than a workflow step. `posts` has a
   * CHECK constraint refusing a published row without a named reviewer, so
   * the schema guarantees this field is real wherever it appears.
   *
   * `author` becomes a Person when a person wrote it and stays an
   * Organization otherwise. Publishing an organisation as the author of
   * something a person wrote loses the strongest signal available; the
   * reverse — a made-up byline — is worse than losing it.
   */
  const reviewer = post.reviewedBy?.trim();
  const author = post.author?.trim();
  const authored =
    author && author !== 'JESS MOVE'
      ? { '@type': 'Person', name: author }
      : { '@type': 'Organization', name: 'JESS MOVE' };

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    articleSection: post.category,
    keywords,
    wordCount: post.words ?? (post.body ? countWords(post.body) : undefined),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    inLanguage: 'en-GB',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    author: authored,
    ...(reviewer ? { reviewedBy: { '@type': 'Person', name: reviewer } } : {}),
    publisher: { '@type': 'Organization', name: 'JESS MOVE' },
  };
}

/**
 * `FAQPage`, from the pairs the article already carries.
 *
 * The most reliable way to be quoted rather than merely ranked: a
 * question in the words somebody uses, and an answer short enough to be
 * lifted whole. Returns null rather than an empty `FAQPage`, because
 * structured data describing nothing is a markup error on the page and a
 * reason for a crawler to trust the rest of it less.
 */
export function faqJsonLd(
  faq: readonly FaqPair[] | undefined,
  url: string,
): Record<string, unknown> | null {
  const pairs = (faq ?? []).filter((p) => p.q.trim() && p.a.trim());
  if (pairs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: pairs.map((p) => ({
      '@type': 'Question',
      name: p.q.trim(),
      acceptedAnswer: { '@type': 'Answer', text: p.a.trim() },
    })),
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
