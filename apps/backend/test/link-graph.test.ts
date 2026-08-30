import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  LINK_TARGETS,
  MAX_AUTO_LINKS,
  SEED_POSTS,
  SEO_RULES,
  TOPIC_CLUSTERS,
  autoLinksFor,
  backlinksTo,
  buildLinkGraph,
  indexableTargets,
  isKnownPath,
  normalisePath,
  seoAudit,
  withAutoLinks,
  type GraphArticle,
  type PostDraft,
} from '@jessmove/shared';

/**
 * Links, and the two very different things people mean by "backlinks".
 *
 * Internal ones are built, audited and enforced here. External ones are
 * earned, and the tests at the bottom exist to make sure nothing in this
 * repository ever quietly starts manufacturing them — that is the category
 * of SEO work that removes a domain from an index rather than promoting it
 * in it, and a health platform has the most to lose from it.
 */

const article = (over: Partial<GraphArticle> = {}): GraphArticle => ({
  slug: 'a-post',
  title: 'A post',
  clusterKey: 'micro-movement',
  links: [],
  ...over,
});

/* ── the registry ──────────────────────────────────────────────────── */

test('every registered path is normalised and unique', () => {
  const seen = new Set<string>();
  for (const target of LINK_TARGETS) {
    assert.equal(target.path, normalisePath(target.path), `${target.path} is not normalised`);
    assert.ok(!seen.has(target.path), `${target.path} is registered twice`);
    seen.add(target.path);
    assert.ok(target.summary.length > 20, `${target.path} has no usable summary`);
  }
});

test('every cluster pillar is a page that exists', () => {
  // A cluster whose pillar is a 404 is a cluster whose every article links
  // into nothing, which is worse than having no cluster at all.
  for (const cluster of TOPIC_CLUSTERS) {
    assert.ok(
      isKnownPath(cluster.pillarPath),
      `the "${cluster.key}" cluster points at ${cluster.pillarPath}, which is not a page`,
    );
  }
});

test('a signed-in surface is never offered to a crawler', () => {
  /*
   * `indexableTargets()` is what the sitemap actually calls, so this now
   * checks the function that ships rather than a paths-only convenience
   * derived from it. `indexablePaths` was that convenience, and this test
   * was its only caller — a helper whose entire purpose was being tested.
   */
  const indexable = indexableTargets().map((t) => t.path);
  for (const path of ['/account', '/console', '/offline']) {
    assert.ok(!indexable.includes(path), `${path} is in the sitemap`);
  }
});

test('the chrome flag describes the footer that actually ships', () => {
  /*
   * The graph treats a page in the site chrome as having an inbound link
   * from everywhere, because the footer really does link to it from every
   * page. If that flag and the footer drift apart the orphan report starts
   * lying in one of two directions: pages that are genuinely unreachable
   * look fine, or ordinary pages look orphaned until nobody reads the
   * report at all.
   */
  const ui = readFileSync(new URL('../../frontend/app/ui.tsx', import.meta.url), 'utf8');
  const inFooter = new Set([...ui.matchAll(/'(\/[a-z-]*)'/g)].map((m) => m[1]!));

  for (const target of LINK_TARGETS) {
    if (target.noIndex) continue;
    const linked = inFooter.has(target.path);
    assert.equal(
      Boolean(target.inChrome),
      linked,
      `${target.path}: registry says inChrome=${Boolean(target.inChrome)}, the footer says ${linked}`,
    );
  }
});

test('an invented path is not a path', () => {
  assert.equal(isKnownPath('/foodlens'), true);
  assert.equal(isKnownPath('/features/foodlens'), false, 'the shape of a real URL is not a real URL');
  assert.equal(isKnownPath('/blog/movement-guide'), false);
  assert.equal(isKnownPath(`/blog/${SEED_POSTS[0]!.slug}`, SEED_POSTS.map((p) => p.slug)), true);
});

test('trailing slashes and query strings do not make a second page', () => {
  // Two URLs for one page is the site competing with itself.
  assert.equal(normalisePath('/foodlens/'), '/foodlens');
  assert.equal(normalisePath('/foodlens?utm_source=x'), '/foodlens');
  assert.equal(normalisePath('/foodlens#top'), '/foodlens');
  assert.equal(normalisePath('/'), '/');
});

/* ── contextual auto-linking ───────────────────────────────────────── */

test('prose gains a link where the subject is already mentioned', () => {
  const links = autoLinksFor('We built FoodLens because a photograph cannot tell you the energy.');
  const lens = links.find((l) => l.path === '/foodlens');
  assert.ok(lens, JSON.stringify(links));
  assert.equal(lens.phrase, 'FoodLens', 'the original casing is preserved');
});

test('the longest matching phrase wins the position', () => {
  const links = autoLinksFor('A movement break is not the same as a gym session.');
  const found = links.find((l) => l.path === '/micro-movement');
  assert.ok(found);
  assert.equal(found.phrase, 'movement break', 'not just "movement"');
});

