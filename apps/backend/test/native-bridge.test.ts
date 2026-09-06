import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HEALTH_PROVIDER_FOR,
  MAX_HEALTH_READING_AGE_MINUTES,
  NATIVE_BRIDGE_VERSION,
  toBusyIntervals,
  toIngestBatch,
  toMotionState,
  usableCapabilities,
} from '@jessmove/shared';

/*
 * The native shell's contract.
 *
 * None of the platform code that consumes this can be run on this
 * machine — there is no Android SDK and no Xcode — so the rules that keep
 * a confused shell from making the product louder are asserted here,
 * where they can be. Every one of them fails towards silence.
 */

const NOW = new Date('2026-09-07T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

/* ── health ─────────────────────────────────────────────────────────── */

test('a reading the platform has never judged is refused, and named', () => {
  const batch = toIngestBatch(
    'ios',
    [
      { scope: 'steps', value: 4200, recordedAt: ago(30) },
      { scope: 'blood_glucose', value: 5.4, recordedAt: ago(30) },
    ],
    NOW,
  );

  assert.deepEqual(batch.samples.map((s) => s.scope), ['steps']);
  assert.deepEqual(batch.refused, [
    { scope: 'blood_glucose', why: 'not a scope this platform collects' },
  ]);
});

test('the provider follows the platform, and matches what /wearables already knows', () => {
  assert.equal(HEALTH_PROVIDER_FOR.ios, 'apple_health');
  assert.equal(HEALTH_PROVIDER_FOR.android, 'health_connect');
  assert.equal(toIngestBatch('android', [], NOW).provider, 'health_connect');
});

test('a reading from the future is refused rather than treated as fresh', () => {
  const batch = toIngestBatch(
    'ios',
    [{ scope: 'steps', value: 10, recordedAt: ago(-90) }],
    NOW,
  );
  assert.deepEqual(batch.samples, []);
  assert.equal(batch.refused[0]?.why, 'recorded in the future');
});

test('history is not context', () => {
  const stale = toIngestBatch(
    'ios',
    [{ scope: 'sleep', value: 7, recordedAt: ago(MAX_HEALTH_READING_AGE_MINUTES + 1) }],
    NOW,
  );
  assert.deepEqual(stale.samples, []);

  const fresh = toIngestBatch(
    'ios',
    [{ scope: 'sleep', value: 7, recordedAt: ago(MAX_HEALTH_READING_AGE_MINUTES - 1) }],
    NOW,
  );
  assert.equal(fresh.samples.length, 1);
});

test('nonsense values never reach the ledger', () => {
  const batch = toIngestBatch(
    'ios',
    [
      { scope: 'steps', value: Number.NaN, recordedAt: ago(5) },
      { scope: 'steps', value: -1, recordedAt: ago(5) },
      { scope: 'steps', value: 1, recordedAt: 'yesterday' },
    ],
    NOW,
  );
  assert.deepEqual(batch.samples, []);
  assert.equal(batch.refused.length, 3);
});

/* ── motion ─────────────────────────────────────────────────────────── */

test('low confidence is not a reading', () => {
  // iOS reports `low` often and is frequently wrong. Believing it either
  // interrupts somebody who is driving or silences somebody who is not.
  assert.equal(
    toMotionState({ activity: 'automotive', confidence: 0.33, observedAt: ago(1) }, NOW),
    'unknown',
  );
  assert.equal(
    toMotionState({ activity: 'automotive', confidence: 0.9, observedAt: ago(1) }, NOW),
    'driving',
  );
});

test('motion from four minutes ago says nothing about now', () => {
  assert.equal(
    toMotionState({ activity: 'stationary', confidence: 1, observedAt: ago(4) }, NOW),
    'unknown',
  );
  assert.equal(
    toMotionState({ activity: 'stationary', confidence: 1, observedAt: ago(2) }, NOW),
    'still',
  );
});

test('every unmapped or missing case is unknown, which blocks nothing and asserts nothing', () => {
  for (const motion of [
    null,
    undefined,
    { activity: 'skydiving', confidence: 1, observedAt: ago(1) },
    { activity: 'stationary', confidence: Number.NaN, observedAt: ago(1) },
    { activity: 'stationary', confidence: 1, observedAt: 'not a time' },
    { activity: 'stationary', confidence: 1, observedAt: ago(-5) },
  ]) {
    assert.equal(toMotionState(motion as never, NOW), 'unknown');
  }
});

test('the vocabularies of both platforms land on the engine’s own states', () => {
  const at = ago(1);
  assert.equal(toMotionState({ activity: 'walking', confidence: 1, observedAt: at }, NOW), 'walking');
  assert.equal(toMotionState({ activity: 'running', confidence: 1, observedAt: at }, NOW), 'walking');
  assert.equal(toMotionState({ activity: 'cycling', confidence: 1, observedAt: at }, NOW), 'cycling');
  assert.equal(toMotionState({ activity: 'unknown', confidence: 1, observedAt: at }, NOW), 'unknown');
});

/* ── calendar ───────────────────────────────────────────────────────── */

test('a device event has nowhere to put a title', () => {
  // The privacy claim is kept by the shape of the interface rather than by
  // trusting the shell to leave the title behind.
  const source = new URL('../../../packages/shared/src/native.ts', import.meta.url);
  const text = readFileSync(source, 'utf8');
  const iface = text.slice(
    text.indexOf('export interface NativeCalendarEvent'),
    text.indexOf('export function toBusyIntervals'),
  );
  for (const field of ['title', 'summary', 'location', 'attendee', 'organizer', 'notes']) {
    assert.equal(
      new RegExp(`readonly ${field}`, 'i').test(iface),
      false,
      `NativeCalendarEvent has a ${field} — a title now has a path off the device`,
    );
  }
});

test('an event marked free, or all-day, blocks nothing', () => {
  const busy = toBusyIntervals(
    [
      { startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T10:00:00Z', transparent: true },
      { startsAt: '2026-09-07T00:00:00Z', endsAt: '2026-09-08T00:00:00Z', allDay: true },
    ],
    0,
  );
  // A birthday is not a reason to stay silent for a day.
  assert.deepEqual(busy, []);
});

test('a malformed event is skipped rather than blocking the whole day', () => {
  const busy = toBusyIntervals(
    [
      { startsAt: 'nonsense', endsAt: '2026-09-07T10:00:00Z' },
      { startsAt: '2026-09-07T11:00:00Z', endsAt: '2026-09-07T10:00:00Z' },
      { startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T10:00:00Z' },
    ],
    0,
  );
  assert.equal(busy.length, 1);
});

test('the member’s offset is applied once, in the same direction as everything else', () => {
  const [interval] = toBusyIntervals(
    [{ startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T10:00:00Z' }],
    120,
  );
  // 09:00Z is 11:00 in a +120 zone.
  assert.equal(interval!.startMinute % (24 * 60), 11 * 60);
});

/* ── capabilities ───────────────────────────────────────────────────── */

test('a shell built against a different contract has no capabilities at all', () => {
  assert.equal(
    usableCapabilities({ bridgeVersion: NATIVE_BRIDGE_VERSION + 1, platform: 'ios', health: true }),
    null,
  );
  assert.equal(usableCapabilities(null), null);
  assert.equal(usableCapabilities({ bridgeVersion: NATIVE_BRIDGE_VERSION } as never), null);
  assert.equal(
    usableCapabilities({ bridgeVersion: NATIVE_BRIDGE_VERSION, platform: 'windows' } as never),
    null,
  );
});

test('a capability is only true when it is announced as exactly true', () => {
  const caps = usableCapabilities({
    bridgeVersion: NATIVE_BRIDGE_VERSION,
    platform: 'android',
    health: 'yes' as never,
    calendar: true,
  });
  assert.deepEqual(caps, {
    bridgeVersion: NATIVE_BRIDGE_VERSION,
    platform: 'android',
    health: false,
    calendar: true,
    motion: false,
  });
});
