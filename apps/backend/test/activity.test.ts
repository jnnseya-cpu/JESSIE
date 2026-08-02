import assert from 'node:assert/strict';
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
