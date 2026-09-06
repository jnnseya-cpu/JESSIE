import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  busyIntervals,
  deriveFreeWindows,
  parseDuration,
  parseIcsTime,
  unfold,
} from '@jessmove/shared';

/*
 * Reading a calendar without ever seeing it.
 *
 * The privacy claim this module exists to keep — "your calendar titles
 * never leave your device" — is only true if the parser never reads a
 * title. That is asserted here against the source, because it is the
 * kind of property that is lost by somebody adding a helpful field
 * rather than by anything failing.
 */

const MONDAY_NOON = new Date('2026-09-07T12:00:00Z'); // a Monday

function ics(body: string): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

test('folded lines are rejoined before anything is parsed', () => {
  // RFC 5545 splits long values across lines with a leading space.
  const lines = unfold('DTSTART;TZID=Europe/Lon\r\n don:20260907T090000');
  assert.deepEqual(lines, ['DTSTART;TZID=Europe/London:20260907T090000']);
});

test('a UTC time moves with the member; a floating one does not', () => {
  const utc = parseIcsTime('20260907T090000Z', 120);
  const floating = parseIcsTime('20260907T090000', 120);
  assert.equal(utc! - floating!, 120, 'a Z time is shifted into the member’s clock, a floating one is already in it');
  assert.equal(parseIcsTime('not-a-time', 0), null);
});

test('durations are read when there is no DTEND', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration('P1D'), 1440);
  assert.equal(parseDuration('rubbish'), null);
});

test('an event marked free, or cancelled, blocks nothing', () => {
  const from = Math.floor(Date.UTC(2026, 8, 7) / 60_000);
  const busy = busyIntervals(
    ics(
      [
        'BEGIN:VEVENT',
        'DTSTART:20260907T090000',
        'DTEND:20260907T100000',
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'DTSTART:20260907T110000',
        'DTEND:20260907T120000',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ].join('\r\n'),
    ),
    0,
    14 * 1440,
    from,
  );
  assert.deepEqual(busy, []);
});

test('a weekly recurrence lands on the right weekday, from before the horizon', () => {
  const from = Math.floor(Date.UTC(2026, 8, 7) / 60_000);
  const busy = busyIntervals(
    ics(
      [
        'BEGIN:VEVENT',
        // Started months earlier; still a Monday.
        'DTSTART:20260601T090000',
        'DTEND:20260601T100000',
        'RRULE:FREQ=WEEKLY',
        'END:VEVENT',
      ].join('\r\n'),
    ),
    0,
    14 * 1440,
    from,
  );
  assert.ok(busy.length >= 2, 'two Mondays inside a fortnight');
  for (const b of busy) {
    const minuteOfDay = ((b.startMinute % 1440) + 1440) % 1440;
    assert.equal(minuteOfDay, 9 * 60, 'every occurrence is at 09:00');
  }
});

test('a malformed recurrence cannot spin the browser', () => {
  const from = Math.floor(Date.UTC(2026, 8, 7) / 60_000);
  const busy = busyIntervals(
    ics(
      ['BEGIN:VEVENT', 'DTSTART:19700101T000000', 'DURATION:PT1M', 'RRULE:FREQ=DAILY', 'END:VEVENT'].join(
        '\r\n',
      ),
    ),
    0,
    14 * 1440,
    from,
  );
  assert.ok(busy.length <= 400, 'the expansion is bounded');
});

test('a busy morning produces an afternoon window and not a morning one', () => {
  const windows = deriveFreeWindows(
    ics(
      [
        'BEGIN:VEVENT',
        'DTSTART:20260907T080000',
        'DTEND:20260907T130000',
        'RRULE:FREQ=DAILY',
        'END:VEVENT',
      ].join('\r\n'),
    ),
    { utcOffsetMinutes: 0, now: MONDAY_NOON, horizonDays: 7, maxPerWeekday: 1 },
  );

  assert.ok(windows.length > 0, 'the afternoon is free every day');
  for (const w of windows) {
    assert.ok(w.startMinute >= 13 * 60, `a window started at ${w.startMinute}, inside the blocked morning`);
    assert.ok(w.endMinute <= 18 * 60, 'nothing is offered after the working day');
  }
});

test('a slot busy on only one occurrence is not offered on that weekday', () => {
  // Two Tuesdays in the horizon; the second has a 14:00 meeting. Offering
  // 14:00 on Tuesdays would be right half the time, which is the wrong
  // half for something that interrupts people.
  const withMeeting = deriveFreeWindows(
    ics(
      ['BEGIN:VEVENT', 'DTSTART:20260915T140000', 'DTEND:20260915T150000', 'END:VEVENT'].join('\r\n'),
    ),
    { utcOffsetMinutes: 0, now: MONDAY_NOON, horizonDays: 14, maxPerWeekday: 4, minGapMinutes: 15 },
  );

  const tuesday = withMeeting.filter((w) => w.weekday === 2);
  for (const w of tuesday) {
    const overlaps = w.startMinute < 15 * 60 && w.endMinute > 14 * 60;
    assert.equal(overlaps, false, 'no Tuesday window covers 14:00–15:00');
  }
});

test('an empty calendar offers the whole working day', () => {
  const windows = deriveFreeWindows(ics('BEGIN:VEVENT\r\nEND:VEVENT'), {
    utcOffsetMinutes: 0,
    now: MONDAY_NOON,
    horizonDays: 7,
    maxPerWeekday: 1,
  });
  assert.equal(windows.length, 7, 'one window per weekday');
  for (const w of windows) {
    assert.equal(w.startMinute, 8 * 60);
    assert.equal(w.endMinute, 18 * 60);
  }
});

test('the parser never reads what a meeting is about', () => {
  // The claim on the landing page is that titles and attendees are never
  // transmitted. That is only true because they are never read: there is
  // no branch on which they could be kept by accident.
  const source = new URL('../../../packages/shared/src/calendar.ts', import.meta.url);
  const text = readFileSync(source, 'utf8');
  const body = text.slice(text.indexOf('export function unfold'));
  for (const property of ['SUMMARY', 'DESCRIPTION', 'LOCATION', 'ATTENDEE', 'ORGANIZER']) {
    assert.equal(
      body.includes(property),
      false,
      `${property} is referenced in the parser — a title now has a path off the device`,
    );
  }
});

test('what leaves the device is weekdays and minutes, nothing else', () => {
  const windows = deriveFreeWindows(
    ics(
      [
        'BEGIN:VEVENT',
        'SUMMARY:Oncology follow-up with Dr Patel',
        'LOCATION:St James Hospital',
        'ATTENDEE:mailto:someone@example.com',
        'DTSTART:20260907T090000',
        'DTEND:20260907T100000',
        'END:VEVENT',
      ].join('\r\n'),
    ),
    { utcOffsetMinutes: 0, now: MONDAY_NOON, horizonDays: 7 },
  );

  const serialised = JSON.stringify(windows);
  for (const secret of ['Oncology', 'Patel', 'St James', 'example.com']) {
    assert.equal(serialised.includes(secret), false, `"${secret}" survived into the output`);
  }
  for (const w of windows) {
    assert.deepEqual(Object.keys(w).sort(), ['endMinute', 'startMinute', 'weekday']);
  }
});
