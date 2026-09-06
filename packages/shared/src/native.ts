/**
 * What a native shell is allowed to tell the platform, and what the
 * platform does with it.
 *
 * The web build is honest about what a browser cannot see: motion is
 * `unknown`, location is `unknown`, and the calendar is whatever .ics the
 * member imported by hand. Three things need a native shell to be real —
 * Apple Health and Health Connect, the device calendar, and continuous
 * motion — and `/wearables` already names the first of those as
 * supported, with `transport: 'on_device'` and a `/wearables/ingest`
 * endpoint that has never had a client capable of reading the store.
 *
 * This module is the contract between the shell and the product. It is
 * pure, so every rule in it is testable without a phone, an emulator, a
 * Mac or a store account — which matters more than usual here, because
 * the platform code that consumes it cannot be exercised on this machine
 * at all.
 *
 * ## Three rules that are not negotiable
 *
 * **A native host may narrow what the platform believes, never widen
 * it.** Every mapping below fails towards `unknown`, towards fewer
 * windows, and towards refusing a sample. A shell that is confused must
 * make the product quieter, not louder — the whole product is an
 * argument about not interrupting people at the wrong moment, and the
 * shell is the only component with the standing to get that wrong
 * silently.
 *
 * **A reading that is stale is not a reading.** Motion from four minutes
 * ago says nothing about whether somebody is driving now.
 *
 * **A scope the platform does not recognise is refused loudly.** Not
 * dropped: refused and named, so a shell that starts sending
 * `blood_glucose` after an OS update is a visible failure rather than a
 * quiet new category of health data arriving in the ledger.
 */

import type { BusyInterval } from './calendar';
import {
  DATA_SCOPES,
  PROVIDER_DEFINITIONS,
  type DataScope,
  type Provider,
} from './wearables';
import { MOTION_STATES, type MotionState } from './context';

/** Bumped when the contract changes shape. The shell sends its own. */
export const NATIVE_BRIDGE_VERSION = 1;

/**
 * The two shells that can exist, and the provider each one reads.
 *
 * `samsung_health` is deliberately absent: it is named in
 * `PROVIDERS` and its SDK is a separate partner integration, so a shell
 * claiming to be it would be claiming a capability nobody has built.
 */
export const NATIVE_PLATFORMS = ['ios', 'android'] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

export const HEALTH_PROVIDER_FOR: Readonly<Record<NativePlatform, Provider>> = {
  ios: 'apple_health',
  android: 'health_connect',
};

/**
 * Exactly what a shell may ask its health store for. Not a subset of it,
 * and not a superset.
 *
 * This is derived rather than written, because the two ends of it are
 * enforced in different languages and drifted apart the first time they
 * were written by hand. `/wearables` publishes
 * `PROVIDER_DEFINITIONS[provider].requests` as a disclosure to the member,
 * and `judgeSample` on the server refuses anything outside it — so a shell
 * asking for one category more shows a permission sheet contradicting the
 * public disclosure, and then has its readings rejected with
 * "Apple Health is never asked for recovery".
 *
 * The platform files cannot import TypeScript, so `native-bridge.test.ts`
 * reads their source and asserts the two lists match this one. That is the
 * only mechanism available for keeping a Swift constant honest from here,
 * and it is better than a comment asking somebody to remember.
 */
export const NATIVE_HEALTH_SCOPES: Readonly<Record<NativePlatform, readonly DataScope[]>> = {
  ios: PROVIDER_DEFINITIONS.apple_health.requests,
  android: PROVIDER_DEFINITIONS.health_connect.requests,
};

/** What the shell says it can do. Absent means no. */
export interface NativeCapabilities {
  readonly bridgeVersion: number;
  readonly platform: NativePlatform;
  /** HealthKit or Health Connect, and the member has granted read access. */
  readonly health: boolean;
  /** EKEventStore or CalendarContract, read-only. */
  readonly calendar: boolean;
  /** CMMotionActivityManager or ActivityRecognition. */
  readonly motion: boolean;
}

/** One reading, as the shell hands it over. */
export interface NativeHealthReading {
  readonly scope: string;
  readonly value: number;
  /** When the sample was taken, ISO 8601. */
  readonly recordedAt: string;
}

/** The sample shape `/wearables/ingest` already accepts. */
export interface IngestSample {
  readonly scope: string;
  readonly value: number;
  readonly ageMinutes: number;
}

export interface IngestBatch {
  readonly provider: Provider;
  readonly samples: IngestSample[];
  /** Readings that were not sent, and why. Never silently dropped. */
  readonly refused: { readonly scope: string; readonly why: string }[];
}

/** Older than this and a reading describes a day that has ended. */
export const MAX_HEALTH_READING_AGE_MINUTES = 60 * 36;

