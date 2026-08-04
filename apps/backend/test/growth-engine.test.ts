import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  GROWTH_TOOLS,
  GROWTH_TOOL_IDS,
  PARTNER_DISCLOSURE,
  PLATFORMS,
  PLATFORM_IDS,
  THIN_SLICE_POSTS,
  audienceReport,
  campaignReports,
  checkCopy,
  dayName,
  performanceReport,
  postingTimeReport,
  ratesFor,
  type GrowthResult,
} from '@jessmove/shared';

/**
 * The engine, and the two ways a growth tool damages the business it is
 * supposed to grow.
 *
 * The first is a claim: a partner's post is the first thing most people
 * read about this platform, and "cures", "clinically proven" or "lose 5kg
 * in a month" lands on us rather than on the partner who typed it.
 *
 * The second is quieter. A tool that answers "when should I post?" with a
 * plausible hour it has invented sends somebody to reschedule a month of
 * work around nothing, and when it does not help they conclude the fault
 * was theirs. Every measuring test below exists to keep that answer honest.
 */

const result = (over: Partial<GrowthResult> = {}): GrowthResult => ({
  id: 'gr_1',
  partnerId: 'u_partner',
  toolId: null,
  platform: 'instagram',
  campaign: 'january',
  subject: 'desk breaks',
  postedAt: '2026-08-03T18:00:00.000Z',
  reach: 1000,
  clicks: 50,
  signups: 10,
  paid: 2,
  ...over,
});

const many = (n: number, over: (i: number) => Partial<GrowthResult> = () => ({})): GrowthResult[] =>
  Array.from({ length: n }, (_, i) => result({ id: `gr_${i}`, ...over(i) }));

/* ── the catalogue ─────────────────────────────────────────────────── */

test('all ten tools are present and each says what it cannot do', () => {
  assert.equal(GROWTH_TOOL_IDS.length, 10, GROWTH_TOOL_IDS.join(', '));
  for (const id of GROWTH_TOOL_IDS) {
    const tool = GROWTH_TOOLS[id];
    assert.equal(tool.id, id);
    assert.ok(tool.what.length > 40, `${id} does not say what it does`);
    assert.ok(tool.limits.length > 30, `${id} does not say what it cannot do`);
  }
});

test('what writes costs allowance and what measures does not', () => {
  const writers = GROWTH_TOOL_IDS.filter((id) => GROWTH_TOOLS[id].kind === 'writes');
  const measurers = GROWTH_TOOL_IDS.filter((id) => GROWTH_TOOLS[id].kind === 'measures');
  assert.equal(writers.length, 6);
  assert.equal(measurers.length, 4);

  for (const id of writers) assert.ok(GROWTH_TOOLS[id].acu > 0, `${id} is free, which it is not`);
  for (const id of measurers) {
    // Arithmetic over rows already stored. Charging for it would be a
    // charge for reading back what the partner put in.
    assert.equal(GROWTH_TOOLS[id].acu, 0, `${id} charges for reading your own numbers`);
    assert.ok(GROWTH_TOOLS[id].needsResults > 0, `${id} would answer with no data at all`);
  }
});

test('every network carries the constraint that actually differs', () => {
  assert.equal(PLATFORM_IDS.length, 8);
  for (const id of PLATFORM_IDS) {
    const spec = PLATFORMS[id];
    assert.ok(spec.maxChars > 100, `${id} has no length limit`);
    assert.ok(spec.hashtags.max >= spec.hashtags.min);
    assert.ok(spec.caution.length > 20, `${id} states no caution`);
  }
  // The two that catch people out, both worth being exactly right about.
  assert.equal(PLATFORMS.x.maxChars, 280);
  assert.ok(PLATFORMS.x.hashtags.max <= 2, 'more than two hashtags reads as spam there');
  assert.match(PLATFORMS.pinterest.caution, /prohibited outright/i);
  assert.equal(PLATFORMS.instagram.linksInBody, false, 'a caption link is not clickable');
});

/* ── the copy check ────────────────────────────────────────────────── */

test('the lexicon applies to a partner exactly as it applies to us', () => {
  const check = checkCopy('Burn calories with a quick workout and get toned.');
  assert.equal(check.ok, false);
  assert.ok(check.problems.some((p) => p.includes('burn')));
  assert.ok(check.problems.some((p) => p.includes('workout')));
});

test('a health claim never reaches a partner to paste', () => {
  for (const line of [
    'JESS MOVE cures back pain.',
    'Clinically proven to work.',
    'Guaranteed results in 30 days.',
    'Lose 5kg in a month.',
    'Prevents diabetes.',
    'Medically approved movement.',
  ]) {
    const check = checkCopy(line);
    assert.equal(check.ok, false, `"${line}" was allowed through`);
  }
});

test('a figure the engine cannot see is a figure it will not state', () => {
  for (const line of [
    'Trusted by 40,000 members.',
    'Join 12,000+ happy users.',
    '87% of our members move more.',
  ]) {
    assert.equal(checkCopy(line).ok, false, `"${line}" was allowed through`);
  }
});

