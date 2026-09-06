'use client';

import {
  NATIVE_BRIDGE_VERSION,
  toBusyIntervals,
  toIngestBatch,
  toMotionState,
  usableCapabilities,
  windowsFromBusy,
  type FreeWindow,
  type IngestBatch,
  type NativeCalendarEvent,
  type NativeCapabilities,
  type NativeHealthReading,
  type NativeMotion,
} from '@jessmove/shared';
import type { MotionState } from '@jessmove/shared';
import { apiBase } from './api-base';

/**
 * The seam between the web build and the native shell.
 *
 * The same bundle runs in both. In a browser every function here returns
 * nothing and the product behaves exactly as it does today — `unknown`
 * motion, no health, and whatever calendar the member imported by hand.
 * Inside the shell the same functions return real readings.
 *
 * That is deliberate and it is the whole reason the shell is a Capacitor
 * wrapper rather than a React Native rewrite: there is one product, one
 * design system and one set of routes, and the native build adds
 * capabilities to it instead of forking it. A second implementation of
 * thirty screens would be a second product to keep correct.
 *
 * Everything is wrapped, timed out and typed through the shared
 * contract's validators, because a bridge is the one place where a bug in
 * somebody else's process becomes a bug in this one. A shell that hangs,
 * throws, or answers in a shape this build does not understand is
 * indistinguishable from a browser — which is the safe answer, since the
 * browser answer never asserts anything.
 */

interface NativeHost {
  capabilities?: () => unknown;
  readMotion?: () => Promise<unknown>;
  readHealth?: () => Promise<unknown>;
  readCalendar?: (horizonDays: number) => Promise<unknown>;
  requestHealthAccess?: () => Promise<unknown>;
  requestMotionAccess?: () => Promise<unknown>;
  requestCalendarAccess?: () => Promise<unknown>;
  requestPushToken?: () => Promise<unknown>;
}

/** How long the shell gets before it is treated as absent. */
const HOST_TIMEOUT_MS = 4000;

function host(): NativeHost | null {
  if (typeof window === 'undefined') return null;
  const injected = (window as unknown as { JessMoveNative?: NativeHost }).JessMoveNative;
  return injected && typeof injected === 'object' ? injected : null;
}

async function withTimeout<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), HOST_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What this device can actually do. Null in any browser. */
export function nativeCapabilities(): NativeCapabilities | null {
  const h = host();
  if (!h?.capabilities) return null;
  try {
    return usableCapabilities(h.capabilities() as Partial<NativeCapabilities>);
  } catch {
    return null;
  }
}

export function isNative(): boolean {
  return nativeCapabilities() !== null;
}

/**
 * The member's current motion, or `unknown`.
 *
 * `unknown` is what the web build already sends and it blocks nothing, so
 * a shell that cannot answer leaves the engine exactly as well informed
 * as a browser — never worse. Every validation lives in `toMotionState`,
 * including the confidence floor and the staleness window, so the rules
 * are the same ones the tests exercise.
 */
export async function currentMotion(): Promise<MotionState> {
  const h = host();
  const caps = nativeCapabilities();
  if (!h?.readMotion || !caps?.motion) return 'unknown';

  const reading = await withTimeout(h.readMotion());
  return toMotionState(reading as NativeMotion | null);
}

/**
 * Health samples, ready for the endpoint that has been waiting for them.
 *
 * `/wearables/ingest` and its scope judge were written when the wearables
 * module was, with `apple_health` and `health_connect` declared
 * `transport: 'on_device'`. Nothing has ever been able to read those
 * stores. This is that client.
 */
export async function readHealth(): Promise<IngestBatch | null> {
  const h = host();
  const caps = nativeCapabilities();
  if (!h?.readHealth || !caps?.health) return null;

  const readings = await withTimeout(h.readHealth());
  if (!Array.isArray(readings)) return null;
  return toIngestBatch(caps.platform, readings as NativeHealthReading[]);
}

/** Sends what the device store holds. Returns how many were accepted. */
export async function syncHealth(userId: string, age: number): Promise<number> {
  const batch = await readHealth();
  if (!batch || batch.samples.length === 0) return 0;

  const res = await fetch(`${apiBase()}/wearables/ingest`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, age, provider: batch.provider, samples: batch.samples }),
  });
  return res.ok ? batch.samples.length : 0;
}

