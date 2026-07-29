import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENGAGED_READ_SECONDS,
  ENGAGED_SCROLL_PERCENT,
  SEED_POSTS,
  SEO_RULES,
  aggregateViews,
  articleJsonLd,
  assertEditorialSafe,
  bannedTermsIn,
  canTransition,
  countWords,
  isEngagedRead,
  readingMinutes,
  seoAudit,
  slugify,
  type PostDraft,
  type PublishedPost,
  type ViewEvent,
} from '@jessmove/shared';

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

test('slugify normalises punctuation, case and accents', () => {
  assert.equal(slugify('The nudge we did NOT send'), 'the-nudge-we-did-not-send');
  assert.equal(slugify('Why the streak forgives — properly'), 'why-the-streak-forgives-properly');
  assert.equal(slugify("Don't break the chain"), 'dont-break-the-chain');
  assert.equal(slugify('Café résumé'), 'cafe-resume');
});

test('slugify is idempotent — the audit relies on it', () => {
  for (const seed of SEED_POSTS) {
    assert.equal(slugify(seed.slug), seed.slug, `${seed.slug} is not a stable slug`);
  }
});

test('slugify bounds the word count so a long title cannot make an endless URL', () => {
  const long = slugify('one two three four five six seven eight nine ten eleven twelve');
  assert.ok(long.split('-').length <= SEO_RULES.slugMaxWords);
  assert.ok(!long.endsWith('-'));
});

/* ------------------------------------------------------------------ *
 * Reading measures
 * ------------------------------------------------------------------ */

test('countWords ignores code fences, markup and markdown punctuation', () => {
  const body = '## Heading\n\nOne two three.\n\n```js\nconst a = 1; const b = 2;\n```\n';
  assert.equal(countWords(body), 4); // Heading, One, two, three.
});

test('reading time never returns zero for a real article', () => {
  assert.equal(readingMinutes('a b c'), 1);
  assert.equal(readingMinutes(Array(2200).fill('word').join(' ')), 10);
});

/* ------------------------------------------------------------------ *
 * Editorial safety — the rule SEO cannot buy its way past
 * ------------------------------------------------------------------ */

test('banned lexicon is caught in body copy', () => {
  assert.deepEqual(bannedTermsIn('A gentle workout to burn fat'), ['workout', 'burn', 'fat']);
  assert.deepEqual(bannedTermsIn('A two-minute movement break'), []);
});

test('banned lexicon matches whole words only — "fat" must not fire on "fatigue"', () => {
  assert.deepEqual(bannedTermsIn('Managing fatigue and flare-ups'), []);
});

test('the strict list adds the terms that are wrong for minors and later life', () => {
  assert.deepEqual(bannedTermsIn('Know your body shape', false), []);
  assert.deepEqual(bannedTermsIn('Know your body shape', true), ['body', 'shape']);
});

test('assertEditorialSafe throws with the offending terms named', () => {
  assert.throws(
    () => assertEditorialSafe('no excuses, get toned'),
    (e: Error) => e.name === 'EditorialSafetyError' && /toned/.test(e.message),
  );
});

/* ------------------------------------------------------------------ *
 * The audit
 * ------------------------------------------------------------------ */

function draftOf(overrides: Partial<PostDraft> = {}): PostDraft {
  const body = [
    '## Why this matters',
    Array(320).fill('movement').join(' '),
    '## What we measured',
    Array(320).fill('measurement').join(' '),
    '## What we changed',
    'We changed the seated movement default and measured it again.',
  ].join('\n\n');

  return {
    title: 'Seated movement for people who cannot stand safely',
    slug: 'seated-movement-for-people-who-cannot-stand',
    description:
      'Every movement in the library exists as a seated variant, authored independently ' +
      'rather than degraded from the standing version. Here is why that gate exists.',
    category: 'Accessibility',
    keyword: 'seated movement',
    secondaryKeywords: ['chair supported'],
    body,
    clusterKey: 'later-life',
    internalLinks: ['/micro-movement', '/for-adults'],
    ...overrides,
  };
}

test('a well-formed draft passes', () => {
  const audit = seoAudit(draftOf());
  assert.ok(audit.passes, JSON.stringify(audit.findings, null, 2));
  assert.ok(audit.score >= SEO_RULES.scorePass);
});

test('the audit is deterministic — the same draft always scores the same', () => {
  const d = draftOf();
  assert.deepEqual(seoAudit(d), seoAudit(d));
});

test('banned lexicon is a blocker, not a warning, and fails the audit outright', () => {
  const audit = seoAudit(draftOf({ body: `${draftOf().body}\n\nBurn fat faster.` }));
  assert.equal(audit.passes, false);
  const lexicon = audit.findings.filter((f) => f.rule === 'editorial.lexicon');
  assert.ok(lexicon.length > 0);
  assert.ok(lexicon.every((f) => f.severity === 'blocker'));
});

test('a thin article is blocked on length', () => {
  const audit = seoAudit(draftOf({ body: '## Short\n\nNot enough here.' }));
  assert.equal(audit.passes, false);
  assert.ok(audit.findings.some((f) => f.rule === 'body.length' && f.severity === 'blocker'));
});

