/**
 * Trend intelligence, end to end: the G1 gate.
 *
 * The specification's hardest release gate asks for one run with no
 * customer provider secrets, no external analytics, no OAuth and no
 * third-party connector: signals in, one shared brief, approval, a change
 * applied to an owned surface, an outcome observed, and the prior
 * revision restored — with audit entries connecting every stage, and the
 * assertion that no new key was ever requested.
 *
 * This is that run. It exists in the repository rather than in a
 * scratchpad because of a lesson this platform already paid for: the
 * 750-payload sweep that found a real defect lived on a container that
 * was replaced, and a check that cannot be run again is an anecdote.
 *
 * It asserts the refusals, not only the happy path. Fifteen of the
 * seventeen checks below are things the engine must say no to, because on
 * a platform that writes about people's bodies the refusals *are* the
 * feature. The happy path is four lines of it.
 *
 *   DATABASE_URL=postgres://jess@127.0.0.1:5433/jessmove \
 *   AUTH_ENFORCE=true AUTH_SECRET=<32+ chars> \
 *   ADMIN_EMAILS=ti.admin@example.test,ti.editor@example.test \
 *     node apps/backend/dist/main.js &
 *   node scripts/verify-trends.mjs
 *
 * It seeds its own fixtures and leaves the database as it found it.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API = process.env.API ?? 'http://localhost:4000/api';
const DB = process.env.DATABASE_URL ?? 'postgres://jess@127.0.0.1:5433/jessmove';
const PASSWORD = process.env.TRENDS_TEST_PASSWORD ?? 'Str0ng-Passphrase-2026';

let pass = 0;
let fail = 0;
const failures = [];
const ok = (what, extra = '') => {
  pass += 1;
  console.log(`  ok    ${what}${extra ? ` — ${extra}` : ''}`);
};
const bad = (what, extra = '') => {
  fail += 1;
  failures.push(`${what}${extra ? ` — ${extra}` : ''}`);
  console.log(`  FAIL  ${what}${extra ? ` — ${extra}` : ''}`);
};

const j = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
};
const unwrap = (payload) => payload.data ?? payload;

/** psql, for seeding fixtures and for reading the page back independently. */
const sql = (statement) =>
  execFileSync('psql', [DB, '-tAq', '-c', statement], { encoding: 'utf8' }).trim();

/*
 * The session is an httpOnly `jm_session` cookie. The login response
 * carries only the user id and kind on purpose, so this is what a real
 * console does too.
 */
const cookieOf = (res) =>
  (/jm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '') ?? [])[1] ?? null;

async function signIn(email) {
  const password = PASSWORD;
  // The door policy requires the challenge token to be at least three
  // seconds old, so a script that submits instantly is refused as a bot.
  // Waiting reproduces a human's pace rather than working around it.
  let challenge = await j(await fetch(`${API}/auth/challenge`));
  await new Promise((r) => setTimeout(r, 3500));
  let res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      displayName: 'Trend verifier',
      age: 40,
      challenge: challenge.data.token,
    }),
  });
  let cookie = cookieOf(res);
  if (!cookie) {
    challenge = await j(await fetch(`${API}/auth/challenge`));
    await new Promise((r) => setTimeout(r, 3500));
    res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, challenge: challenge.data.token }),
    });
    cookie = cookieOf(res);
  }
  return cookie;
}

const call = (session, path, method = 'GET', body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie: `jm_session=${session}` },
    body: body ? JSON.stringify(body) : undefined,
  });

/** The same canonical hash the service computes. Key order cannot change it. */
const patchHash = (patch) =>
  createHash('sha256')
    .update(
      Object.keys(patch)
        .sort()
        .map((k) => `${k}=${patch[k]}`)
        .join('\u0000'),
    )
    .digest('hex');

const TOPIC = 'verify-desk-breaks';
const TARGET = 'verify-trends-published';
const UNREVIEWED = 'verify-trends-unreviewed';
const BRIEF_SLUG = `gb_${TOPIC.replace(/[^a-z0-9]+/gi, '_')}`;
const PATCH = {
  title: 'Desk breaks for stiff hips: four to try',
  description: 'Four short movements for stiff hips, done at a desk between meetings.',
};