test('no page is linked twice, however often it is named', () => {
  const text = 'FoodLens reads a photograph. FoodLens does not guess. FoodLens states a range.';
  const links = autoLinksFor(text);
  assert.equal(links.filter((l) => l.path === '/foodlens').length, 1);
});

test('a link is never planted inside a heading, a code span or an existing link', () => {
  const text = [
    '## What FoodLens does',
    '',
    'The `FoodLens` service is one thing.',
    'And [FoodLens](/foodlens) was already linked.',
    'See https://example.com/foodlens for nothing.',
  ].join('\n');
  assert.equal(
    autoLinksFor(text).filter((l) => l.path === '/foodlens').length,
    0,
    'every occurrence is in a place a link must not go',
  );
});

test('an article never links to itself', () => {
  const links = autoLinksFor('The blog covers this.', { selfPath: '/blog' });
  assert.ok(!links.some((l) => l.path === '/blog'));
});

test('the number of automatic links is bounded', () => {
  // Every registered phrase in one paragraph. A page where each is a link
  // is a link farm, and each link is worth less than the last.
  const text = LINK_TARGETS.flatMap((t) => t.phrases).join(', ');
  assert.ok(autoLinksFor(text).length <= MAX_AUTO_LINKS, `${autoLinksFor(text).length} links`);
  assert.ok(autoLinksFor(text, { max: 2 }).length <= 2);
});

test('applying the links leaves the prose otherwise untouched', () => {
  const text = 'We built FoodLens for this.';
  const linked = withAutoLinks(text);
  assert.match(linked, /\[FoodLens\]\(\/foodlens\)/);
  assert.equal(linked.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'), text, 'the words are the same words');
});

test('a word boundary is respected, so "children" does not match inside another word', () => {
  assert.equal(autoLinksFor('grandchildren').length, 0);
  assert.ok(autoLinksFor('written for children').some((l) => l.path === '/for-children'));
});

/* ── the graph, and the backlinks ──────────────────────────────────── */

test('the graph knows what points at each page, not only what each page points at', () => {
  const graph = buildLinkGraph([
    article({ slug: 'one', clusterKey: 'micro-movement', links: ['/foodlens'] }),
    article({ slug: 'two', clusterKey: 'micro-movement', links: [] }),
  ]);

  const lens = graph.nodes.find((n) => n.path === '/foodlens');
  assert.ok(lens);
  assert.ok(lens.inbound.includes('/blog/one'), JSON.stringify(lens.inbound));

  // Siblings in a cluster link to each other in both directions.
  const one = graph.nodes.find((n) => n.path === '/blog/one');
  assert.ok(one?.outbound.includes('/blog/two'));
  assert.ok(one?.inbound.includes('/blog/two'));
});

test('an article in a cluster always links up to its pillar', () => {
  const graph = buildLinkGraph([article({ slug: 'one', clusterKey: 'food-intelligence' })]);
  const one = graph.nodes.find((n) => n.path === '/blog/one');
  assert.ok(one?.outbound.includes('/foodlens'), JSON.stringify(one?.outbound));
});

test('prose links count as edges, not just the list at the bottom', () => {
  const graph = buildLinkGraph([
    article({ slug: 'one', clusterKey: null, links: [], body: 'A movement break beats a gym session.' }),
  ]);
  const one = graph.nodes.find((n) => n.path === '/blog/one');
  assert.ok(
    one?.outbound.includes('/micro-movement'),
    'a link inside a sentence is the same edge to a crawler',
  );
});

test('a link to a page that does not exist is reported rather than counted', () => {
  const graph = buildLinkGraph([article({ slug: 'one', links: ['/blog/does-not-exist', '/invented'] })]);
  assert.equal(graph.dead.length, 2, JSON.stringify(graph.dead));
  assert.ok(graph.dead.every((d) => d.from === '/blog/one'));
  const one = graph.nodes.find((n) => n.path === '/blog/one');
  assert.ok(!one?.outbound.includes('/invented'), 'and it is not an edge');
});

test('backlinks come back richest first', () => {
  const graph = buildLinkGraph(
    SEED_POSTS.map((p) => article({ slug: p.slug, clusterKey: p.clusterKey })),
  );
  const inbound = backlinksTo(graph, '/foodlens');
  assert.ok(inbound.length > 0, 'the FoodLens pillar has internal backlinks');
  for (let i = 1; i < inbound.length; i += 1) {
    assert.ok(
      inbound[i - 1]!.inbound.length >= inbound[i]!.inbound.length,
      'a page with more authority is listed first',
    );
  }
});

test('the real corpus leaves nothing orphaned and nothing broken', () => {
  const graph = buildLinkGraph(
    SEED_POSTS.map((p) => article({ slug: p.slug, clusterKey: p.clusterKey })),
  );
  assert.deepEqual(graph.dead, [], `dead links: ${JSON.stringify(graph.dead)}`);
  assert.deepEqual(graph.orphans, [], `orphans: ${JSON.stringify(graph.orphans)}`);
  assert.ok(graph.totalEdges > 100, `only ${graph.totalEdges} internal links across the site`);
});

/* ── the audit learned about links ─────────────────────────────────── */

const draft = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: 'How long a movement break needs to be, measured',
  slug: 'how-long-a-movement-break-needs-to-be',
  description:
    'We measured how long a movement break has to run before it does anything at all, and the ' +
    'answer was shorter than every guideline we had read said it would be.',
  category: 'Behaviour',
  keyword: 'movement break',
  secondaryKeywords: [],
  body: `${'## A section\n\nword '.repeat(3)}${'word '.repeat(700)}`,
  clusterKey: 'micro-movement',
  internalLinks: ['/micro-movement', '/how-it-works', '/blog', '/mova'],
  ...over,
});

