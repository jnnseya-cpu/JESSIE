import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildDashboard,
  windowDays,
  type ActivityRow,
} from '../src/activity/activity.logic.ts';

const TODAY = '2026-08-14';
const row = (over: Partial<ActivityRow> & { kind: ActivityRow['kind']; onDay: string }): ActivityRow => ({
  category: null,
  seconds: 0,
  at: `${over.onDay}T12:00:00.000Z`,
  detail: '',
  ...over,
});

test('an empty history draws nothing and invents nothing', () => {
  const dash = buildDashboard([], TODAY);
  assert.equal(dash.totalActs, 0);
  assert.equal(dash.days.length, 14);
  assert.equal(dash.completionRate, null, 'no completion rate before anything was offered');
  assert.equal(dash.streak, 0);
  // Every reading is null rather than zero: "no data" and "you scored 0"
  // are different statements and only one of them is true.
  for (const reading of dash.readings) assert.equal(reading.value, null, reading.key);
});

test('the window is fourteen days ending today, oldest first', () => {
  const days = windowDays(TODAY);
  assert.equal(days.length, 14);
  assert.equal(days[0], '2026-08-01');
  assert.equal(days[13], TODAY);
});

test('completions build the day series, the mix and the streak', () => {
  const dash = buildDashboard(
    [
      row({ kind: 'snap_offered', onDay: '2026-08-12', category: 'mobility' }),
      row({ kind: 'snap_completed', onDay: '2026-08-12', category: 'mobility', seconds: 120 }),
      row({ kind: 'snap_offered', onDay: '2026-08-13', category: 'strength' }),
      row({ kind: 'snap_completed', onDay: '2026-08-13', category: 'strength', seconds: 180 }),
      row({ kind: 'snap_offered', onDay: TODAY, category: 'mobility' }),
      row({ kind: 'snap_completed', onDay: TODAY, category: 'mobility', seconds: 90 }),
      row({ kind: 'food_checked', onDay: TODAY }),
    ],
    TODAY,
  );

  assert.equal(dash.streak, 3, 'three consecutive days ending today');
  assert.equal(dash.todaySeconds, 90);
  assert.equal(dash.todayCompleted, 1);
  assert.equal(dash.daysMovedInWindow, 3);
  assert.equal(dash.completionRate, 1);
  assert.deepEqual(dash.mix, [
    { category: 'mobility', completed: 2 },
    { category: 'strength', completed: 1 },
  ]);
  assert.equal(dash.foodChecks, 1);
});

test('a missed day ends the streak without erasing the history', () => {
  const dash = buildDashboard(
    [
      row({ kind: 'snap_completed', onDay: '2026-08-10', seconds: 60 }),
      row({ kind: 'snap_completed', onDay: '2026-08-11', seconds: 60 }),
      // nothing on the 12th or 13th
      row({ kind: 'snap_completed', onDay: TODAY, seconds: 60 }),
    ],
    TODAY,
  );
  assert.equal(dash.streak, 1);
  assert.equal(dash.daysMovedInWindow, 3);
});

test('held prompts are counted as successes with their reasons', () => {
  const dash = buildDashboard(
    [
      row({ kind: 'snap_held', onDay: TODAY, detail: 'driving' }),
      row({ kind: 'snap_held', onDay: TODAY, detail: 'driving' }),
      row({ kind: 'snap_held', onDay: '2026-08-13', detail: 'in a meeting' }),
    ],
    TODAY,
  );
  assert.deepEqual(dash.heldWithReasons, [
    { detail: 'driving', count: 2 },
    { detail: 'in a meeting', count: 1 },
  ]);
  assert.equal(dash.days[13]?.held, 2);
});