function seed() {
  // A published page a person has signed for, and a draft nobody has.
  sql(
    `INSERT INTO posts (slug,title,description,category,keyword,body,cluster_key,status,reviewed_by,agent_drafted,author,published_at)
     VALUES ('${TARGET}','Desk breaks for stiff hips','Short movements you can do between meetings.','movement','desk breaks','Body copy.','desk-breaks','published','a.physio@example.test',false,'Editor',now())
     ON CONFLICT (slug) DO UPDATE SET title='Desk breaks for stiff hips',
       description='Short movements you can do between meetings.', status='published',
       reviewed_by='a.physio@example.test', published_at=now(), revision=1`,
  );
  sql(
    `INSERT INTO posts (slug,title,description,category,keyword,body,cluster_key,status,reviewed_by,agent_drafted,author)
     VALUES ('${UNREVIEWED}','An unreviewed draft','Nobody has signed this off.','movement','x','Body.','desk-breaks','draft',NULL,true,'Agent')
     ON CONFLICT (slug) DO UPDATE SET status='draft', reviewed_by=NULL`,
  );
  sql(`DELETE FROM growth_actions WHERE target_id IN ('${TARGET}','${UNREVIEWED}')`);
  sql(`DELETE FROM growth_briefs WHERE topic_id = '${TOPIC}'`);
  sql(`DELETE FROM trend_opportunity_snapshots WHERE topic_id = '${TOPIC}'`);
  sql(
    `DELETE FROM trend_observations WHERE topic_id = '${TOPIC}'
        OR source_id LIKE 'verify\\_%'`,
  );
}

function cleanUp() {
  sql(`DELETE FROM growth_actions WHERE target_id IN ('${TARGET}','${UNREVIEWED}')`);
  sql(`DELETE FROM growth_briefs WHERE topic_id = '${TOPIC}'`);
  sql(`DELETE FROM trend_opportunity_snapshots WHERE topic_id = '${TOPIC}'`);
  sql(
    `DELETE FROM trend_observations WHERE topic_id = '${TOPIC}'
        OR source_id LIKE 'verify\\_%'`,
  );
  sql(`DELETE FROM posts WHERE slug IN ('${TARGET}','${UNREVIEWED}')`);
}

seed();

const session = await signIn('ti.admin@example.test');
if (!session) {
  console.log(
    '\n  FAIL  no admin session. Start the API with ADMIN_EMAILS containing\n' +
      '        ti.admin@example.test and ti.editor@example.test, and with\n' +
      '        AUTH_SECRET set to 32 or more characters.\n',
  );
  process.exit(1);
}
ok('an admin session was obtained');

console.log('\n0. The policy is published, not described');
{
  const p = await j(await call(session, '/trends/policy'));
  const d = p.data ?? p;
  const weights = Object.values(d.opportunityWeights).reduce((a, b) => a + b, 0);
  weights === 1 ? ok('opportunity weights sum to 1', String(weights)) : bad('opportunity weights', String(weights));
  d.decisions.includes('priority_review') && !d.decisions.some((x) => /auto/.test(x))
    ? ok('no decision in the published policy acts without a person')
    : bad('the published policy offers an automatic decision');
  /*
   * One channel, and that is the honest number. `seo` has the editorial
   * autopilot behind it. `organic_social` does not: the only social
   * writer here is the partner growth engine, which writes for
   * affiliates on their own allowance, and steering a customer's
   * marketing with the platform's brief would be both wrong and visible
   * to them.
   */
  JSON.stringify(d.availableChannels) === JSON.stringify(['seo'])
    ? ok('only the channel with a platform-owned producer is advertised')
    : bad('advertised channels', JSON.stringify(d.availableChannels));
}

console.log('\n1. Signals in, replays understood as replays');