/**
 * Native readings, turned into the samples the API already takes.
 *
 * Nothing new is invented here. `/wearables/ingest` has existed since the
 * wearables module was written, with a scope judge and an age gate behind
 * it; what was missing was anything able to read Apple Health or Health
 * Connect. This is the translation layer, and it refuses rather than
 * guesses:
 *
 *   - a scope outside `DATA_SCOPES` is refused and named
 *   - a scope this provider is not declared to request is refused
 *     separately, because that is a different mistake with a different
 *     fix: the server's `judgeSample` would reject it too, and the member
 *     was shown a permission sheet contradicting `/wearables`
 *   - a non-finite or negative value is refused
 *   - a timestamp in the future is refused, because a clock that is wrong
 *     in that direction makes a stale reading look fresh
 *   - anything older than a day and a half is refused as history rather
 *     than context
 */
export function toIngestBatch(
  platform: NativePlatform,
  readings: readonly NativeHealthReading[],
  now: Date = new Date(),
): IngestBatch {
  const samples: IngestSample[] = [];
  const refused: { scope: string; why: string }[] = [];
  const known = new Set<string>(DATA_SCOPES);
  const requested = new Set<string>(NATIVE_HEALTH_SCOPES[platform]);
  const provider = HEALTH_PROVIDER_FOR[platform];

  for (const reading of readings) {
    if (!known.has(reading.scope)) {
      refused.push({ scope: reading.scope, why: 'not a scope this platform collects' });
      continue;
    }
    if (!requested.has(reading.scope)) {
      // A real scope, from the wrong store. The server refuses this too;
      // catching it here names the actual fault — a shell reading a
      // category its provider's published disclosure says is never asked
      // for — instead of a 400 that reads like a transport failure.
      refused.push({
        scope: reading.scope,
        why: `${provider} is never asked for ${reading.scope}`,
      });
      continue;
    }
    if (!Number.isFinite(reading.value) || reading.value < 0) {
      refused.push({ scope: reading.scope, why: 'value is not a non-negative number' });
      continue;
    }

    const at = Date.parse(reading.recordedAt);
    if (Number.isNaN(at)) {
      refused.push({ scope: reading.scope, why: 'recordedAt is not a timestamp' });
      continue;
    }

    const ageMinutes = Math.floor((now.getTime() - at) / 60_000);
    if (ageMinutes < 0) {
      refused.push({ scope: reading.scope, why: 'recorded in the future' });
      continue;
    }
    if (ageMinutes > MAX_HEALTH_READING_AGE_MINUTES) {
      refused.push({ scope: reading.scope, why: 'older than 36 hours' });
      continue;
    }

    samples.push({ scope: reading.scope as DataScope, value: reading.value, ageMinutes });
  }

  return { provider, samples, refused };
}

/* ------------------------------------------------------------------ *
 * Motion
 * ------------------------------------------------------------------ */

/**
 * The activity vocabularies the two platforms use.
 *
 * iOS `CMMotionActivity` exposes booleans plus a confidence; Android
 * `ActivityRecognition` returns a type and a confidence out of 100. The
 * shell normalises to these names so this mapping is written once.
 */
export const NATIVE_ACTIVITIES = [
  'stationary',
  'walking',
  'running',
  'automotive',
  'cycling',
  'unknown',
] as const;
export type NativeActivity = (typeof NATIVE_ACTIVITIES)[number];

export interface NativeMotion {
  readonly activity: string;
  /** 0–1. iOS low/medium/high maps to 0.33/0.66/1. */
  readonly confidence: number;
  /**
   * When the shell last had grounds to believe this.
   *
   * On iOS that is when the sample was taken. On Android it is *now*,
   * because the platform reports transitions rather than samples: the OS
   * says "they started sitting still" and says nothing further until that
   * changes, so the shell's grounds are current even when the event is
   * hours old.
   */
  readonly observedAt: string;
  /**
   * When the state began, on a platform that reports transitions.
   *
   * Present only from Android. Its absence means the reading is a sample
   * and `observedAt` is the whole story.
   */
  readonly continuingSince?: string;
}

/**
 * Below this, the shell does not know what somebody is doing.
 *
 * iOS reports `low` confidence often and it is frequently wrong. The
 * consequence of believing it is either a prompt delivered to somebody
 * driving, or silence for somebody sitting still — and the first of those
 * is the one this platform exists to prevent.
 */
export const MIN_MOTION_CONFIDENCE = 0.6;

/** Motion older than this says nothing about now. */
export const MAX_MOTION_AGE_MINUTES = 3;

/**
 * How long a transition-reported state may be believed.
 *
 * Android's Activity Recognition Transition API is sparse by design: it
 * reports that somebody started sitting still and then says nothing for
 * as long as that remains true. So the *event* is old while the *state*
 * is current, and applying `MAX_MOTION_AGE_MINUTES` to it would mean
 * Android motion never worked at all — the reading would be stale within
 * three minutes of every transition and `unknown` for the rest of the
 * day.
 *
 * There is still a ceiling, because a subscription can be interrupted by
 * a force-stop, an app update or a revoked permission, and a state that
 * has not changed in a working day is more likely a missed transition
 * than a fact.
 *
 * Six hours, and the reason it can be this generous is worth stating.
 * `ContextService` blocks on `driving` and `cycling` only; `still`,
 * `walking` and `unknown` all pass. So a stale *blocking* state
 * over-blocks, which is silence, which is the safe direction. And a stale
 * *permissive* state — believing somebody is still when they have started
 * driving — fails exactly as `unknown` already fails, because `unknown`
 * does not block either. Staleness here can cost a block that would have
 * been missed anyway. It cannot cause a wrong one.
 */