test('a Snap offered but not done lowers the response reading honestly', () => {
  const dash = buildDashboard(
    [
      row({ kind: 'snap_offered', onDay: TODAY, category: 'mobility' }),
      row({ kind: 'snap_offered', onDay: TODAY, category: 'mobility' }),
      row({ kind: 'snap_completed', onDay: TODAY, category: 'mobility', seconds: 60 }),
    ],
    TODAY,
  );
  assert.equal(dash.completionRate, 0.5);
  const response = dash.readings.find((r) => r.key === 'response');
  assert.equal(response?.value, 50);
});

test('activity outside the window cannot leak into the readings', () => {
  const dash = buildDashboard(
    [row({ kind: 'snap_completed', onDay: '2026-07-01', seconds: 600 })],
    TODAY,
  );
  assert.equal(dash.totalActs, 0);
  assert.equal(dash.daysMovedInWindow, 0);
});

/* ------------------------------------------------------------------ *
 * Rewards — the charter's permitted list, and nothing else
 * ------------------------------------------------------------------ */

test('points come only from behaviours the charter permits', async () => {
  const { computeRewards } = await import('../src/activity/rewards.logic.ts');
  const { POINTS_REWARD } = await import('@jessmove/shared');

  const rows = [
    row({ kind: 'snap_offered', onDay: '2026-08-12', category: 'mobility' }),
    row({ kind: 'snap_completed', onDay: '2026-08-12', category: 'mobility', seconds: 120 }),
    row({ kind: 'snap_completed', onDay: '2026-08-14', category: 'strength', seconds: 900 }),
  ];
  const series = buildDashboard(rows, TODAY).days;
  const rewards = computeRewards(rows, series, 'u_test', 2);

  for (const award of rewards.awards) {
    assert.ok(
      (POINTS_REWARD as readonly string[]).includes(award.reason),
      `"${award.reason}" is not a permitted reason for points`,
    );
  }
  assert.ok(rewards.movePoints > 0);
});

test('a longer session does not out-earn a second day', async () => {
  const { computeRewards } = await import('../src/activity/rewards.logic.ts');

  // One very long session on one day.
  const marathon = [
    row({ kind: 'snap_completed', onDay: TODAY, category: 'mobility', seconds: 3600 }),
  ];
  // Two ordinary sessions on two days.
  const steady = [
    row({ kind: 'snap_completed', onDay: '2026-08-13', category: 'mobility', seconds: 120 }),
    row({ kind: 'snap_completed', onDay: TODAY, category: 'mobility', seconds: 120 }),
  ];

  const a = computeRewards(marathon, buildDashboard(marathon, TODAY).days, 'u', 1);
  const b = computeRewards(steady, buildDashboard(steady, TODAY).days, 'u', 2);
  assert.ok(b.movePoints > a.movePoints, 'showing up twice must beat one long push');
});

test('a lapse is rewarded on return rather than punished', async () => {
  const { computeRewards } = await import('../src/activity/rewards.logic.ts');
  const lapsed = [
    row({ kind: 'snap_completed', onDay: '2026-08-05', seconds: 60 }),
    row({ kind: 'snap_completed', onDay: TODAY, seconds: 60 }),
  ];
  const rewards = computeRewards(lapsed, buildDashboard(lapsed, TODAY).days, 'u', 1);
  assert.ok(rewards.awards.some((a) => a.reason === 'returning after a lapse'));
});

test('a world is stable for a person and changes with their level', async () => {
  const { worldFor } = await import('../src/activity/rewards.logic.ts');
  assert.equal(worldFor('u_abc', 1), worldFor('u_abc', 1));
  assert.notEqual(worldFor('u_abc', 1), worldFor('u_abc', 2));
});

/* ── walking ───────────────────────────────────────────────────────── */

/*
 * The one form of movement almost everybody already does, and the ledger
 * could not see it. What follows is mostly about the line that a walk must
 * not cross: completion rate is the engine's marking of its own timing,
 * and a walk nobody offered is not evidence about it either way.
 */