test('an invented link fails the audit as a blocker', () => {
  const audit = seoAudit(draft({ internalLinks: ['/micro-movement', '/blog/movement-guide'] }));
  const dead = audit.findings.find((f) => f.rule === 'links.dead');
  assert.ok(dead, JSON.stringify(audit.findings.map((f) => f.rule)));
  assert.equal(dead.severity, 'blocker');
  assert.equal(audit.passes, false, 'and the draft cannot reach review');
});

test('an article that does not link up to its pillar is caught', () => {
  const audit = seoAudit(draft({ internalLinks: ['/blog', '/mova', '/about', '/how-it-works'] }));
  assert.ok(audit.findings.some((f) => f.rule === 'links.pillar'), JSON.stringify(audit.findings));
});

test('four internal links is now the floor', () => {
  assert.equal(SEO_RULES.internalLinksMin, 4);
  const thin = seoAudit(draft({ internalLinks: ['/micro-movement', '/blog'] }));
  assert.ok(thin.findings.some((f) => f.rule === 'links.internal'));
});

test('the same link twice is a note, not a second link', () => {
  const audit = seoAudit(
    draft({ internalLinks: ['/micro-movement', '/micro-movement/', '/blog', '/mova', '/about'] }),
  );
  assert.ok(audit.findings.some((f) => f.rule === 'links.duplicate'));
});

test('an absolute URL to our own site is corrected rather than accepted', () => {
  const audit = seoAudit(
    draft({ internalLinks: ['https://jessmove.com/micro-movement', '/blog', '/mova', '/about'] }),
  );
  assert.ok(audit.findings.some((f) => f.rule === 'links.external'));
});

test('a well-linked article still passes', () => {
  const audit = seoAudit(draft());
  assert.equal(audit.passes, true, JSON.stringify(audit.findings, null, 2));
});

/* ── the site's own machinery ──────────────────────────────────────── */

test('the sitemap and robots exist at all, which they did not', () => {
  const sitemap = readFileSync(new URL('../../frontend/app/sitemap.ts', import.meta.url), 'utf8');
  const robots = readFileSync(new URL('../../frontend/app/robots.ts', import.meta.url), 'utf8');

  /*
   * The property, not the expression. This used to assert the literal
   * `LINK_TARGETS.filter((t) => !t.noIndex)`, which pinned an inline copy
   * of a rule that also existed as `indexablePaths()` in the registry —
   * so the test enforced the duplicate and would have failed the fix.
   */
  assert.match(sitemap, /indexableTargets\(\)/, 'generated from the registry');
  assert.match(sitemap, /POSTS\.map/, 'and every article is in it');
  assert.ok(
    !/lastModified: new Date\(\)/.test(sitemap),
    'a build-time date on every page tells a crawler the whole site changes daily, and it stops believing the field',
  );
  assert.match(robots, /sitemap: `\$\{SITE\}\/sitemap\.xml`/);
  assert.match(robots, /nonIndexableTargets\(\)/, 'one source for both files');
});

test('the feed carries descriptions, not whole articles', () => {
  const feed = readFileSync(
    new URL('../../frontend/app/blog/feed.xml/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(feed, /<description>\$\{escape\(post\.description\)\}<\/description>/);
  assert.ok(!/post\.sections/.test(feed), 'a full-text feed gets republished in place of the original');
  assert.match(feed, /guid isPermaLink="true"/);
});

test('nothing in this repository manufactures an external link', () => {
  // The line that must never be crossed. Buying, exchanging or generating
  // links from other sites is the one SEO tactic that gets a domain
  // removed from an index, and a health platform has the most to lose.
  for (const file of [
    '../src/blog/seo-agent.service.ts',
    '../src/blog/seo-autopilot.service.ts',
    '../src/blog/seo-autopilot.logic.ts',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const pattern of [
      /link\s*exchange/i,
      /buyLink|purchaseLink|linkFarm|pbn/i,
      /guestPost.*submit|submitTo(Directory|Aggregator)/i,
    ]) {
      assert.ok(!pattern.test(code), `${file} matches ${pattern}`);
    }
  }
});