export const MAX_CONTINUING_STATE_MINUTES = 6 * 60;

/**
 * A native activity reading, as a `MotionState` the context engine takes.
 *
 * Every failure — unrecognised activity, low confidence, stale reading,
 * bad timestamp — returns `unknown`, which blocks nothing and asserts
 * nothing. That is the same answer the web client gives, so the native
 * shell can only ever make the engine better informed, never worse.
 */
export function toMotionState(
  motion: NativeMotion | null | undefined,
  now: Date = new Date(),
): MotionState {
  if (!motion) return 'unknown';

  const at = Date.parse(motion.observedAt);
  if (Number.isNaN(at)) return 'unknown';
  const ageMinutes = (now.getTime() - at) / 60_000;
  if (ageMinutes < 0 || ageMinutes > MAX_MOTION_AGE_MINUTES) return 'unknown';

  /*
   * A transition-reported state carries when it began, and is judged on
   * that rather than on when the shell last looked. The ceiling lives
   * here rather than in the Kotlin because this is the half that can be
   * tested — the receiver that produces it has never been compiled.
   */
  if (motion.continuingSince !== undefined) {
    const since = Date.parse(motion.continuingSince);
    if (Number.isNaN(since)) return 'unknown';
    const heldForMinutes = (now.getTime() - since) / 60_000;
    // Entered in the future is a broken clock, not a state.
    if (heldForMinutes < 0 || heldForMinutes > MAX_CONTINUING_STATE_MINUTES) return 'unknown';
  }

  if (!Number.isFinite(motion.confidence) || motion.confidence < MIN_MOTION_CONFIDENCE) {
    return 'unknown';
  }

  const mapped: Record<string, MotionState> = {
    stationary: 'still',
    walking: 'walking',
    // Running is movement the engine has no separate handling for, and
    // calling it `walking` is closer to true than calling it nothing.
    running: 'walking',
    automotive: 'driving',
    cycling: 'cycling',
  };
  const state = mapped[motion.activity];
  return state && (MOTION_STATES as readonly string[]).includes(state) ? state : 'unknown';
}

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

/**
 * An event as the device calendar hands it over.
 *
 * Note what is not here. There is no title, no location, no attendee and
 * no organiser field, so a shell has nowhere to put one. The claim on the
 * landing page — that calendar titles never leave the device — is kept by
 * the shape of this interface, not by a promise about what the shell
 * chooses to send.
 */
export interface NativeCalendarEvent {
  /** ISO 8601. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** True when the member marked it as free rather than busy. */
  readonly transparent?: boolean;
  readonly allDay?: boolean;
}

/**
 * Device events, as the busy intervals the window derivation already
 * takes.
 *
 * The same `windowsFromBusy` the .ics import uses runs afterwards, so
 * "free" means one thing whether the calendar arrived as a file or from
 * the device. An all-day event is ignored rather than treated as
 * twenty-four hours busy: a birthday or a leave marker is not a reason to
 * stay silent for a whole day, and treating it as one would empty the
 * schedule of anybody who keeps that sort of calendar.
 */
export function toBusyIntervals(
  events: readonly NativeCalendarEvent[],
  utcOffsetMinutes: number,
): BusyInterval[] {
  const out: BusyInterval[] = [];

  for (const event of events) {
    if (event.transparent || event.allDay) continue;

    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

    out.push({
      startMinute: Math.floor(start / 60_000) + utcOffsetMinutes,
      endMinute: Math.ceil(end / 60_000) + utcOffsetMinutes,
    });
  }

  return out;
}

/**
 * Whether a capability announcement can be believed.
 *
 * A shell built against a newer contract than this build understands is
 * treated as having no capabilities at all. The alternative — accepting
 * fields it does not recognise — is how a shell ends up feeding a health
 * scope or a motion vocabulary the platform has never judged.
 */
export function usableCapabilities(
  announced: Partial<NativeCapabilities> | null | undefined,
): NativeCapabilities | null {
  if (!announced) return null;
  if (announced.bridgeVersion !== NATIVE_BRIDGE_VERSION) return null;
  if (!announced.platform || !(NATIVE_PLATFORMS as readonly string[]).includes(announced.platform)) {
    return null;
  }
  return {
    bridgeVersion: NATIVE_BRIDGE_VERSION,
    platform: announced.platform,
    health: announced.health === true,
    calendar: announced.calendar === true,
    motion: announced.motion === true,
  };
}
