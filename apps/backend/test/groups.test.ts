import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  K_ANONYMITY_FLOOR,
  householdReport,
  organisationReport,
  sharedDaysFrom,
  type MemberStat,
} from '../src/groups/groups.logic.ts';

const person = (name: string, daysMoved: number, minor = false): MemberStat => ({
  userId: `u_${name}`,
  displayName: name,
  daysMoved,
  minor,
});

test('an organisation below the floor reports nothing at all', () => {
  const small = Array.from({ length: K_ANONYMITY_FLOOR - 1 }, (_, i) => person(`p${i}`, i));
  const report = organisationReport(small);

  assert.equal(report.suppressed, true);
  assert.equal(report.participationPct, null, 'no rounded stand-in');
  assert.equal(report.activeMembers, null);
  assert.equal(report.medianDaysMoved, null);
  assert.match(report.note, /still describes those people/);
});

test('an organisation at the floor reports aggregates and no person', () => {
  const cohort = Array.from({ length: K_ANONYMITY_FLOOR }, (_, i) => person(`p${i}`, i % 4));
  const report = organisationReport(cohort);

  assert.equal(report.suppressed, false);
  assert.equal(typeof report.participationPct, 'number');

  // The shape itself must be incapable of naming anybody.
  const serialised = JSON.stringify(report);
  for (const p of cohort) {
    assert.equal(serialised.includes(p.displayName), false, `${p.displayName} leaked`);
    assert.equal(serialised.includes(p.userId), false, `${p.userId} leaked`);
  }
  assert.equal(/"people"|"members"|"users"/.test(serialised), false, 'no member list may appear');
});

test('one very active person cannot lift a cohort into looking engaged', () => {
  const cohort = [
    person('hero', 14),
    ...Array.from({ length: K_ANONYMITY_FLOOR - 1 }, (_, i) => person(`p${i}`, 0)),
  ];
  const report = organisationReport(cohort);
  assert.equal(report.participationPct, Math.round((1 / K_ANONYMITY_FLOOR) * 100));
  assert.equal(report.medianDaysMoved, 0, 'the median is not moved by one outlier');
});

test('a household sees each other by name, and only participation', () => {
  const report = householdReport(
    [person('Justin', 5), person('Jessie', 3, true), person('Grandad', 6)],
    2,
  );
  assert.equal(report.size, 3);
  assert.deepEqual(
    report.people.map((p) => p.displayName),
    ['Justin', 'Jessie', 'Grandad'],
  );
  assert.equal(report.sharedDays, 2);
  // Nothing beyond participation may appear, for anybody, minor or not.
  const keys = new Set(report.people.flatMap((p) => Object.keys(p)));
  assert.deepEqual([...keys].sort(), ['daysMoved', 'displayName', 'minor']);
  assert.match(report.note, /not private check-ins/);
});

test('shared days are only the days everybody moved', () => {
  const days = new Map([
    ['a', new Set(['2026-08-01', '2026-08-02', '2026-08-03'])],
    ['b', new Set(['2026-08-02', '2026-08-03'])],
    ['c', new Set(['2026-08-03'])],
  ]);
  assert.equal(sharedDaysFrom(days, 3), 1);
  assert.equal(sharedDaysFrom(new Map(), 0), 0);
});
