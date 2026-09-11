import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ARTICLES,
  BANNED_LEXICON,
  BANNED_LEXICON_STRICT,
  SEED_POSTS,
  articleBody,
  bannedTermsIn,
  seoAudit,
  type PostDraft,
} from '@jessmove/shared';

/**
 * Attempts on the lexicon exemption.
 *
 * A gate that has never been pushed against is a gate somebody is
 * assuming. This one lets a hand-written article mention a term the
 * product will never say — `a number labelled "body fat"` explaining what
 * rule C6 forbids — and every test here tries to get something through it
 * that should not go.
 *
 * The exemption exists because the lexicon was doing two jobs. Stopping
 * the product saying "burn fat" to a person is the job it was written
 * for. Stopping the platform writing about its own rules was not, and it
 * was doing that too, because `seoAudit` is the blog's gate and the check
 * lives inside it.
 */

const base = (over: Partial<PostDraft> = {}): PostDraft => ({
  title: 'A title with no banned term anywhere inside it at all',
  slug: 'a-title-with-no-banned-term',
  description:
    'A description that is comfortably inside the window and contains nothing from the ' +
    'lexicon, so that the body is the only thing under examination here.',
  category: 'Engineering',
  keyword: 'database constraints',
  secondaryKeywords: [],
  body:
    'Database constraints are the subject, stated in the opening so an answer engine has ' +
    'something to lift, and repeated naturally below rather than stuffed.\n\n' +
    `## One\n\n${'word '.repeat(300)}\n\n## Two\n\n${'word '.repeat(300)}\n\n` +
    `## Three\n\nDatabase constraints again, and database constraints once more.`,
  internalLinks: ['/developers', '/policies', '/assurance', '/status'],
  faq: [
    { q: 'What is a database constraint?', a: 'A rule the database itself refuses to break.' },
    { q: 'Why not keep it in code?', a: 'Because a second write path forgets it.' },
  ],
  ...over,
});

const lexiconFindings = (draft: PostDraft, strict = false) =>
  seoAudit(draft, strict).findings.filter((f) => f.rule === 'editorial.lexicon');

