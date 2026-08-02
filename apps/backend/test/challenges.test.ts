import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeProgress,
  daysBetween,
  makeJoinCode,
  runLengthDays,
  templateByKey,
  type MemberActivity,
} from '../src/challenges/challenges.logic.ts';

const member = (over: Partial<MemberActivity> & { userId: string }): MemberActivity => ({
  displayName: over.userId,
  daysActive: 0,
  baselineDaysActive: 0,
  supportActs: 0,
  ...over,
});

test('a team where everyone shows up beats a team carried by one person', () => {
  const start = '2026-08-01';
  const end = '2026-08-14';
  const now = '2026-08-08';

  const spread = computeProgress(
    [
      member({ userId: 'a', daysActive: 4, baselineDaysActive: 2 }),
      member({ userId: 'b', daysActive: 4, baselineDaysActive: 2 }),
      member({ userId: 'c', daysActive: 3, baselineDaysActive: 1 }),
      member({ userId: 'd', daysActive: 4, baselineDaysActive: 2 }),
    ],
    start,
    end,
    now,
  );

  const hero = computeProgress(
    [
      member({ userId: 'a', daysActive: 8, baselineDaysActive: 4, supportActs: 20 }),
      member({ userId: 'b' }),
      member({ userId: 'c' }),
      member({ userId: 'd' }),
    ],
    start,
    end,
    now,
  );

  assert.ok(
    spread.teamScore > hero.teamScore,
    `breadth ${spread.teamScore} should beat a hero ${hero.teamScore}`,
  );
  assert.equal(hero.someoneCapped, true, 'the hero hits the contribution ceiling');
  assert.equal(spread.participation, 1);
  assert.equal(hero.participation, 0.25);
});

test('progress names who took part and attaches no number to anyone', () => {
  const progress = computeProgress(
    [
      member({ userId: 'u1', displayName: 'Justin', daysActive: 3 }),
      member({ userId: 'u2', displayName: 'Jessie', daysActive: 1 }),
      member({ userId: 'u3', displayName: 'Sam' }),
    ],
    '2026-08-01',
    '2026-08-14',
    '2026-08-05',
  );

  assert.deepEqual(progress.whoTookPart, ['Justin', 'Jessie']);
  const serialised = JSON.stringify(progress);
  // No per-person score may appear anywhere in the payload.
  assert.equal(/"share"/.test(serialised), false);
  assert.equal(/"rank"/.test(serialised), false);
});

test('nobody is punished for a strong start', () => {
  const steady = computeProgress(
    [member({ userId: 'a', daysActive: 6, baselineDaysActive: 3 })],
    '2026-08-01',
    '2026-08-14',
    '2026-08-07',
  );
  const frontLoaded = computeProgress(
    [member({ userId: 'a', daysActive: 6, baselineDaysActive: 6 })],
    '2026-08-01',
    '2026-08-14',
    '2026-08-07',
  );
  assert.ok(frontLoaded.teamScore > 0, 'a front-loaded member still scores');
  assert.ok(steady.teamScore >= frontLoaded.teamScore);
});

test('an empty team scores zero without dividing by zero', () => {
  const progress = computeProgress([], '2026-08-01', '2026-08-14', '2026-08-02');
  assert.equal(progress.teamScore, 0);
  assert.equal(progress.participation, 0);
  assert.equal(progress.teamSize, 0);
});

test('join codes avoid characters that are misread aloud', () => {
  const code = makeJoinCode(() => 0.999);
  assert.equal(code.length, 6);
  for (const code of Array.from({ length: 50 }, () => makeJoinCode())) {
    assert.doesNotMatch(code, /[OI01]/, `${code} contains an ambiguous character`);
  }
});

test('each template runs for the length it advertises', () => {
  assert.equal(runLengthDays('4 weeks'), 28);
  assert.equal(runLengthDays('2 weeks'), 14);
  assert.equal(runLengthDays('A weekend'), 3);
  assert.equal(runLengthDays('A half term'), 42);
  assert.equal(runLengthDays('A season'), 90);
  assert.equal(templateByKey('family_expedition')?.name, 'Family Weekend Expedition');
  assert.equal(templateByKey('nonsense'), null);
});

test('elapsed days never exceed the run length', () => {
  const progress = computeProgress(
    [member({ userId: 'a', daysActive: 2 })],
    '2026-08-01',
    '2026-08-03',
    '2026-09-01',
  );
  assert.equal(progress.daysTotal, 3);
  assert.equal(progress.daysElapsed, 3);
  assert.equal(daysBetween('2026-08-01', '2026-08-03'), 2);
});
