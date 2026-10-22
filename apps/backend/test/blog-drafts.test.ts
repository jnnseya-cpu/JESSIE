import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BANNED_LEXICON,
  DRAFT_ARTICLES,
  SEED_POSTS,
  bannedTermsIn,
  seoAudit,
} from '@jessmove/shared';

/**
 * The feature articles, held to the gate the published half goes through.
 *
 * `DRAFT_ARTICLES` is prose an agent wrote and nobody has cleared. It
 * renders nowhere, and the point of these assertions is that a reviewer
 * reading one is being asked the only question a machine cannot answer —
 * is this true, and is it ours to say — rather than also having to count
 * characters and check links.
 */

/** A draft may link to a published post or to a sibling draft. */
const knownSlugs = [...SEED_POSTS.map((p) => p.slug), ...DRAFT_ARTICLES.map((d) => d.slug)];

test('every draft passes the real SEO and editorial audit', () => {
  const failures: string[] = [];

  for (const draft of DRAFT_ARTICLES) {
    const audit = seoAudit(draft, false, knownSlugs);
    if (!audit.passes) {
      const blocking = audit.findings
        .filter((f) => f.severity !== 'note')
        .map((f) => `${f.rule} (${f.detail})`)
        .join('; ');
      failures.push(`${draft.slug}: score ${audit.score} — ${blocking}`);
    }
  }

  assert.deepEqual(
    failures,
    [],
    'a draft that cannot pass the audit is not ready to put in front of a reviewer',
  );
});

/**
 * No exemptions in this file, and the test is what keeps it that way.
 *
 * The exemption mechanism exists so a person can mention a banned term in
 * their own prose for a stated reason. Using it here would reach around
 * the one control that is absolute for generated copy — `seoAudit`
 * honours exemptions, so a draft could declare its way past the lexicon.
 * Rewording is the only route these articles have.
 */
test('no draft claims a lexicon exemption', () => {
  for (const draft of DRAFT_ARTICLES) {
    assert.equal(
      draft.lexiconExemptions,
      undefined,
      `${draft.slug} declares an exemption; reword the sentence instead`,
    );
  }
});

test('the absolute lexicon holds in every part of every draft', () => {
  for (const draft of DRAFT_ARTICLES) {
    for (const [part, text] of [
      ['title', draft.title],
      ['description', draft.description],
      ['body', draft.body],
    ] as const) {
      assert.deepEqual(
        bannedTermsIn(text),
        [],
        `${draft.slug} ${part} contains a banned term`,
      );
    }

    // The FAQ travels without its article into a search result, so it is
    // held to the same standard as a title rather than to the body's.
    for (const pair of draft.faq ?? []) {
      assert.deepEqual(
        bannedTermsIn(`${pair.q} ${pair.a}`),
        [],
        `${draft.slug} has a banned term in its question-and-answer pairs`,
      );
    }
  }
});

/**
 * The guard that matters most in this file.
 *
 * A draft becoming published must be somebody's deliberate act, not the
 * side effect of a merge. If a slug appears in both lists then either it
 * was published and left behind here, or it was copied without being
 * removed — and in both cases the repository now has two versions of one
 * article with nothing saying which is live.
 */
test('no draft has quietly become a published post', () => {
  const published = new Set(SEED_POSTS.map((p) => p.slug));
  for (const draft of DRAFT_ARTICLES) {
    assert.equal(
      published.has(draft.slug),
      false,
      `"${draft.slug}" is in SEED_POSTS and still in DRAFT_ARTICLES — remove the draft, naming the reviewer in the commit`,
    );
  }
});

test('the lexicon these drafts were written against has not changed under them', () => {
  // If a term is added to the absolute list, the drafts need re-checking
  // rather than silently continuing to pass a weaker rule than they were
  // written to. The count is the cheapest tripwire for that.
  assert.equal(
    BANNED_LEXICON.length,
    16,
    'the absolute lexicon changed — re-run the draft checks and reword anything caught',
  );
});
