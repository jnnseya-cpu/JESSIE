/**
 * Reading a calendar without ever seeing it.
 *
 * The product's whole premise is "the day you already have", and there
 * was no calendar anywhere in the platform: no module, no ingestion, and
 * `ContextSignals` had no field for an event. The headline — "your next
 * call is at 15:00" — had no code path that could produce it.
 *
 * The obvious fix is a Google Calendar OAuth integration. It is the wrong
 * one twice over. It adds a third vendor, which CLAUDE.md makes an
 * explicit decision rather than a default. And it breaks the sentence the
 * landing page and the entire /industries privacy argument rest on:
 *
 *     "Your calendar titles never leave your device. Events are
 *      classified on your phone as busy, free, focus or travel. Titles
 *      and attendees are never transmitted."
 *
 * A server-side integration reads the titles. Whatever it then does with
 * them, that sentence stops being true, and it is the sentence the
 * organisation product is sold on.
 *
 * So the calendar is read where the member already has it. Every
 * mainstream calendar — Google, Outlook, Apple, anything CalDAV —
 * publishes an iCalendar feed, and an .ics file is text. This module
 * parses it, decides which minutes of a typical week are already spoken
 * for, and returns the gaps. It runs in the browser. What leaves the
 * device is a list of weekday-and-minute ranges: no titles, no
 * attendees, no locations, no organisers, no event count.
 *
 * Nothing here reads SUMMARY, DESCRIPTION, LOCATION, ATTENDEE or
 * ORGANIZER. Not "reads them and discards them" — the parser never looks
 * at those properties, so there is no code path on which they could be
 * kept by accident.
 *
 * ## What this deliberately does not do
 *
 * Full RFC 5545 recurrence. `RRULE` is expanded for `FREQ=WEEKLY` and
 * `FREQ=DAILY` only, which covers a standing meeting and a daily
 * stand-up; `BYDAY`, `BYSETPOS`, `EXDATE` and monthly rules are not
 * expanded. The consequence is always the same direction — an
 * unexpanded recurrence makes a slot look freer than it is — so the
 * caller is expected to treat the result as a suggestion the member
 * confirms, which is exactly how the import screen uses it.
 *
 * Named time zones. A `DTSTART;TZID=Europe/London` is treated as local
 * time, because resolving a TZID needs a zone database this platform has
 * no reason to ship. UTC (`Z`) is converted properly. In practice a
 * member's own calendar is written in their own zone, so the
 * approximation is right far more often than not — and it is stated here
 * rather than discovered later.
 */

export interface BusyInterval {
  /** Minutes from the epoch, local to the member. */
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface FreeWindow {
  /** 0 = Sunday, matching Date#getDay. */
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface DeriveOptions {
  /** Minutes east of UTC, for converting `Z` timestamps. */
  readonly utcOffsetMinutes: number;
  /** Earliest minute of the day a window may start. Default 08:00. */
  readonly dayStartMinute?: number;
  /** Latest minute of the day a window may end. Default 18:00. */
  readonly dayEndMinute?: number;
  /** Shortest gap worth offering. Default 15 minutes. */
  readonly minGapMinutes?: number;
  /** How many days forward to read. Default 14. */
  readonly horizonDays?: number;
  /** Most windows to return per weekday. Default 2, longest first. */
  readonly maxPerWeekday?: number;
  /** Overridable so the derivation is testable without mocking a clock. */
  readonly now?: Date;
}

const DAY = 24 * 60;

/**
 * Undoes RFC 5545 line folding.
 *
 * A long property is split across lines with a space or tab beginning
 * each continuation. Parsing without unfolding first silently truncates
 * every long value, which for a DTSTART with a TZID is a wrong time
 * rather than a missing one.
 */
export function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const raw of ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/**
 * An iCalendar date-time, in minutes from the epoch, local to the member.
 *
 * Three forms occur. `20260907T090000Z` is UTC and is shifted by the
 * member's offset. `20260907T090000` is floating or carries a TZID, and
 * is taken as already local. `20260907` is an all-day date.
 */
export function parseIcsTime(value: string, utcOffsetMinutes: number): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;

  const [, y, mo, d, hh = '00', mm = '00', , z] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm));
  if (Number.isNaN(utc)) return null;

  const minutes = Math.floor(utc / 60_000);
  // A `Z` time is a real instant and moves with the member's offset. A
  // floating one is already the wall clock they see.
  return z ? minutes + utcOffsetMinutes : minutes;
}