test('a level-one heading in the body is a blocker — the page supplies the H1', () => {
  const audit = seoAudit(draftOf({ body: `# Duplicate title\n\n${draftOf().body}` }));
  assert.ok(audit.findings.some((f) => f.rule === 'body.h1' && f.severity === 'blocker'));
});

test('keyword stuffing is caught', () => {
  const stuffed = Array(60).fill('seated movement').join(' ');
  const audit = seoAudit(draftOf({ body: `## S\n\n${stuffed}` }));
  assert.ok(audit.findings.some((f) => f.rule === 'keyword.density'));
});

test('an unnormalised slug is a blocker', () => {
  const audit = seoAudit(draftOf({ slug: 'Seated Movement!' }));
  assert.ok(audit.findings.some((f) => f.rule === 'slug.format' && f.severity === 'blocker'));
});

test('every finding carries a fix, not just a complaint', () => {
  const audit = seoAudit(draftOf({ body: 'too short', title: 'x', description: 'y' }));
  assert.ok(audit.findings.length > 0);
  for (const f of audit.findings) {
    assert.ok(f.fix.length > 10, `${f.rule} has no usable fix`);
  }
});

/* ------------------------------------------------------------------ *
 * The publishing gate
 * ------------------------------------------------------------------ */

test('there is no transition from draft straight to published', () => {
  assert.equal(canTransition('draft', 'published'), false);
  assert.equal(canTransition('draft', 'in_review'), true);
  assert.equal(canTransition('in_review', 'published'), true);
});

test('a published post cannot go back to draft without being archived first', () => {
  assert.equal(canTransition('published', 'draft'), false);
  assert.equal(canTransition('published', 'archived'), true);
  assert.equal(canTransition('archived', 'draft'), true);
});

/* ------------------------------------------------------------------ *
 * Structured data
 * ------------------------------------------------------------------ */

test('article JSON-LD carries the fields a search engine actually reads', () => {
  const post: PublishedPost = {
    ...draftOf(),
    status: 'published',
    publishedAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-02T09:00:00.000Z',
    author: 'JESS MOVE',
    reviewedBy: 'A Reviewer',
    agentDrafted: true,
  };
  const ld = articleJsonLd(post, 'https://jessmove.com/');
  assert.equal(ld['@type'], 'Article');
  assert.equal(ld.url, 'https://jessmove.com/blog/seated-movement-for-people-who-cannot-stand');
  assert.equal(ld.inLanguage, 'en-GB');
  assert.ok((ld.wordCount as number) > 600);
});

/* ------------------------------------------------------------------ *
 * View tracking
 * ------------------------------------------------------------------ */

function view(over: Partial<ViewEvent> = {}): ViewEvent {
  return {
    slug: 'the-nudge-we-did-not-send',
    visitorDigest: 'a'.repeat(32),
    at: '2026-07-20T10:00:00.000Z',
    dwellSeconds: 60,
    scrollPercent: 80,
    referrerHost: 'www.google.com',
    device: 'desktop',
    ...over,
  };
}

test('a read needs both dwell and scroll — either alone is only a view', () => {
  assert.equal(isEngagedRead(view()), true);
  assert.equal(isEngagedRead(view({ dwellSeconds: ENGAGED_READ_SECONDS - 1 })), false);
  assert.equal(isEngagedRead(view({ scrollPercent: ENGAGED_SCROLL_PERCENT - 1 })), false);
});

test('aggregation separates views, unique visitors and reads', () => {
  const events = [
    view(),
    view({ visitorDigest: 'b'.repeat(32) }),
    view({ visitorDigest: 'b'.repeat(32), dwellSeconds: 4, scrollPercent: 10 }),
    view({ slug: 'why-the-streak-forgives' }),
  ];
  const m = aggregateViews('the-nudge-we-did-not-send', events);
  assert.equal(m.views, 3);
  assert.equal(m.uniqueVisitors, 2);
  assert.equal(m.engagedReads, 2);
  assert.equal(m.readRate, 0.667);
});

test('the view event type has nowhere to put an IP address or a user agent', () => {
  const keys = Object.keys(view());
  assert.deepEqual(
    keys.filter((k) => /ip|agent|address|cookie|user_?id/i.test(k)),
    [],
  );
});

test('referrers are ranked and devices are counted', () => {
  const m = aggregateViews('the-nudge-we-did-not-send', [
    view(),
    view({ visitorDigest: 'c'.repeat(32), referrerHost: 'news.ycombinator.com', device: 'mobile' }),
    view({ visitorDigest: 'd'.repeat(32), referrerHost: 'news.ycombinator.com', device: 'mobile' }),
  ]);
  assert.equal(m.topReferrers[0]?.host, 'news.ycombinator.com');
  assert.equal(m.topReferrers[0]?.views, 2);
  assert.equal(m.byDevice.mobile, 2);
  assert.equal(m.byDevice.desktop, 1);
});

test('an empty post reports zeroes rather than NaN', () => {
  const m = aggregateViews('nothing-here', []);
  assert.equal(m.views, 0);
  assert.equal(m.readRate, 0);
  assert.equal(m.medianDwellSeconds, 0);
  assert.equal(m.completionRate, 0);
});