test('ordinary honest copy passes', () => {
  const check = checkCopy(
    'A minute of movement, prompted at a moment you can actually take it. Nothing is shown to a ' +
      'child that a child should not see, and you can read the whole rulebook before signing up.',
  );
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
});

test('strict mode closes the framing that must not reach a minor', () => {
  const line = 'Feel good about your body and your shape.';
  assert.equal(checkCopy(line, false).ok, true, 'allowed for a general adult audience');
  assert.equal(checkCopy(line, true).ok, false, 'and refused where a minor may read it');
});

test('the disclosure puts the partner on the hook, not the platform', () => {
  assert.match(PARTNER_DISCLOSURE, /published by you/i);
  assert.match(PARTNER_DISCLOSURE, /You are the advertiser/i);
  assert.match(PARTNER_DISCLOSURE, /Nothing here posts anything anywhere/i);
});

/* ── the four that measure, and their refusals ─────────────────────── */

test('a thin history is told it is thin rather than given a guess', () => {
  for (const [report, rows] of [
    [performanceReport(many(2)), 2],
    [audienceReport(many(2)), 2],
    [postingTimeReport(many(2)), 2],
  ] as const) {
    assert.equal(report.answered, false);
    assert.equal(report.have, rows);
    assert.match(report.says, /will not guess/i);
  }
});

test('the refusal names the number needed, so it is a step rather than a wall', () => {
  const report = postingTimeReport(many(3));
  assert.equal(report.answered, false);
  if (report.answered === false) {
    assert.equal(report.need, GROWTH_TOOLS.posting_time.needsResults);
    assert.match(report.says, /3 of the 8 results/);
  }
});

test('the rates are the arithmetic, not a model of it', () => {
  const rates = ratesFor([result({ reach: 2000, clicks: 100, signups: 20, paid: 5 })]);
  assert.equal(rates.clickRate, 0.05);
  assert.equal(rates.signupRate, 0.2);
  assert.equal(rates.paidRate, 0.25);
});

test('nothing divides by zero into a fabricated rate', () => {
  const rates = ratesFor([result({ reach: 0, clicks: 0, signups: 0, paid: 0 })]);
  assert.deepEqual(rates, { clickRate: 0, signupRate: 0, paidRate: 0 });
  const [report] = campaignReports([result({ reach: 0, clicks: 0, signups: 0, paid: 0 })]);
  assert.equal(report?.weakestStep, null, 'with no reach, no step is "the problem"');
});

test('campaign analytics names the step losing the most people', () => {
  const [report] = campaignReports([
    result({ campaign: 'january', reach: 10_000, clicks: 900, signups: 20, paid: 10 }),
  ]);
  assert.ok(report);
  // 9% click, 2.2% signup, 50% paid — the click-to-signup step is the loss.
  assert.equal(report.weakestStep, 'click to signup');
});

test('a network with two posts behind it does not get ranked above one with ten', () => {
  const rows = [
    ...many(10, () => ({ platform: 'instagram' as const, signups: 5 })),
    ...many(2, (i) => ({ id: `x_${i}`, platform: 'x' as const, signups: 90 })),
  ];
  const report = audienceReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    const x = report.byPlatform.find((s) => s.key === 'x');
    assert.equal(x?.thin, true, `two posts is below the ${THIN_SLICE_POSTS}-post floor`);
    assert.match(report.says, /instagram/i, 'and the headline names the one with evidence behind it');
  }
});

test('a posting time backed by one post is offered as a coincidence, not a rule', () => {
  // Eight results, every one at a different hour: nothing repeats.
  const rows = many(8, (i) => ({
    id: `t_${i}`,
    postedAt: `2026-08-0${(i % 7) + 1}T0${i}:00:00.000Z`,
  }));
  const report = postingTimeReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    assert.equal(report.confident, false);
    assert.match(report.says, /coincidence until it happens twice/i);
  }
});

test('a posting time backed by several posts is stated plainly', () => {
  const rows = [
    ...many(4, (i) => ({ id: `a_${i}`, postedAt: '2026-08-03T18:00:00.000Z', signups: 80 })),
    ...many(4, (i) => ({ id: `b_${i}`, postedAt: '2026-08-04T03:00:00.000Z', signups: 1 })),
  ];
  const report = postingTimeReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    assert.equal(report.confident, true);
    assert.equal(report.best[0]?.hour, 18);
    assert.match(report.says, /Monday around 18:00 UTC/);
  }
  assert.equal(dayName(1), 'Monday');
});

test('a recommendation always carries the figures it came from', () => {
  const rows = [
    ...many(6, (i) => ({ id: `i_${i}`, platform: 'instagram' as const, reach: 1000, clicks: 50, signups: 25, paid: 5 })),
    ...many(6, (i) => ({ id: `f_${i}`, platform: 'facebook' as const, reach: 1000, clicks: 50, signups: 1, paid: 0 })),
  ];
  const report = performanceReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    assert.ok(report.recommendations.length > 0);
    for (const rec of report.recommendations) {
      assert.ok(rec.because.length > 30, `"${rec.do}" has no evidence behind it`);
      assert.match(rec.because, /\d/, 'and the evidence contains an actual figure');
    }
  }
});