interface RawEvent {
  start: number;
  end: number;
  allDay: boolean;
  transparent: boolean;
  cancelled: boolean;
  repeatEveryDays: number | null;
  repeatUntil: number | null;
}

/**
 * Busy intervals from an .ics document.
 *
 * Only DTSTART, DTEND, DURATION, TRANSP, STATUS and RRULE are read. The
 * properties that carry what a meeting is *about* are never inspected.
 */
export function busyIntervals(
  ics: string,
  utcOffsetMinutes: number,
  horizonMinutes: number,
  fromMinute: number,
): BusyInterval[] {
  const lines = unfold(ics);
  const events: RawEvent[] = [];
  let current: Partial<RawEvent> & { start?: number; durationMinutes?: number } | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith('BEGIN:VEVENT')) {
      current = { transparent: false, cancelled: false, repeatEveryDays: null, repeatUntil: null };
      continue;
    }
    if (upper.startsWith('END:VEVENT')) {
      if (current?.start != null) {
        const start = current.start;
        const end =
          current.end != null
            ? current.end
            : current.durationMinutes != null
              ? start + current.durationMinutes
              : start + (current.allDay ? DAY : 60);
        events.push({
          start,
          end: Math.max(end, start + 1),
          allDay: Boolean(current.allDay),
          transparent: Boolean(current.transparent),
          cancelled: Boolean(current.cancelled),
          repeatEveryDays: current.repeatEveryDays ?? null,
          repeatUntil: current.repeatUntil ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).toUpperCase();
    const value = line.slice(colon + 1);

    if (name.startsWith('DTSTART')) {
      current.start = parseIcsTime(value, utcOffsetMinutes) ?? undefined;
      current.allDay = name.includes('VALUE=DATE') && !value.includes('T');
    } else if (name.startsWith('DTEND')) {
      current.end = parseIcsTime(value, utcOffsetMinutes) ?? undefined;
    } else if (name.startsWith('DURATION')) {
      current.durationMinutes = parseDuration(value) ?? undefined;
    } else if (name.startsWith('TRANSP')) {
      // TRANSPARENT means "does not block time" — the member marked it free.
      current.transparent = value.trim().toUpperCase() === 'TRANSPARENT';
    } else if (name.startsWith('STATUS')) {
      current.cancelled = value.trim().toUpperCase() === 'CANCELLED';
    } else if (name.startsWith('RRULE')) {
      const freq = /FREQ=([A-Z]+)/.exec(value.toUpperCase())?.[1];
      const interval = Number(/INTERVAL=(\d+)/.exec(value.toUpperCase())?.[1] ?? '1') || 1;
      if (freq === 'WEEKLY') current.repeatEveryDays = 7 * interval;
      else if (freq === 'DAILY') current.repeatEveryDays = interval;
      const until = /UNTIL=([0-9TZ]+)/.exec(value.toUpperCase())?.[1];
      if (until) current.repeatUntil = parseIcsTime(until, utcOffsetMinutes);
    }
  }

  const horizonEnd = fromMinute + horizonMinutes;
  const busy: BusyInterval[] = [];

  for (const event of events) {
    if (event.cancelled || event.transparent) continue;

    const length = event.end - event.start;
    const step = event.repeatEveryDays ? event.repeatEveryDays * DAY : null;

    if (step == null) {
      if (event.end > fromMinute && event.start < horizonEnd) {
        busy.push({ startMinute: event.start, endMinute: event.end });
      }
      continue;
    }

    /*
     * A recurrence is walked forward from its own start rather than from
     * today, so a weekly meeting that began last year still lands on the
     * right weekday. Bounded by the horizon and by a hard iteration
     * ceiling, because a malformed RRULE with a tiny interval is a way to
     * make somebody's browser spin.
     */
    let occurrence = event.start;
    if (occurrence < fromMinute) {
      const skipped = Math.floor((fromMinute - occurrence) / step);
      occurrence += skipped * step;
    }
    for (let i = 0; i < 400 && occurrence < horizonEnd; i += 1) {
      if (event.repeatUntil != null && occurrence > event.repeatUntil) break;
      if (occurrence + length > fromMinute) {
        busy.push({ startMinute: occurrence, endMinute: occurrence + length });
      }
      occurrence += step;
    }
  }

  return busy;
}

/**
 * The gaps in a typical week, as windows the member can confirm.
 *
 * A minute is offered only if it was free on *every* occurrence of that
 * weekday inside the horizon. Two Tuesdays where one had a 14:00 meeting
 * produce a Tuesday with no 14:00 window — the conservative direction,
 * and the right one for something whose first law is that it would rather
 * stay silent than interrupt.
 */
export function deriveFreeWindows(ics: string, options: DeriveOptions): FreeWindow[] {
  const {
    utcOffsetMinutes,
    dayStartMinute = 8 * 60,
    dayEndMinute = 18 * 60,
    minGapMinutes = 15,
    horizonDays = 14,
    maxPerWeekday = 2,
    now = new Date(),
  } = options;

  const nowLocalMinute = Math.floor(now.getTime() / 60_000) + utcOffsetMinutes;
  // Midnight of the current local day, so weekday arithmetic is exact.
  const dayZero = Math.floor(nowLocalMinute / DAY) * DAY;
  const horizonMinutes = horizonDays * DAY;

  const busy = busyIntervals(ics, utcOffsetMinutes, horizonMinutes, dayZero);
  return windowsFromBusy(busy, {
    dayZero,
    horizonDays,
    dayStartMinute,
    dayEndMinute,
    minGapMinutes,
    maxPerWeekday,
  });
}

/**
 * The gaps, given intervals that are already busy.
 *
 * Split out of `deriveFreeWindows` when the native shell arrived: a
 * device calendar hands back events directly and has no .ics to parse,
 * and two copies of this arithmetic would be two places for a member to
 * be interrupted during a meeting. The parsing differs; what "free"
 * means must not.
 */
export function windowsFromBusy(
  busy: readonly BusyInterval[],
  options: {
    dayZero: number;
    horizonDays: number;
    dayStartMinute: number;
    dayEndMinute: number;
    minGapMinutes: number;
    maxPerWeekday: number;
  },
): FreeWindow[] {
  const { dayZero, horizonDays, dayStartMinute, dayEndMinute, minGapMinutes, maxPerWeekday } =
    options;

  /** Per weekday, the minutes of the day already spoken for. */
  const blocked = new Map<number, Set<number>>();
  const seenWeekdays = new Set<number>();

  for (let day = 0; day < horizonDays; day += 1) {
    const dayStart = dayZero + day * DAY;
    // 1 Jan 1970 was a Thursday (4), which is where the weekday walk starts.
    const weekday = (Math.floor(dayStart / DAY) + 4) % 7;
    seenWeekdays.add(weekday);
    if (!blocked.has(weekday)) blocked.set(weekday, new Set());
    const set = blocked.get(weekday)!;

    for (const interval of busy) {
      const from = Math.max(interval.startMinute, dayStart);
      const to = Math.min(interval.endMinute, dayStart + DAY);
      for (let m = from; m < to; m += 1) set.add(m - dayStart);
    }
  }

  const windows: FreeWindow[] = [];
  for (const weekday of [...seenWeekdays].sort((a, b) => a - b)) {
    const set = blocked.get(weekday) ?? new Set<number>();
    const gaps: FreeWindow[] = [];
    let runStart: number | null = null;

    for (let m = dayStartMinute; m <= dayEndMinute; m += 1) {
      const free = m < dayEndMinute && !set.has(m);
      if (free && runStart == null) runStart = m;
      if (!free && runStart != null) {
        if (m - runStart >= minGapMinutes) {
          gaps.push({ weekday, startMinute: runStart, endMinute: m });
        }
        runStart = null;
      }
    }

    gaps
      .sort((a, b) => b.endMinute - b.startMinute - (a.endMinute - a.startMinute))
      .slice(0, maxPerWeekday)
      .forEach((g) => windows.push(g));
  }

  return windows.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

/** `PT1H30M` and friends, in minutes. */
export function parseDuration(value: string): number | null {
  const m = /^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim().toUpperCase());
  if (!m) return null;
  const [, d = '0', h = '0', mi = '0'] = m;
  const total = Number(d) * DAY + Number(h) * 60 + Number(mi);
  return total > 0 ? total : null;
}
