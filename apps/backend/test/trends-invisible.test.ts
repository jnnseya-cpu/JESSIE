/**
 * The trend engine must not be visible to anybody using the platform.
 *
 * It is a control layer, not a feature. Nobody signs in and finds it,
 * nothing on a public page mentions it, and no member-facing response
 * carries a brief, a score or a topic decision. The whole of its visible
 * effect is that a page's title reads better and an article was written
 * about the right thing — which is indistinguishable, from outside, from
 * a good editor having a good week. That is the intended outcome.
 *
 * Invisibility is not an aesthetic preference here. The engine scores
 * demand and decides what the platform says about people's bodies, and a
 * member who could see it could learn that they are being scored. So this
 * file asserts the absence of a surface, which is a thing no other test
 * does: `admin-guard.test.ts` asks whether a route is guarded,
 * `unreachable.test.ts` asks whether a route can be reached, and neither
 * asks whether a member can tell the thing exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..');
const BACKEND = join(REPO, 'apps', 'backend', 'src');
const FRONTEND = join(REPO, 'apps', 'frontend');
const TRENDS = join(BACKEND, 'trends');

function filesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  const walk = (at: string) => {
    let entries;
    try {
      entries = readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', 'dist', '.git'].includes(entry.name)) continue;
        walk(path);
      } else if (extensions.some((e) => entry.name.endsWith(e))) {
        out.push(path);
      }
    }
  };
  walk(dir);
  return out;
}

/** Strip comments, so a word explaining the rule does not break it. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(?<!:)\/\/[^\n]*/g, '');
}

test('the scan found the frontend and the trends module', () => {
  /*
   * Asserted before anything is asserted absent. An absence proved by a
   * scan that matched no files is the most convincing wrong answer there
   * is, and this repository has produced five of them.
   */
  assert.ok(statSync(FRONTEND).isDirectory(), 'the frontend is not where expected');
  assert.ok(statSync(TRENDS).isDirectory(), 'the trends module is not where expected');

  const frontendFiles = filesUnder(FRONTEND, ['.ts', '.tsx', '.css']);
  assert.ok(
    frontendFiles.length >= 50,
    `expected the frontend's sources, found ${frontendFiles.length}`,
  );
  const trendFiles = filesUnder(TRENDS, ['.ts']);
  assert.ok(
    trendFiles.length >= 5,
    `expected the trends module's sources, found ${trendFiles.length}`,
  );
});