test('a walk counts as movement: minutes, days moved, the streak', () => {
  const dash = buildDashboard(
    [
      row({ kind: 'walk_logged', onDay: '2026-08-12', category: 'cardio', seconds: 1200 }),
      row({ kind: 'walk_logged', onDay: '2026-08-13', category: 'cardio', seconds: 1800 }),
      row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 600 }),
    ],
    TODAY,
  );

  assert.equal(dash.streak, 3, 'three days of walking is a three-day streak');
  assert.equal(dash.daysMovedInWindow, 3);
  assert.equal(dash.todaySeconds, 600, 'walk minutes are minutes moved');
  assert.equal(dash.todayWalks, 1);
  assert.equal(dash.walksInWindow, 3);
  assert.deepEqual(dash.mix, [{ category: 'cardio', completed: 3 }]);
});

test('a walk never touches the completion rate', () => {
  /*
   * The failure this guards. Completion rate is completed ÷ offered and it
   * answers one question — was the engine's timing right? Folding walks
   * into the numerator would have the platform quietly report that it was
   * getting better at choosing moments when all that happened is somebody
   * walked to the shops.
   */
  const withoutWalks = buildDashboard(
    [
      row({ kind: 'snap_offered', onDay: '2026-08-12' }),
      row({ kind: 'snap_offered', onDay: '2026-08-13' }),
      row({ kind: 'snap_completed', onDay: '2026-08-13', category: 'mobility', seconds: 120 }),
    ],
    TODAY,
  );
  const withWalks = buildDashboard(
    [
      row({ kind: 'snap_offered', onDay: '2026-08-12' }),
      row({ kind: 'snap_offered', onDay: '2026-08-13' }),
      row({ kind: 'snap_completed', onDay: '2026-08-13', category: 'mobility', seconds: 120 }),
      row({ kind: 'walk_logged', onDay: '2026-08-12', category: 'cardio', seconds: 2400 }),
      row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 2400 }),
    ],
    TODAY,
  );

  assert.equal(withoutWalks.completionRate, 0.5);
  assert.equal(withWalks.completionRate, 0.5, 'walking changed the engine’s own marking');

  const response = (d: typeof withWalks) => d.readings.find((r) => r.key === 'response')!.value;
  assert.equal(response(withWalks), response(withoutWalks));

  // But the day it was walked is a day that carried movement.
  assert.equal(withoutWalks.daysMovedInWindow, 1);
  assert.equal(withWalks.daysMovedInWindow, 3);
});

test('walking does not lift the strength reading, because walking is not strength', () => {
  /*
   * The evidence on falls is about progressive strength and balance work,
   * not about walking. A walk therefore counts in the denominator of this
   * reading and never in the numerator — otherwise somebody could walk
   * every day and keep a flattering strength figure earned a fortnight ago.
   */
  const snapOnly = buildDashboard(
    [row({ kind: 'snap_completed', onDay: TODAY, category: 'strength', seconds: 120 })],
    TODAY,
  );
  const plusWalks = buildDashboard(
    [
      row({ kind: 'snap_completed', onDay: TODAY, category: 'strength', seconds: 120 }),
      row({ kind: 'walk_logged', onDay: '2026-08-12', category: 'cardio', seconds: 1800 }),
      row({ kind: 'walk_logged', onDay: '2026-08-13', category: 'cardio', seconds: 1800 }),
      row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 1800 }),
    ],
    TODAY,
  );

  const strength = (d: typeof snapOnly) => d.readings.find((r) => r.key === 'strength')!;
  assert.equal(strength(snapOnly).value, 100);
  assert.equal(strength(plusWalks).value, 25, 'one strength act in four movement acts');
  assert.match(strength(plusWalks).says, /walking is good for a great deal/i);
});

test('a walk appears in the heatmap, because the question is when you move', () => {
  const dash = buildDashboard(
    [{ ...row({ kind: 'walk_logged', onDay: TODAY, seconds: 1200 }), at: `${TODAY}T07:30:00.000Z` }],
    TODAY,
  );
  assert.equal(dash.heatmap.flat().reduce((a, b) => a + b, 0), 1);
});