const weeksAgo = (n) => new Date(Date.now() - n * 7 * 86400_000);
const obs = [];
// Eight baseline weeks on two independent families, then a current week
// that moved. Values chosen to clear the count floor and the z gate.
for (const [family, src, base, now] of [
  ['funnel', 'verify_funnel_steps', 22, 70],
  ['conversion', 'verify_registrations', 21, 64],
]) {
  for (let w = 8; w >= 0; w--) {
    const end = weeksAgo(w);
    const start = new Date(end.getTime() - 7 * 86400_000);
    obs.push({
      sourceId: src, sourceFamily: family, sourceRecordId: `${src}-w${w}`,
      topicId: TOPIC, metric: 'count', value: w === 0 ? now : base + (w % 3),
      unit: 'count', observedAt: end.toISOString(),
      windowStart: start.toISOString(), windowEnd: end.toISOString(), coverage: 0.95,
    });
  }
}
{
  const first = await j(await call(session, '/trends/observations', 'POST', { observations: obs }));
  const d = first.data ?? first;
  d.accepted === obs.length ? ok(`${d.accepted} observations accepted`) : bad('ingest', JSON.stringify(d).slice(0, 200));
  const again = await j(await call(session, '/trends/observations', 'POST', { observations: obs }));
  const d2 = again.data ?? again;
  d2.duplicate === obs.length && d2.accepted === 0
    ? ok('TI-01: an exact replay is all duplicates, nothing stored twice')
    : bad('TI-01 replay', JSON.stringify(d2).slice(0, 200));
}

console.log('\n2. Scoring shows its working, and readiness vetoes');
let snapshotId = null;
{
  const vetoed = await j(await call(session, '/trends/score', 'POST', { topicId: TOPIC, fit: 95, intent: 85, readiness: 0 }));
  const v = (vetoed.data ?? vetoed).verdict;
  v.decision === 'vetoed' && v.vetoes.includes('readiness_missing')
    ? ok('readiness of zero vetoes rather than averaging away')
    : bad('readiness veto', JSON.stringify(v).slice(0, 200));

  const scored = await j(await call(session, '/trends/score', 'POST', { topicId: TOPIC, fit: 95, intent: 85, readiness: 80 }));
  const s = scored.data ?? scored;
  snapshotId = s.snapshotId;
  console.log(`        opportunity ${s.verdict.opportunity.toFixed(2)}  confidence ${s.verdict.confidence.toFixed(2)}  → ${s.verdict.decision}`);
  for (const f of s.families) console.log(`        ${f.contributed ? 'used  ' : 'unused'} ${f.family.padEnd(16)} ${f.why}`);
  s.confidenceInputs.independentFamilies === 2
    ? ok('two independent families corroborated')
    : bad('independent families', String(s.confidenceInputs.independentFamilies));
  s.verdict.mayCreateBrief ? ok(`decision ${s.verdict.decision} earns a brief`) : bad('decision', s.verdict.why);
  snapshotId ? ok('the score was frozen as a snapshot') : bad('no snapshot was frozen');
}

console.log('\n3. A brief, approved by a named person');
let briefId = null, briefVersion = null;
{
  const draft = await j(await call(session, '/trends/briefs', 'POST', {
    snapshotId, topicId: TOPIC,
    audience: 'Desk workers who sit for long stretches',
    intent: 'find short movements that fit between meetings',
    approvedClaimIds: ['claim_desk_breaks_01'], ctaId: 'cta_try_a_snap',
    allowedChannels: ['seo'], objective: 'engaged reads per eligible session', policyVersion: 1,
  }));
  const d = draft.data ?? draft;
  briefId = d.briefId; briefVersion = d.briefVersion;
  briefId ? ok(`brief drafted ${briefId} v${briefVersion}`) : bad('draft', JSON.stringify(d).slice(0, 250));

  const beforeApproval = await j(await call(session, `/trends/briefs/effective?topicId=${TOPIC}&channel=seo`));
  const b = beforeApproval.data ?? beforeApproval;
  b.brief === null ? ok('an unapproved brief does not resolve', b.why) : bad('a draft brief resolved');

  const paid = await j(await call(session, '/trends/briefs', 'POST', {
    snapshotId, topicId: TOPIC, audience: 'x'.repeat(10), intent: 'y'.repeat(10),
    approvedClaimIds: ['c'], ctaId: 'cta', allowedChannels: ['paid'],
    objective: 'z'.repeat(10), policyVersion: 1,
  }));
  /paid|adapter/i.test(JSON.stringify(paid)) ? ok('a brief on a channel with no adapter is refused') : bad('paid channel accepted');

  const approved = await j(await call(session, '/trends/briefs/approve', 'POST', { briefId, briefVersion, approver: 'ti.editor@example.test' }));
  (approved.data ?? approved).approved ? ok('brief approved by a named reviewer') : bad('brief approval', JSON.stringify(approved).slice(0, 250));

  const after = await j(await call(session, `/trends/briefs/effective?topicId=${TOPIC}&channel=seo`));
  const a = (after.data ?? after).brief;
  a && a.approvedBy === 'ti.editor@example.test' ? ok('the approved brief resolves, carrying its reviewer') : bad('effective brief', JSON.stringify(after).slice(0, 250));
  // A channel with no producer is refused by name, with the list of the
  // ones that have one — rather than resolving to a silent nothing that
  // reads like "no brief today".
  const wrong = await j(
    await call(session, `/trends/briefs/effective?topicId=${TOPIC}&channel=organic_social`),
  );
  /channel must be one of/.test(JSON.stringify(wrong))
    ? ok('a channel with no platform-owned producer is refused by name')
    : bad('unavailable channel not refused', JSON.stringify(wrong).slice(0, 200));
}

