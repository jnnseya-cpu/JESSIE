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

/* ------------------------------------------------------------------ *
 * How the shell is actually reached
 *
 * `capacitor.config.ts` sets `server.url` to the deployed site, so the
 * webview loads www.jessmove.com rather than a bundle inside the app.
 * That has a consequence that was very nearly shipped: none of the
 * shell's own JavaScript ever runs. `installHost()` in the plugin package
 * was written to publish `window.JessMoveNative`, and it could not,
 * because the bundle containing it is never loaded. Every capability
 * would have been dead in the installed app — health, calendar, motion
 * and push registration all returning exactly what a browser returns —
 * and nothing would have failed loudly.
 *
 * What *is* there is better. Both platforms inject a script at document
 * start into whatever page the webview loads: `JSExport.getPluginJS` on
 * Android and a `WKUserScript` on iOS. Both write
 * `window.Capacitor.Plugins.<jsName>` with a function per `@PluginMethod`
 * / `CAPPluginMethod`, plus `addListener`, and both set
 * `window.Capacitor.PluginHeaders`. So the plugin is already on the page
 * before the first line of site code runs.
 *
 * This file therefore reads that global directly. It is a global, not an
 * import: the web build still has no dependency on Capacitor, still
 * builds identically without the app existing, and a browser simply has
 * no `window.Capacitor`.
 * ------------------------------------------------------------------ */

type PluginMethod = (options?: unknown) => Promise<unknown>;

interface CapacitorGlobal {
  readonly Plugins?: Record<string, Record<string, PluginMethod> | undefined>;
  readonly isNativePlatform?: () => boolean;
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return c && typeof c === 'object' ? c : null;
}

/** The natively-injected plugin, if this page is inside the shell. */
function plugin(name: string): Record<string, PluginMethod> | null {
  const c = capacitor();
  if (!c?.isNativePlatform?.()) return null;
  const p = c.Plugins?.[name];
  return p && typeof p === 'object' ? p : null;
}

/**
 * Capabilities, resolved once and cached.
 *
 * `nativeCapabilities()` is read during render and has to answer
 * synchronously, but the plugin call is a promise across the bridge. So
 * `initNative()` resolves it at start-up and this holds the answer.
 *
 * `undefined` means "not asked yet" and `null` means "asked, and this is
 * not a shell" — a distinction worth keeping, because the first render
 * happens before the bridge has answered and must not cache a `null` that
 * came from being early rather than from being a browser.
 */
let cachedCapabilities: NativeCapabilities | null | undefined;

/**
 * Ask the shell what it can do, and remember.
 *
 * Called from `<NativeBridge />` on mount, again whenever the app returns
 * to the foreground, and after any permission prompt. The foreground case
 * is not decorative: permissions are changed in the system settings app
 * and the webview is not reloaded on the way back, so without it a member
 * who granted HealthKit from Settings would find the app still refusing.
 */
export async function initNative(): Promise<NativeCapabilities | null> {
  const p = plugin('JessMoveNative');
  if (!p?.capabilities) {
    cachedCapabilities = null;
    return null;
  }
  try {
    const announced = await withTimeout(p.capabilities());
    cachedCapabilities = usableCapabilities(announced as Partial<NativeCapabilities>);
  } catch {
    cachedCapabilities = null;
  }
  if (cachedCapabilities) wirePushTap();
  return cachedCapabilities;
}

/* ------------------------------------------------------------------ *
 * Push, in the installed app
 * ------------------------------------------------------------------ */

/** Matches `channel_id` in the server's `fcm.logic.ts`. */
const CHANNEL_ID = 'jessmove-snap';

let tapWired = false;

/**
 * Opening the right screen when a notification is tapped.
 *
 * Without this the notification opens the app wherever it was last, which
 * for a two-minute movement offered at eleven o'clock is the difference
 * between doing it and not. Wired once, at init, rather than when a token
 * is requested — a member who granted notifications last week never calls
 * that path again, and their taps still have to land somewhere.
 */
