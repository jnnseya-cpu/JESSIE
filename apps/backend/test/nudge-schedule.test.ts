import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localNow,
  openWindow,
  secondsLeftIn,
  type DeclaredWindow,
} from '../src/nudge/nudge.logic.ts';

/*
 * The scheduler's arithmetic.
 *
 * Every one of these is a way to wake somebody at the wrong time, which
 * for a product whose first law is "would rather stay silent than be
 * ignored" is the worst failure it has. The sign of a UTC offset is the
 * classic one: getTimezoneOffset counts minutes *behind* UTC, so a naive
 * conversion is out by twice the offset and lands the member in the
 * middle of the night on the far side of the world.
 */

const MON_11 = { weekday: 1, startMinute: 11 * 60, endMinute: 11 * 60 + 30 };

test('a UTC offset moves the clock east, not west', () => {
  // 09:30 UTC on Monday 2026-09-07.
  const at = new Date('2026-09-07T09:30:00Z');

  assert.deepEqual(localNow(at, 0), { weekday: 1, minuteOfDay: 9 * 60 + 30 });
  // Berlin, +120: 11:30 local.
  assert.deepEqual(localNow(at, 120), { weekday: 1, minuteOfDay: 11 * 60 + 30 });
  // New York, -240: 05:30 local, still Monday.
  assert.deepEqual(localNow(at, -240), { weekday: 1, minuteOfDay: 5 * 60 + 30 });
});

test('an offset that crosses midnight also crosses the weekday', () => {
  // 23:30 UTC Sunday. Auckland (+720) is already 11:30 on Monday.
  const at = new Date('2026-09-06T23:30:00Z');
  assert.deepEqual(localNow(at, 720), { weekday: 1, minuteOfDay: 11 * 60 + 30 });

  // 00:30 UTC Monday. Los Angeles (-420) is still 17:30 on Sunday.
  const later = new Date('2026-09-07T00:30:00Z');
  assert.deepEqual(localNow(later, -420), { weekday: 0, minuteOfDay: 17 * 60 + 30 });
});

test('a window matches only on its own weekday', () => {
  assert.equal(openWindow([MON_11], { weekday: 1, minuteOfDay: 11 * 60 + 5 }), MON_11);
  assert.equal(openWindow([MON_11], { weekday: 2, minuteOfDay: 11 * 60 + 5 }), null);
});

test('a window is half-open, so abutting windows cannot both fire', () => {
  const morning: DeclaredWindow = { weekday: 1, startMinute: 600, endMinute: 720 };
  const afternoon: DeclaredWindow = { weekday: 1, startMinute: 720, endMinute: 840 };

  // Noon belongs to the afternoon window and to nothing else.
  assert.equal(openWindow([morning, afternoon], { weekday: 1, minuteOfDay: 720 }), afternoon);
  // The start is inclusive; the end is not.
  assert.equal(openWindow([morning], { weekday: 1, minuteOfDay: 600 }), morning);
  assert.equal(openWindow([morning], { weekday: 1, minuteOfDay: 720 }), null);
});

test('the time offered is what is left, not what was declared', () => {
  // Two minutes before the window shuts, two minutes is what is left —
  // and the caller refuses it, because a Snap needs ninety seconds and
  // the engine must never offer something that cannot be finished.
  assert.equal(secondsLeftIn(MON_11, { weekday: 1, minuteOfDay: 11 * 60 + 28 }), 120);
  assert.equal(secondsLeftIn(MON_11, { weekday: 1, minuteOfDay: 11 * 60 }), 1800);
  // Past the end it is zero rather than negative; a negative duration
  // would pass a `> 0` check somewhere downstream one day.
  assert.equal(secondsLeftIn(MON_11, { weekday: 1, minuteOfDay: 11 * 60 + 45 }), 0);
});

test('no windows means no nudge, which is the default state of an account', () => {
  assert.equal(openWindow([], { weekday: 1, minuteOfDay: 11 * 60 }), null);
});

/*
 * The rate limit, structurally.
 *
 * `PrescriptionsService` carries `@Injectable()`, so it cannot be
 * imported by the type-stripping runner and the rule cannot be exercised
 * directly here. It is asserted against the source instead — the same
 * technique `admin-guard.test.ts` uses for the unapplied-decorator class
 * of bug, and for the same reason: this is a rule that fails silently and
 * invisibly, by being absent rather than by being wrong.
 */
import { readFileSync } from 'node:fs';

const dto = readFileSync(new URL('../src/prescriptions/prescriptions.dto.ts', import.meta.url), 'utf8');
const service = readFileSync(
  new URL('../src/prescriptions/prescriptions.service.ts', import.meta.url),
  'utf8',
);

test('a caller cannot state its own daily cap', () => {
  for (const field of ['snapsDeliveredToday', 'dailyCap', 'minutesSinceLastNudge']) {
    assert.equal(
      new RegExp(`^\\s*${field}[!?]?:`, 'm').test(dto),
      false,
      `${field} is accepted from the request body again — the cap is whatever the caller says it is`,
    );
  }
});

test('the cap is counted from activity and read from the age mode', () => {
  assert.match(service, /this\.activity\.nudgeState\(request\.userId\)/);
  assert.match(service, /snapsDeliveredToday: deliveredToday/);
  assert.match(service, /dailyCap: AGE_MODE_DEFINITIONS\[request\.mode\]\.dailyCap/);
  assert.match(service, /minutesSinceLastNudge,/);
});

test('the scheduler goes through the same engine as the app', () => {
  const nudge = readFileSync(new URL('../src/nudge/nudge.service.ts', import.meta.url), 'utf8');
  // Not its own copy of the rules: the same PrescriptionsService, which
  // is what applies the cap, the cooldown, quiet hours and the safety
  // screen. A background path with its own logic is a second product.
  assert.match(nudge, /this\.prescriptions\.next\(/);
  // And it claims only the basis it actually has.
  assert.match(nudge, /consentedSignals: \['declared_schedule'\]/);
  assert.equal(/motionState: 'still'/.test(nudge), false);
});