if (!briefId || !briefVersion || !snapshotId) {
  console.log(
    '\n  FAIL  the earlier stages did not produce an approved brief, so the\n' +
      '        write path cannot be exercised. Fix the failures above first;\n' +
      '        running section 4 now would report a cascade, not a cause.\n',
  );
  cleanUp();
  process.exit(1);
}

const BRIEF = { briefId, briefVersion };

console.log('\n4. The write path, and everything it refuses');

// Refusals first, because the happy path is the easy part.
{
  const draft = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: UNREVIEWED, patch: PATCH, author: 'ti.admin@example.test' }));
  /not published|named reviewer/i.test(JSON.stringify(draft)) ? ok('an unreviewed draft page cannot be patched') : bad('unreviewed page accepted', JSON.stringify(draft).slice(0, 200));

  const offList = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: TARGET, patch: { canonicalUrl: '/elsewhere' }, author: 'a@b.test' }));
  /canonicalUrl|patchable/i.test(JSON.stringify(offList)) ? ok('a field outside the allowlist is refused by name') : bad('off-list field accepted', JSON.stringify(offList).slice(0, 200));

  const blank = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: TARGET, patch: { title: '   ' }, author: 'a@b.test' }));
  /blank/i.test(JSON.stringify(blank)) ? ok('a patch cannot blank a field') : bad('blanking accepted', JSON.stringify(blank).slice(0, 200));

  const reserved = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'owned_content_patch', targetId: TARGET, patch: {}, author: 'a@b.test' }));
  /reserved|adapter/i.test(JSON.stringify(reserved)) ? ok('a reserved action kind is refused, not half-attempted') : bad('reserved kind accepted', JSON.stringify(reserved).slice(0, 200));
}

// Propose, twice.
let actionId = null;
{
  const first = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: TARGET, patch: PATCH, author: 'ti.author@example.test' }));
  actionId = (first.data ?? first).actionId;
  actionId ? ok(`proposed ${actionId}`) : bad('propose', JSON.stringify(first).slice(0, 250));

  const replay = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: TARGET, patch: PATCH, author: 'ti.author@example.test' }));
  (replay.data ?? replay).actionId === actionId
    ? ok('an identical proposal returns the same action, not a second one')
    : bad('idempotency', JSON.stringify(replay).slice(0, 200));
}

// Approval refusals.
{
  const selfApprove = await j(await call(session, `/trends/actions/${actionId}/approve`, 'POST',
    { approver: 'ti.author@example.test', payloadHash: patchHash(PATCH) }));
  /author cannot approve/i.test(JSON.stringify(selfApprove)) ? ok('the author cannot approve their own change') : bad('self-approval allowed', JSON.stringify(selfApprove).slice(0, 200));

  const wrongHash = await j(await call(session, `/trends/actions/${actionId}/approve`, 'POST',
    { approver: 'ti.editor@example.test', payloadHash: 'a'.repeat(64) }));
  /different payload|no longer applies/i.test(JSON.stringify(wrongHash)) ? ok('an approval for a different payload is refused') : bad('wrong hash accepted', JSON.stringify(wrongHash).slice(0, 200));

  const approved = await j(await call(session, `/trends/actions/${actionId}/approve`, 'POST',
    { approver: 'ti.editor@example.test', payloadHash: patchHash(PATCH) }));
  (approved.data ?? approved).queued ? ok('approved by a second person, and queued atomically') : bad('approve', JSON.stringify(approved).slice(0, 250));
}