test('a walk carries no energy figure, at any age', () => {
  /*
   * Minutes are what was reported. A calorie estimate would have to be
   * inferred from a duration typed into a phone, and under 18 it could not
   * be shown at all — so it is not derived for anybody.
   */
  const dash = buildDashboard(
    [row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 2400 })],
    TODAY,
  );
  assert.deepEqual(dash.meals, [], 'a walk must not produce an energy row');
  assert.deepEqual(dash.weights, []);
});

test('logging six walks in one day earns what one walk earns', async () => {
  /*
   * The one thing a self-entered act opens up that an engine-issued one
   * does not. A Snap completion is bounded by how often the engine chose
   * to speak; a walk is bounded by a text field, so points that scale with
   * the count are points for typing. Only the first walk of a day earns —
   * the same principle as "five sessions in one day cannot out-earn five
   * days of one", applied where it is actually exploitable.
   */
  const { computeRewards, POINTS } = await import('../src/activity/rewards.logic.ts');

  const once = [row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 1800 })];
  const sixTimes = Array.from({ length: 6 }, () =>
    row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 1800 }),
  );

  const a = computeRewards(once, buildDashboard(once, TODAY).days, 'u', 1);
  const b = computeRewards(sixTimes, buildDashboard(sixTimes, TODAY).days, 'u', 1);
  assert.equal(a.movePoints, b.movePoints, 'repeat entries on one day earned more');

  // And a walk on a second day does earn again, because that is a real day.
  const twoDays = [
    row({ kind: 'walk_logged', onDay: '2026-08-13', category: 'cardio', seconds: 1800 }),
    row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 1800 }),
  ];
  const c = computeRewards(twoDays, buildDashboard(twoDays, TODAY).days, 'u', 2);
  assert.equal(c.movePoints, a.movePoints + POINTS.completed + POINTS.consistencyDay);
});

test('a walk earns only for reasons the charter permits', async () => {
  const { computeRewards } = await import('../src/activity/rewards.logic.ts');
  const { POINTS_REWARD } = await import('@jessmove/shared');

  const rows = [
    row({ kind: 'walk_logged', onDay: '2026-08-12', category: 'cardio', seconds: 1200 }),
    row({ kind: 'walk_logged', onDay: TODAY, category: 'cardio', seconds: 2400 }),
  ];
  const rewards = computeRewards(rows, buildDashboard(rows, TODAY).days, 'u', 1);
  assert.ok(rewards.movePoints > 0, 'walking earned nothing at all');
  for (const award of rewards.awards) {
    assert.ok(
      (POINTS_REWARD as readonly string[]).includes(award.reason),
      `"${award.reason}" is not a permitted reason for points`,
    );
  }
});

test('the walk endpoint sets the category and refuses a client that does not', () => {
  const source = readFileSync(
    new URL('../src/activity/activity.controller.ts', import.meta.url),
    'utf8',
  );
  // The general recorder cannot write a walk; only the dedicated route can.
  const recorder = source.slice(source.indexOf('class RecordActivityDto'), source.indexOf('@Controller'));
  assert.ok(!/walk_logged/.test(recorder.replace(/\/\*[\s\S]*?\*\//g, '')),
    'the general activity endpoint accepts walk_logged, so a client could set its own category');
  assert.match(source, /@Post\('walk'\)/);
  assert.match(source, /category: 'cardio'/);
  /*
   * Minutes and nothing else. Checked against the code with the comments
   * stripped, because the doc block on the route says the words "distance,
   * pace, steps, calories" while explaining that none of them are asked
   * for — and a test that cannot tell a refusal from a violation would
   * push somebody to delete the explanation.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/distance|kcal|calorie|steps|pace/i.test(code), 'the walk route infers a figure');
});
