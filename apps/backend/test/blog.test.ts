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
  faqJsonLd,
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

/*
 * An exemplary draft, and it has to be one.
 *
 * This fixture is the working definition of a 90: it opens with an answer
 * an engine can lift, links up to its pillar and out to the pages it
 * actually discusses, and answers two questions outright. When the bar
 * moved from 80 to 90 this fixture stopped passing, which was the bar
 * working — it had a heading as its first line, two internal links and no
 * questions, and that was a publishable article rather than a competitive
 * one.
 */
function draftOf(overrides: Partial<PostDraft> = {}): PostDraft {
  const body = [
    // The opening answer. First thing in the file, before any heading,
    // because that is where an extractor looks and stops.
    'Seated movement is exercise performed entirely from a chair, and for ' +
      'anybody who cannot stand safely it is the whole session rather than a ' +
      'consolation prize. Every movement in this library exists as a seated ' +
      'variant authored on its own terms, never a standing one with the ' +
      'standing removed.',
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
    // Four, including the cluster pillar. Two was the old floor and it
    // left the article an island inside its own cluster.
    internalLinks: ['/micro-movement', '/for-adults', '/body-balance', '/assurance'],
    faq: [
      {
        q: 'Is seated movement enough on its own?',
        a: 'Yes. A seated session is a complete session, not a reduced one, and the library is authored that way rather than degraded from standing versions.',
      },
      {
        q: 'Do I need to be able to stand at all?',
        a: 'No. Chair-supported is the default in later-life modes, and standing work is opt-up rather than opt-out.',
      },
    ],
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

/* ------------------------------------------------------------------ *
 * Being quoted, not just ranked
 *
 * Everything downstream of a search box now extracts a passage rather
 * than ranking a page. These are the rules that decide whether there is
 * a passage to take.
 * ------------------------------------------------------------------ */

test('the bar is 90, and 90 permits one warning rather than three', () => {
  // Worth pinning as arithmetic rather than as a number: at 25/8/3 for
  // blocker/warning/note, 90 allows a single warning or three notes.
  // Eighty allowed two warnings and a note — a truncated title, no link
  // to the pillar and a thin keyword, all at once.
  assert.equal(SEO_RULES.scorePass, 90);
  assert.ok(100 - 8 >= SEO_RULES.scorePass, 'one warning must still pass');
  assert.ok(100 - 8 - 3 < SEO_RULES.scorePass, 'a warning and a note must not');
});

test('an article that opens on a heading has nothing an answer engine can lift', () => {
  const audit = seoAudit(draftOf({ body: '## Straight in\n\n' + Array(700).fill('word').join(' ') }));
  const finding = audit.findings.find((f) => f.rule === 'answer.missing');
  assert.ok(finding, JSON.stringify(audit.findings.map((f) => f.rule)));
  assert.equal(finding.severity, 'blocker');
  assert.equal(audit.passes, false);
});

test('the opening answer has to stand alone, at a liftable length', () => {
  // The lead is everything before the *first* heading, so the fixture has
  // to supply one — appending to a body that already opens with an answer
  // measures the two paragraphs together, which is what a first attempt
  // at this test did.
  const filler = ['## Why', Array(700).fill('word').join(' ')].join('\n\n');

  const short = seoAudit(draftOf({ body: `Seated movement helps.\n\n${filler}` }));
  assert.ok(
    short.findings.some((f) => f.rule === 'answer.length'),
    JSON.stringify(short.measured),
  );

  const rambling = seoAudit(
    draftOf({ body: `${Array(140).fill('seated movement matters').join(' ')}\n\n${filler}` }),
  );
  assert.ok(
    rambling.findings.some((f) => f.rule === 'answer.length'),
    JSON.stringify(rambling.measured),
  );
});

test('an opening that never says the phrase is not obviously the answer', () => {
  const audit = seoAudit(
    draftOf({
      body:
        'Chairs are underrated. A great deal of useful work can be done from one, and the ' +
        'library treats that as the default rather than the exception for anybody who needs ' +
        'it, which is a decision rather than an accident of how it was built.\n\n' +
        `## Why\n\n${Array(700).fill('word').join(' ')}`,
    }),
  );
  assert.ok(
    audit.findings.some((f) => f.rule === 'answer.keyword'),
    JSON.stringify(audit.findings.map((f) => f.rule)),
  );
});

test('questions answered outright become FAQPage, and an empty set does not', () => {
  const none = seoAudit(draftOf({ faq: [] }));
  assert.ok(none.findings.some((f) => f.rule === 'faq.count'));

  // Structured data describing nothing is a markup error on a live URL,
  // so the builder returns null rather than an empty FAQPage.
  assert.equal(faqJsonLd([], 'https://jessmove.com/blog/x'), null);
  assert.equal(faqJsonLd(undefined, 'https://jessmove.com/blog/x'), null);

  const ld = faqJsonLd(draftOf().faq, 'https://jessmove.com/blog/x') as Record<string, unknown>;
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal((ld.mainEntity as unknown[]).length, 2);
});

test('an answer too long to lift is summarised by the engine instead of quoted', () => {
  const audit = seoAudit(
    draftOf({
      faq: [
        { q: 'Is seated movement enough?', a: Array(80).fill('word').join(' ') },
        { q: 'Not a question', a: 'Short enough.' },
      ],
    }),
  );
  assert.ok(audit.findings.some((f) => f.rule === 'faq.answer'));
  assert.ok(audit.findings.some((f) => f.rule === 'faq.question'));
});

test('the named reviewer reaches the structured data, and is never invented', () => {
  /*
   * The one E-E-A-T signal this platform can make truthfully and most
   * cannot, because the review is a clinical safety control rather than a
   * workflow step — `posts` has a CHECK refusing a published row without
   * a named reviewer.
   */
  const base = {
    slug: 'x', title: 'T', description: 'D', category: 'Engineering',
    keyword: 'k', publishedAt: '2026-01-01',
  };
  const reviewed = articleJsonLd({ ...base, reviewedBy: 'Dr A. Patel' }, 'https://jessmove.com');
  assert.deepEqual(reviewed.reviewedBy, { '@type': 'Person', name: 'Dr A. Patel' });

  // Absent rather than empty when nobody is named.
  assert.equal('reviewedBy' in articleJsonLd(base, 'https://jessmove.com'), false);

  // An organisation stays an organisation; a byline is never manufactured.
  assert.deepEqual(articleJsonLd(base, 'https://jessmove.com').author, {
    '@type': 'Organization', name: 'JESS MOVE',
  });
});