// A concurrent human edit must win.
{
  sql(`UPDATE posts SET title = title || ' (editor was here)', revision = revision + 1 WHERE slug = '${TARGET}'`);
  const conflict = await j(await call(session, `/trends/actions/${actionId}/execute`, 'POST'));
  /changed after|conflict/i.test(JSON.stringify(conflict))
    ? ok('TI-08: a concurrent editor edit produces a conflict, not an overwrite')
    : bad('conflict not detected', JSON.stringify(conflict).slice(0, 250));
  const after = sql(`select title from posts where slug='${TARGET}'`);
  /editor was here/.test(after) ? ok("the editor's words survived", after.slice(0, 60)) : bad('editor work lost', after);
}

// Re-propose against the new revision, approve, apply, roll back.
{
  const fresh = await j(await call(session, '/trends/actions', 'POST', { ...BRIEF, channel: 'seo',
    actionKind: 'seo_metadata_patch', targetId: TARGET, patch: PATCH, author: 'ti.author@example.test' }));
  const id = (fresh.data ?? fresh).actionId;
  id ? ok(`re-proposed against the new revision: ${id}`) : bad('re-propose', JSON.stringify(fresh).slice(0, 250));

  await call(session, `/trends/actions/${id}/approve`, 'POST', { approver: 'ti.editor@example.test', payloadHash: patchHash(PATCH) });
  const applied = await j(await call(session, `/trends/actions/${id}/execute`, 'POST'));
  const a = applied.data ?? applied;
  a.applied ? ok(`applied, revision now ${a.appliedRevision}`) : bad('execute', JSON.stringify(applied).slice(0, 250));

  const live = sql(`select title from posts where slug='${TARGET}'`);
  live === PATCH.title ? ok('the published page carries the approved text') : bad('page text', live);

  const rolled = await j(await call(session, `/trends/actions/${id}/rollback`, 'POST', { approver: 'ti.editor@example.test' }));
  (rolled.data ?? rolled).rolledBack ? ok('rolled back') : bad('rollback', JSON.stringify(rolled).slice(0, 250));
  const restored = sql(`select title from posts where slug='${TARGET}'`);
  /editor was here/.test(restored) ? ok("rollback restored exactly what was there", restored.slice(0, 60)) : bad('restore', restored);

  const state = await j(await call(session, `/trends/actions/${id}`));
  const st = state.data ?? state;
  st.state === 'rolled_back' && st.approver === 'ti.editor@example.test'
    ? ok('the audit trail names the approver and the final state')
    : bad('audit', JSON.stringify(st).slice(0, 200));
}