function wirePushTap(): void {
  if (tapWired) return;
  const push = plugin('PushNotifications');
  const addListener = push?.addListener as
    | ((event: string, cb: (data: unknown) => void) => unknown)
    | undefined;
  if (!addListener) return;
  tapWired = true;

  try {
    addListener('pushNotificationActionPerformed', (action) => {
      const url = (action as { notification?: { data?: { url?: unknown } } })?.notification?.data?.url;
      // Same-origin paths only. The payload crosses a vendor's
      // infrastructure, and a notification that can send the app to an
      // arbitrary URL is a redirect somebody else gets to choose.
      if (typeof url === 'string' && url.startsWith('/')) window.location.assign(url);
    });
  } catch {
    /* an older shell without the plugin installed */
  }
}

/**
 * Registers with APNs or FCM and returns the token.
 *
 * The token arrives on an event rather than from the call, so the
 * listeners are attached first and the promise settles when one fires.
 * A registration that never completes resolves null rather than hanging:
 * the member is then told notifications could not be turned on, which is
 * true, instead of watching a button spin forever.
 */
async function nativePushToken(): Promise<{ token: string; transport: 'apns' | 'fcm' } | null> {
  const push = plugin('PushNotifications');
  const platform = cachedCapabilities?.platform;
  if (!push || !platform) return null;

  const addListener = push.addListener as
    | ((event: string, cb: (data: unknown) => void) => unknown)
    | undefined;
  if (!addListener || !push.requestPermissions || !push.register) return null;

  try {
    const permission = (await push.requestPermissions()) as { receive?: string } | null;
    if (permission?.receive !== 'granted') return null;
  } catch {
    return null;
  }

  if (platform === 'android' && push.createChannel) {
    // Android 8+ drops a notification naming a channel the app never
    // created, and FCM's message names this one.
    await push
      .createChannel({
        id: CHANNEL_ID,
        name: 'Movement moments',
        description: 'A two-minute movement, offered inside a window you chose.',
        importance: 4,
        visibility: 1,
      })
      .catch(() => null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { token: string; transport: 'apns' | 'fcm' } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      addListener('registration', (token) => {
        const value = (token as { value?: unknown })?.value;
        if (typeof value === 'string' && value.length > 0) {
          finish({ token: value, transport: platform === 'ios' ? 'apns' : 'fcm' });
        } else {
          finish(null);
        }
      });
      addListener('registrationError', () => finish(null));
      void push.register!().catch(() => finish(null));
    } catch {
      finish(null);
    }

    setTimeout(() => finish(null), 15_000);
  });
}

/**
 * Everything the rest of this file talks to, in one shape.
 *
 * Two sources, deliberately. The Capacitor plugin is how the shipped app
 * works. `window.JessMoveNative` is kept because it is a plain object any
 * future host — an embedded bundle, a test harness — can publish without
 * knowing anything about Capacitor, and because it costs one line.
 */
function host(): NativeHost | null {
  if (typeof window === 'undefined') return null;

  const injected = (window as unknown as { JessMoveNative?: NativeHost }).JessMoveNative;
  if (injected && typeof injected === 'object') return injected;

  const p = plugin('JessMoveNative');
  if (!p) return null;

  const call = async (method: string, options?: unknown) => {
    const fn = p[method];
    if (!fn) return null;
    return fn(options);
  };

  return {
    capabilities: () => cachedCapabilities ?? null,
    readMotion: async () => ((await call('readMotion')) as { motion?: unknown } | null)?.motion ?? null,
    readHealth: async () =>
      ((await call('readHealth')) as { readings?: unknown } | null)?.readings ?? null,
    readCalendar: async (horizonDays: number) =>
      ((await call('readCalendar', { horizonDays })) as { events?: unknown } | null)?.events ?? null,
    requestHealthAccess: () => granting('requestHealthAccess'),
    requestMotionAccess: () => granting('requestMotionAccess'),
    requestCalendarAccess: () => granting('requestCalendarAccess'),
    requestPushToken: () => nativePushToken(),
  };

  /** A prompt, and a re-read of what the shell can do afterwards. */
  async function granting(method: string): Promise<boolean> {
    const fn = p![method];
    if (!fn) return false;
    let granted = false;
    try {
      granted = ((await fn()) as { granted?: boolean } | null)?.granted === true;
    } catch {
      granted = false;
    }
    // The grant is the event that changes what this device can do, so the
    // cache is refreshed before the caller acts on the answer.
    await initNative();
    return granted;
  }
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
