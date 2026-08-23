import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ARTICLES, SEED_POSTS, articleBody, bodyForSlug, seoAudit } from '@jessmove/shared';

/**
 * Two things that were reported as broken, and the four faults behind them.
 *
 * Neither reported symptom was a fault in the thing named. The view count
 * was not miscounting — nothing ever reached the counter. The SEO scores
 * were not scoring badly — there was nothing to score. Both had been that
 * way since they were built, and neither logged anything, which is what
 * kept them unfound.
 *
 * Every assertion here corresponds to one of the four.
 */

const FRONTEND = new URL('../../frontend/app/', import.meta.url);
const readFront = (rel: string) => readFileSync(new URL(rel, FRONTEND), 'utf8');
const readBack = (rel: string) => readFileSync(new URL(rel, new URL('../src/', import.meta.url)), 'utf8');

/* ------------------------------------------------------------------ *
 * Fault 1 — the beacon never arrived
 * ------------------------------------------------------------------ */

test('the view beacon does not use sendBeacon with a JSON blob', () => {
  const src = readFront('blog/view-beacon.tsx');

  /*
   * A Blob typed application/json makes a cross-origin request
   * preflighted, and sendBeacon cannot preflight, so the browser drops it.
   * The call still returns true — that only means "queued locally" — so
   * there was no console error, no failed request and no log line. The
   * site and the API are on different hosts in every environment, so this
   * never delivered a single view anywhere.
   */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /navigator\.sendBeacon/, 'sendBeacon is back');
  assert.match(code, /keepalive:\s*true/, 'the send must survive the page closing');
});

test('the view beacon resolves the API the same way everything else does', () => {
  const src = readFront('blog/view-beacon.tsx');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /*
   * It used to read NEXT_PUBLIC_API_BASE_URL itself and return early when
   * unset, which disabled it in silence on any deployment missing that
   * build-time variable while the rest of the site carried on — everything
   * else resolves at runtime and falls back to api.jessmove.com.
   * `api-base.ts` exists because three components once defaulted to
   * localhost in production; this was the fourth.
   */
  assert.match(code, /apiBase\(\)/, 'the beacon must use the shared resolver');
  assert.doesNotMatch(
    code,
    /process\.env\.NEXT_PUBLIC_API_BASE_URL/,
    'the beacon reads the build-time variable directly again',
  );
});

/* ------------------------------------------------------------------ *
 * Fault 2 — the counter forgot everything on every cold start
 * ------------------------------------------------------------------ */

test('views are written to the database, not to an array', () => {
  const src = readBack('blog/analytics.service.ts');

  assert.match(src, /INSERT INTO blog_views/, 'views are not persisted');
  assert.match(src, /blog_view_salts/, 'the daily salt is not shared between instances');

  // The in-memory path may exist as a no-database fallback, but it must not
  // be the only thing there — which is what it was.
  assert.match(src, /makePool/, 'the service never opens a pool');
});

test('the file is text, so a search can find the bug in it', () => {
  // A literal NUL byte in a string made this file read as binary to grep
  // and to git. The storage bug above sat inside a file that every content
  // search silently skipped.
  const raw = readFileSync(new URL('../src/blog/analytics.service.ts', import.meta.url));
  assert.equal(raw.includes(0), false, 'a literal NUL byte is back in the source');
});

/* ------------------------------------------------------------------ *
 * Fault 3 — published articles could never be counted
 * ------------------------------------------------------------------ */

test('a view is countable for a published post, not only for the seeded corpus', () => {
  const src = readBack('blog/analytics.service.ts');
  // It used to accept only SEED_POSTS slugs, so every article the editorial
  // pipeline published recorded zero views for ever — which is the entire
  // output of the content engine.
  assert.match(src, /FROM posts WHERE slug = \$1 AND status = 'published'/);
});

/* ------------------------------------------------------------------ *
 * Fault 4 — there was nothing to score
 * ------------------------------------------------------------------ */

test('every published article has prose the auditor can read', () => {
  for (const seed of SEED_POSTS) {
    const body = bodyForSlug(seed.slug);
    assert.ok(body.length > 400, `${seed.slug} has ${body.length} characters of body`);
  }
});

test('the serialised body carries the headings and the prose the reader sees', () => {
  const article = ARTICLES[0]!;
  const body = articleBody(article);

  assert.ok(body.startsWith(article.lede), 'the lede is missing from the body');
  for (const section of article.sections) {
    assert.ok(body.includes(`## ${section.h}`), `heading "${section.h}" is missing`);
    for (const paragraph of section.p) {
      assert.ok(body.includes(paragraph), 'a paragraph the reader sees is not in the audited body');
    }
  }
});

test('every article now produces a real score instead of "not audited"', () => {
  for (const seed of SEED_POSTS) {
    const body = bodyForSlug(seed.slug);
    const audit = seoAudit({
      title: seed.title,
      slug: seed.slug,
      description: ARTICLES.find((a) => a.slug === seed.slug)?.description ?? seed.title,
      category: seed.category,
      keyword: seed.keyword,
      secondaryKeywords: [],
      body,
      internalLinks: [],
    });

    assert.equal(typeof audit.score, 'number', `${seed.slug} produced no score`);
    assert.ok(audit.score >= 0 && audit.score <= 100, `${seed.slug} scored ${audit.score}`);
    // The findings are the useful part — a score with no findings behind it
    // is a number nobody can act on.
    assert.ok(Array.isArray(audit.findings), `${seed.slug} produced no findings`);
  }
});

test('the description scored is the article’s own, not the title with a full stop', () => {
  // The backend seeded `description: `${title}.`` as a placeholder, so the
  // audit reported every article's description as 26 characters — measuring
  // the placeholder rather than the article.
  const src = readBack('blog/blog.service.ts');
  assert.match(src, /article\?\.description/, 'the seeded description is a placeholder again');

  for (const article of ARTICLES) {
    assert.ok(
      article.description.length > 60,
      `${article.slug} has a ${article.description.length}-character description`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * The corpus moved — the site must still be able to render it
 * ------------------------------------------------------------------ */

test('the prose has exactly one home', () => {
  const posts = readFront('blog/posts.ts');
  // The frontend module assembles and renders; it holds no content, so the
  // audit and the page can never be reading different words.
  assert.match(posts, /from '@jessmove\/shared'/);
  assert.doesNotMatch(posts, /const ARTICLES: readonly Article\[\] = \[/, 'a second copy of the corpus');
  assert.ok(ARTICLES.length >= 8, `only ${ARTICLES.length} articles reached shared`);
});