test('the advice lands on the step that is losing people, not on the one that works', () => {
  // Reach converts to clicks well; clicks convert to signups badly.
  const rows = many(10, (i) => ({
    id: `p_${i}`,
    reach: 1000,
    clicks: 80,
    signups: 2,
    paid: 0,
  }));
  const report = performanceReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    const said = report.recommendations.map((r) => r.do).join(' ');
    assert.match(said, /page people land on/i, JSON.stringify(report.recommendations));
    assert.ok(!/post more|widen your reach/i.test(said), 'the reach was never the problem');
  }
});

test('finding nothing is reported as an answer, not as an empty screen', () => {
  const rows = many(6, (i) => ({ id: `u_${i}`, platform: null, subject: null }));
  const report = performanceReport(rows);
  assert.equal(report.answered, true);
  if (report.answered) {
    assert.equal(report.recommendations.length, 0);
    assert.match(report.says, /That is a real answer, not a missing one/);
  }
});

/* ── the wiring ────────────────────────────────────────────────────── */

test('a measuring tool never reaches the model gateway', () => {
  const source = readFileSync(
    new URL('../src/growth/growth-engine.service.ts', import.meta.url),
    'utf8',
  );
  const measure = source.slice(source.indexOf('async measure('));
  assert.ok(measure.length > 200, 'measure() was not found');
  assert.ok(!/this\.ai\.complete/.test(measure), 'a report is being written by a model');
  assert.match(source, /if \(tool\.kind !== 'measures'\)/, 'and a writer cannot be run as a report');
});

test('refused copy is withheld rather than shown with a warning above it', () => {
  const source = readFileSync(
    new URL('../src/growth/growth-engine.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /output: passed \? parsed : null/, 'held copy must not be handed over');

  const ui = readFileSync(
    new URL('../../frontend/app/account/growth-engine.tsx', import.meta.url),
    'utf8',
  );
  assert.match(ui, /\{result\.output && <Rendered/, 'and the screen only renders what passed');
});

test('the check reads every string in the output, not just the headline', () => {
  const source = readFileSync(
    new URL('../src/growth/growth-engine.service.ts', import.meta.url),
    'utf8',
  );
  // A claim in the fourth bullet of a landing page is the same liability
  // as one in the headline, and an array is where a spot-check misses it.
  assert.match(source, /private allText\(/);
  assert.match(source, /for \(const text of this\.allText\(parsed\)\)/);
});

test('a partner pays for their own marketing out of their own allowance', () => {
  const source = readFileSync(
    new URL('../src/growth/growth-engine.service.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /billTo: req\.partnerId/, 'unmetered generation is somebody else’s bill');
});

test('every engine route reads the partner from the session, never from the URL', () => {
  const source = readFileSync(
    new URL('../src/growth/growth-engine.controller.ts', import.meta.url),
    'utf8',
  );
  assert.ok(
    !/:partnerId|:userId/.test(source),
    'a partner id in a path would expose another partner’s campaign results',
  );
  assert.match(source, /private me\(req: Request\): string/);

  /*
   * Every route that touches partner data must resolve the partner from
   * the session inside its own body. Campaign results are somebody's
   * business performance — more commercially sensitive than most of what
   * this platform holds — and a partner id taken from anywhere else is a
   * route to reading a competitor's numbers.
   */
  const bodies = source.split(/\n  (?:@\w+\([^)]*\)\n  )*(?=\w)/).filter((b) => /this\.(engine|results)\./.test(b));
  assert.ok(bodies.length >= 6, `only found ${bodies.length} data routes`);
  for (const body of bodies) {
    assert.match(
      body,
      /this\.me\(req\)/,
      `a route reaches partner data without resolving the session: ${body.slice(0, 90)}`,
    );
  }
});

test('the funnel constraint is in the database, not only in the service', () => {
  const sql = readFileSync(
    new URL('../../../db/migrations/0016_growth_engine.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /clicks <= reach AND signups <= clicks AND paid <= signups/);
  assert.match(sql, /ON DELETE CASCADE/, 'a partner who leaves takes their campaign history');
  // Nothing modelled: there is no column for a figure somebody guessed.
  const columns = sql.replace(/--[^\n]*/g, '');
  for (const word of ['estimated', 'projected', 'forecast', 'predicted']) {
    assert.ok(!new RegExp(`\\b${word}`, 'i').test(columns), `${word} has no place in this table`);
  }
});

test('the tab is drawn for partners and staff, and the guard is not the tab', () => {
  const panel = readFileSync(
    new URL('../../frontend/app/account/account-panel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(panel, /const canGrow =/);
  assert.match(panel, /growth_partner/);
  assert.match(panel, /section === 'grow' && canGrow/);

  // The real guard is the session on the server; the tab only decides
  // whether a button is painted.
  const controller = readFileSync(
    new URL('../src/growth/growth-engine.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(controller, /throw new UnauthorizedException\('no valid session'\)/);
});