test('no frontend file reaches the trend engine', () => {
  /*
   * The engine has no user interface and must not acquire one by
   * accident. A fetch to `/trends` from the frontend would be the first
   * step towards a member seeing a score about themselves, and it would
   * be refused at runtime by the admin guard — but the attempt belongs in
   * a failing test rather than in a browser console.
   */
  const offenders: string[] = [];
  for (const path of filesUnder(FRONTEND, ['.ts', '.tsx'])) {
    const source = withoutComments(readFileSync(path, 'utf8'));
    if (/['"`]\/(api\/)?trends\//.test(source) || /\/trends\/(policy|briefs|actions|observations|score)/.test(source)) {
      offenders.push(path.slice(REPO.length + 1));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these frontend files reach the trend engine, which has no user-facing ' +
      'surface and must not get one:\n' + offenders.join('\n'),
  );
});

test('the engine names itself nowhere a member or visitor can read', () => {
  /*
   * Not just the routes — the words. A visitor should not find "growth
   * brief" or "opportunity score" in a page, a meta description or a
   * stylesheet comment that ships. The platform's public voice is about
   * movement, and a member reading that their topic scored 86 would
   * rightly wonder what else is being scored.
   */
  /*
   * The trend engine's own vocabulary, and only that.
   *
   * An earlier version of this list forbade "opportunity score" and
   * failed on `how-it-works/page.tsx`, which publishes "The Movement
   * Opportunity Score" — the member-facing concept from
   * `core-concepts.ts`, about whether to prompt one person to move in the
   * next few minutes. That is a real public feature and it owns the
   * phrase. It is also exactly the collision that made the trend score
   * take a qualifier in the first place, and a blunt word list nearly
   * mistook the older concept for the new one.
   */
  const forbidden = [
    /growth brief/i,
    /trend intelligence/i,
    /priority[_ ]review/i,
    /reviewable[_ ]brief/i,
    /corroborat/i,
    /opportunity snapshot/i,
  ];
  const offenders: string[] = [];
  for (const path of filesUnder(FRONTEND, ['.tsx', '.ts'])) {
    const source = readFileSync(path, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        offenders.push(`${path.slice(REPO.length + 1)} — ${String(pattern)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'the engine is named where a reader could see it:\n' + offenders.join('\n'),
  );
});

test('every route on the engine is admin-only, with no exceptions', () => {
  /*
   * The funnel beacon next door is deliberately public to write, because
   * a browser saying "somebody landed" is cheap and worthless to forge.
   * An observation is not like that: writing one steers a decision about
   * what the platform publishes about health, so the ability to write one
   * is the ability to steer that decision.
   */
  const source = withoutComments(
    readFileSync(join(TRENDS, 'trends.controller.ts'), 'utf8'),
  );
  const routes = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)];
  assert.ok(routes.length >= 9, `expected the engine's routes, found ${routes.length}`);

  // Every verb decorator must have an @AdminOnly() in the decorator run
  // immediately above it.
  const chunks = source.split(/@(?=Get\(|Post\(|Put\(|Patch\(|Delete\()/);
  const unguarded: string[] = [];
  for (let i = 1; i < chunks.length; i += 1) {
    const path = /^\w+\(['"]([^'"]*)['"]?/.exec(chunks[i]!)?.[1] ?? '(root)';
    // The decorators for this route are the tail of the previous chunk.
    const previous = chunks[i - 1]!;
    const trailing = previous.slice(previous.lastIndexOf('\n\n'));
    if (!/@AdminOnly\(\)/.test(trailing)) unguarded.push(path);
  }
  assert.deepEqual(
    unguarded,
    [],
    'these engine routes are not admin-only: ' + unguarded.join(', '),
  );
});

test('the engine cannot publish, and the write path has one door', () => {
  /*
   * Structural, not conventional. `TrendsModule` must not import the blog
   * or editorial services, because `BlogService.publish` exists and an
   * engine that could reach it would be one refactor away from a
   * draft-to-published edge. And `ActionsService` must not be exported,
   * so the only way to propose, approve or apply a change to a public
   * page is the admin API, where a person is on the other end.
   */
  const moduleSource = readFileSync(join(TRENDS, 'trends.module.ts'), 'utf8');
  assert.doesNotMatch(
    withoutComments(moduleSource),
    /from '\.\.\/blog\//,
    'the trends module imports from the blog, which puts publish() in reach',
  );
  assert.match(
    moduleSource,
    /exports:\s*\[([^\]]*)\]/,
    'the trends module declares no exports block',
  );
  const exported = /exports:\s*\[([^\]]*)\]/.exec(moduleSource)![1]!;
  assert.doesNotMatch(
    exported,
    /ActionsService/,
    'ActionsService is exported, so something outside this module can write ' +
      'to a public page without going through the admin API',
  );

  for (const path of filesUnder(TRENDS, ['.ts'])) {
    const source = withoutComments(readFileSync(path, 'utf8'));
    /*
     * Writes only. An earlier version matched `status = 'published'`,
     * which flagged the readiness query — a SELECT that asks whether
     * there is a published page to improve. Reading what is published is
     * the opposite of publishing, and conflating them makes the test
     * unsatisfiable without weakening what it checks.
     */
    assert.doesNotMatch(
      source,
      /\.publish\(|\.transition\(/,
      `${path.slice(REPO.length + 1)} calls publish or transition`,
    );
    assert.doesNotMatch(
      source,
      /UPDATE posts SET[^;]*status/,
      `${path.slice(REPO.length + 1)} writes a post's status`,
    );
    assert.doesNotMatch(
      source,
      /INSERT INTO posts/,
      `${path.slice(REPO.length + 1)} creates a page`,
    );
  }
});

test('the autopilot treats a brief as data and survives without one', () => {
  /*
   * Two properties, both load-bearing.
   *
   * The brief reaches a model prompt, and it is assembled from evidence
   * rows and a reviewer's free text — so it is untrusted input in the
   * only place on this platform where untrusted input meets an agent that
   * writes health copy. It must arrive fenced and labelled as a
   * description, with the surrounding text saying what it may not do.
   *
   * And the writing must not depend on the reading. If the collector or
   * the scorer throws, the autopilot has to carry on behaving exactly as
   * it did before the engine existed. An intelligence layer that can stop
   * the thing it was meant to improve is worse than none.
   */
  const agent = readFileSync(join(BACKEND, 'blog', 'seo-agent.service.ts'), 'utf8');
  assert.match(agent, /--- brief \(data\) ---/, 'the brief is not fenced in the prompt');
  assert.match(
    agent,
    /not instructions to you/,
    'the prompt does not tell the model the brief is a description rather ' +
      'than an instruction',
  );
  assert.match(
    agent,
    /cannot\n.*change the rules above|change the rules above/s,
    'the prompt does not say the brief cannot change the rules',
  );

  const autopilot = readFileSync(
    join(BACKEND, 'blog', 'seo-autopilot.service.ts'),
    'utf8',
  );
  // readEvidence must swallow its own failures.
  const readEvidence = autopilot.slice(
    autopilot.indexOf('private async readEvidence'),
    autopilot.indexOf('private async briefFor'),
  );
  assert.ok(readEvidence.length > 100, 'readEvidence is not where expected');
  assert.match(
    readEvidence,
    /catch \(error\)/,
    'readEvidence can throw, which would stop the autopilot writing at all',
  );
  assert.match(
    readEvidence,
    /baseline behaviour/,
    'readEvidence does not say what it falls back to',
  );

  const briefFor = autopilot.slice(
    autopilot.indexOf('private async briefFor'),
    autopilot.indexOf('private async briefFor') + 1200,
  );
  assert.match(
    briefFor,
    /catch\s*\{\s*\n?\s*return null;/,
    'briefFor can throw rather than falling back to no brief',
  );
});

test('the collector reads only tables the platform already writes', () => {
  /*
   * The engine is keyless by construction, and this is where that is
   * either true or not. The collector may read the platform's own
   * first-party tables and nothing else: no fetch, no external host, no
   * credential. If a future change wants an external feed it has to add
   * one here, and this test is where that argument happens.
   */
  const source = withoutComments(
    readFileSync(join(TRENDS, 'collector.service.ts'), 'utf8'),
  );
  assert.doesNotMatch(source, /fetch\(|https?:\/\//, 'the collector reaches the network');
  assert.doesNotMatch(
    source,
    /API_KEY|SECRET|TOKEN|process\.env\.(?!DATABASE_URL)/,
    'the collector reads configuration beyond the database URL',
  );

  const tables = [...source.matchAll(/FROM (\w+)/g)].map((m) => m[1]!);
  const joined = [...source.matchAll(/JOIN (\w+)/g)].map((m) => m[1]!);
  const allowed = new Set(['funnel_events', 'blog_views', 'posts']);
  const unexpected = [...new Set([...tables, ...joined])].filter(
    (t) => !allowed.has(t),
  );
  assert.deepEqual(
    unexpected,
    [],
    'the collector reads tables outside the first-party set: ' +
      unexpected.join(', '),
  );
  assert.ok(tables.length >= 3, `expected three aggregations, found ${tables.length}`);
});