test('without a declaration the term is still a blocker', () => {
  const findings = lexiconFindings(base({ body: `${base().body}\n\nA safeguarding failure.` }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, 'blocker');
});

test('a declared mention passes, and only the term declared', () => {
  const body = `${base().body}\n\nA safeguarding failure, and nothing about guilt.`;

  const declared = lexiconFindings(
    base({
      body,
      lexiconExemptions: [
        { term: 'failure', because: 'Engineering English about a category of incident, not a person.' },
      ],
    }),
  );

  // "failure" is permitted; "guilt" in the same sentence is not.
  assert.equal(declared.length, 1);
  assert.match(declared[0]!.detail, /guilt/);
});

test('a title or description is never exempt, whatever is declared', () => {
  /*
   * The guard that matters most. These two lines travel without their
   * article — into a search result, a social card, `llms.txt`, a shared
   * link — and a term that needs context is exactly the term that must
   * not appear where there is none.
   */
  const exemptions = [
    { term: 'guilt', because: 'The article is about rejecting guilt-framed mechanics entirely.' },
  ];

  const inTitle = lexiconFindings(
    base({ title: 'The guilt mechanic, and why we removed it from the product', lexiconExemptions: exemptions }),
  );
  assert.ok(inTitle.length > 0, 'a declared term reached the title');
  assert.match(inTitle[0]!.detail, /title or description/);

  const inDescription = lexiconFindings(
    base({
      description:
        'A description mentioning guilt, which is a term that must never appear in the one ' +
        'line a search engine shows without any of the surrounding argument.',
      lexiconExemptions: exemptions,
    }),
  );
  assert.ok(inDescription.length > 0, 'a declared term reached the description');
});

test('strict voids every exemption — nothing a minor may read is negotiable', () => {
  const draft = base({
    body: `${base().body}\n\nA safeguarding failure.`,
    lexiconExemptions: [
      { term: 'failure', because: 'Engineering English about a category of incident, not a person.' },
    ],
  });

  assert.equal(lexiconFindings(draft, false).length, 0, 'permitted in an adult context');
  assert.ok(
    lexiconFindings(draft, true).length > 0,
    'the same declaration was honoured for an article a minor may read',
  );
});

test('the strict additions can never be exempted at all', () => {
  // body, shape, size, compete, beat, rank. They are only banned under
  // strict, and under strict no exemption is honoured — so there is no
  // combination of inputs that lets one through.
  const strictOnly = BANNED_LEXICON_STRICT.filter(
    (t) => !(BANNED_LEXICON as readonly string[]).includes(t),
  );
  assert.ok(strictOnly.length > 0);

  for (const term of strictOnly) {
    const draft = base({
      body: `${base().body}\n\nThis sentence contains ${term} deliberately.`,
      lexiconExemptions: [{ term, because: 'An attempt to exempt a strict-only term, which must fail.' }],
    });
    assert.ok(
      lexiconFindings(draft, true).length > 0,
      `"${term}" was exempted under strict`,
    );
  }
});

test('an exemption for a word the article does not use is reported, not ignored', () => {
  /*
   * Left alone it is a gate held open for later: somebody edits the piece
   * a year on, the word appears, and the permission was granted in
   * advance by a line nobody remembers writing.
   */
  const findings = seoAudit(
    base({
      lexiconExemptions: [
        { term: 'guilt', because: 'Declared here without the article ever containing the word.' },
      ],
    }),
  ).findings.filter((f) => f.rule === 'editorial.exemption');

  assert.equal(findings.length, 1);
  assert.match(findings[0]!.detail, /declared and never used/);
});

test('an exemption without a real reason is reported', () => {
  const findings = seoAudit(
    base({
      body: `${base().body}\n\nA safeguarding failure.`,
      lexiconExemptions: [{ term: 'failure', because: 'fine' }],
    }),
  ).findings.filter((f) => f.rule === 'editorial.exemption');

  assert.equal(findings.length, 1);
  assert.match(findings[0]!.fix, /disagree with/);
});

test('a model cannot reach the exemption at all', () => {
  /*
   * The property that makes this safe rather than merely narrow.
   *
   * `SeoAgentService` calls `assertEditorialSafe` on every generated
   * draft, and that throws — it does not consult the audit and has no
   * notion of an exemption. So the path that produces copy at scale is
   * exactly as absolute as it was, and a declaration can only ever cover
   * prose a person wrote and a named reviewer cleared.
   */
  const agent = readFileSync(
    new URL('../src/blog/seo-agent.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(agent, /assertEditorialSafe\(/, 'the agent no longer hard-gates its own output');
  assert.doesNotMatch(
    agent,
    /lexiconExemptions/,
    'the agent can now declare its own exemptions, which defeats the point of them',
  );
});

test('every declared exemption in the corpus is used, reasoned, and on the list', () => {
  for (const article of ARTICLES) {
    const seed = SEED_POSTS.find((p) => p.slug === article.slug)!;
    const used = new Set(bannedTermsIn(articleBody(article)).map((t) => t.toLowerCase()));

    for (const declared of article.lexicon ?? []) {
      const term = declared.term.toLowerCase();
      assert.ok(
        (BANNED_LEXICON as readonly string[]).includes(term),
        `${article.slug} exempts "${term}", which is not a banned term`,
      );
      assert.ok(used.has(term), `${article.slug} exempts "${term}" and never uses it`);
      assert.ok(
        declared.because.trim().length >= 25,
        `${article.slug} exempts "${term}" without saying why`,
      );
      // And never in the two lines that travel alone.
      assert.deepEqual(bannedTermsIn(`${seed.title} ${article.description}`), []);
    }
  }
});