/**
 * Free windows from the device calendar.
 *
 * The same `windowsFromBusy` the .ics import uses, so "free" means one
 * thing however the calendar arrived. `NativeCalendarEvent` has no field
 * for a title, a location or an attendee, so the shell has nowhere to put
 * one — the claim that calendar titles never leave the device is kept by
 * the shape of the contract rather than by trusting the shell.
 */
export async function calendarWindows(horizonDays = 14): Promise<FreeWindow[] | null> {
  const h = host();
  const caps = nativeCapabilities();
  if (!h?.readCalendar || !caps?.calendar) return null;

  const events = await withTimeout(h.readCalendar(horizonDays));
  if (!Array.isArray(events)) return null;

  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const busy = toBusyIntervals(events as NativeCalendarEvent[], utcOffsetMinutes);
  const nowLocalMinute = Math.floor(Date.now() / 60_000) + utcOffsetMinutes;
  const dayZero = Math.floor(nowLocalMinute / (24 * 60)) * (24 * 60);

  return windowsFromBusy(busy, {
    dayZero,
    horizonDays,
    dayStartMinute: 8 * 60,
    dayEndMinute: 18 * 60,
    minGapMinutes: 15,
    maxPerWeekday: 2,
  });
}

/**
 * Asks the OS for permission. Returns whether it was granted.
 *
 * Deliberately not wrapped in `withTimeout`, unlike every read above.
 *
 * A read that hangs is a broken shell and four seconds is generous. A
 * permission prompt that has not answered in four seconds is a person
 * reading it — the HealthKit sheet alone is four categories and a
 * paragraph each. Racing it would report a refusal that never happened,
 * and then the real grant would arrive with nothing waiting for it: the
 * member would tap Allow, watch the button say no, and reasonably conclude
 * the feature is broken.
 *
 * The cost of not timing out is a promise that never settles if the shell
 * loses the call. That is the better failure — a button that stays busy is
 * visibly wrong, where a false refusal looks like a considered answer.
 */
async function requestAccess(ask: (() => Promise<unknown>) | undefined): Promise<boolean> {
  if (!ask) return false;
  try {
    return (await ask()) === true;
  } catch {
    return false;
  }
}

export function requestHealthAccess(): Promise<boolean> {
  const h = host();
  return requestAccess(h?.requestHealthAccess?.bind(h));
}

export function requestMotionAccess(): Promise<boolean> {
  const h = host();
  return requestAccess(h?.requestMotionAccess?.bind(h));
}

/**
 * Read access to the device calendar, which had no path before this.
 *
 * `readCalendar` returns nothing without the grant, so
 * `capabilities.calendar` stayed false and the button offering it was
 * never rendered — the feature was built, shipped and unreachable.
 */
export function requestCalendarAccess(): Promise<boolean> {
  const h = host();
  return requestAccess(h?.requestCalendarAccess?.bind(h));
}

/**
 * Notifications for the installed app.
 *
 * Web Push cannot reach either shell. A Capacitor webview has no
 * `PushManager` — on iOS because Safari's push belongs to Home Screen web
 * apps, which this is not, and on Android because the System WebView has
 * none. So `account-panel.tsx` checked for it, found nothing, and told
 * members notifications were unsupported inside the app built to deliver
 * them.
 *
 * The shell registers with APNs or FCM and returns the token; this posts
 * it with the member's id and time zone, which the shell deliberately
 * does not know. Same offset reasoning as the browser path: the scheduler
 * runs in UTC and the device is the only thing that knows where it is.
 */
export async function enableNativePush(userId: string): Promise<boolean> {
  const h = host();
  if (!h?.requestPushToken) return false;

  let registration: { token?: unknown; transport?: unknown } | null = null;
  try {
    registration = (await h.requestPushToken()) as { token?: unknown; transport?: unknown } | null;
  } catch {
    return false;
  }

  const token = typeof registration?.token === 'string' ? registration.token : null;
  const transport = registration?.transport;
  if (!token || (transport !== 'apns' && transport !== 'fcm')) return false;

  const res = await fetch(`${apiBase()}/push/device`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      token,
      transport,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    }),
  });
  return res.ok;
}

export { NATIVE_BRIDGE_VERSION };