console.log('\n5. Embedded: the existing autopilot tick does it, unprompted');
{
  /*
   * The point of this section is that nothing below calls the trend
   * engine. It fires the cron the platform already had — the one Vercel
   * has been hitting daily since before any of this existed — and checks
   * that the evidence was read anyway.
   *
   * CRON_SECRET is required rather than optional. A section that skips
   * itself when an environment variable is missing is how a check stops
   * running without anybody noticing, which is the failure this whole
   * suite exists to prevent.
   */
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    bad(
      'the embedded path could not be exercised',
      'CRON_SECRET must be set to 16+ characters, and SEO_AUTOPILOT=on, ' +
        'for the autopilot tick to run. Not skipped: a check that skips ' +
        'itself is a check that stopped running.',
    );
  } else {
    // Real first-party history on a real cluster, written to the tables
    // the platform writes itself. Nothing is inserted into the engine.
    const cluster = 'micro-movement';
    const slug = 'verify-embedded-reads';
    sql(
      `INSERT INTO posts (slug,title,description,category,keyword,body,cluster_key,status,reviewed_by,agent_drafted,author,published_at)
       VALUES ('${slug}','Desk breaks','Short movements between meetings.','movement','desk breaks','Body.','${cluster}','published','a.physio@example.test',false,'Editor',now())
       ON CONFLICT (slug) DO UPDATE SET cluster_key='${cluster}', status='published',
         reviewed_by='a.physio@example.test', published_at=now()`,
    );
    sql(`DELETE FROM funnel_events WHERE path = '/blog/${slug}'`);
    sql(`DELETE FROM trend_observations WHERE source_id LIKE 'firstparty%' AND topic_id = '${cluster}'`);
    sql(
      `DO $$
       DECLARE w int; n int;
       BEGIN
         FOR w IN 1..9 LOOP
           n := CASE WHEN w = 1 THEN 70 ELSE 22 + (w % 3) END;
           FOR i IN 1..n LOOP
             INSERT INTO funnel_events (step, source, path, at)
             VALUES ('opened','verify','/blog/${slug}',
                     date_trunc('week', now()) - (w || ' weeks')::interval + '2 days'::interval);
           END LOOP;
           n := CASE WHEN w = 1 THEN 64 ELSE 21 + (w % 3) END;
           FOR i IN 1..n LOOP
             INSERT INTO funnel_events (step, source, path, at)
             VALUES ('registered','verify','/blog/${slug}',
                     date_trunc('week', now()) - (w || ' weeks')::interval + '2 days'::interval);
           END LOOP;
         END LOOP;
       END $$`,
    );

    const tick = async () =>
      unwrap(
        await j(
          await fetch(`${API}/blog/agent/autopilot/cron`, {
            headers: { authorization: `Bearer ${cronSecret}` },
          }),
        ),
      );

    const first = await tick();
    const evidence = first.evidence;
    evidence
      ? ok('the existing cron read the evidence without being asked to')
      : bad('the autopilot run carries no evidence', JSON.stringify(first).slice(0, 200));

    if (evidence) {
      evidence.filed >= 18
        ? ok(`${evidence.filed} observations filed from the platform's own tables`)
        : bad('nothing was collected', JSON.stringify(evidence));
      evidence.topicsScored >= 12
        ? ok(`${evidence.topicsScored} topic clusters swept`)
        : bad('the sweep covered too few clusters', String(evidence.topicsScored));
      evidence.briefable.includes(cluster)
        ? ok(`${cluster} earned a brief on first-party evidence alone`)
        : bad('no topic earned a brief', JSON.stringify(evidence.briefable));
      /*
       * Null is the correct answer and the important one: no brief has
       * been approved for this cluster, so the agent wrote exactly as it
       * did before the engine existed. This is the specification's
       * baseline fallback, and it is the normal case.
       */
      evidence.briefUsed === null
        ? ok('with no approved brief, the agent used baseline behaviour')
        : bad('a brief steered a draft without being approved', String(evidence.briefUsed));
    }

    const second = await tick();
    second.evidence && second.evidence.duplicate >= 18 && second.evidence.filed === 0
      ? ok('a second tick refiles nothing — collection is idempotent')
      : bad('collection is not idempotent', JSON.stringify(second.evidence));

    first.reachedThePublic === false
      ? ok('the run reached no public surface')
      : bad('a run claims to have reached the public', String(first.reachedThePublic));

    sql(`DELETE FROM funnel_events WHERE path = '/blog/${slug}'`);
    sql(`DELETE FROM trend_observations WHERE source_id LIKE 'firstparty%' AND topic_id = '${cluster}'`);
    sql(`DELETE FROM trend_opportunity_snapshots WHERE topic_id = '${cluster}'`);
    sql(`DELETE FROM posts WHERE slug = '${slug}'`);
  }
}

console.log('\n6. What this run proves, and what it does not');
{
  /*
   * The release gate asks for an explicit assertion that no new
   * credential was requested. It is checked rather than claimed: the
   * engine reads four first-party families and holds no provider
   * configuration at all, so there is nothing for it to ask for.
   */
  const policy = unwrap(await j(await call(session, '/trends/policy')));
  const families = Object.keys(policy.sourceFamilies);
  const external = families.filter(
    (f) => !['conversion', 'funnel', 'blog_engagement', 'support_topic'].includes(f),
  );
  external.length === 0
    ? ok('every signal family is first-party; no credential is reachable to ask for')
    : bad('an external source family appeared', external.join(', '));

  console.log(
    '\n        Not proven here: this run uses one platform, one locale and\n' +
      '        first-party signals only. Portability across two dissimilar\n' +
      '        profiles, and anything needing an external feed, are out of\n' +
      '        scope by design — see docs/STATE-OF-PLAY.md.',
  );
}

cleanUp();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) {
  console.log('  Failures:');
  for (const f of failures) console.log(`    ${f}`);
  process.exit(1);
}
