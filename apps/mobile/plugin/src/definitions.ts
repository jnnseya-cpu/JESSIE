import type {
  NativeCalendarEvent,
  NativeCapabilities,
  NativeHealthReading,
  NativeMotion,
} from '@jessmove/shared';

/**
 * The plugin's surface, in one place, in the shared vocabulary.
 *
 * Every type here comes from `@jessmove/shared/native`, which is where
 * the rules that make a reading usable live and where they are tested.
 * The Swift and the Kotlin answer in these shapes; the web build's
 * `app/native.ts` validates whatever arrives through the same functions.
 * Nothing in the middle is allowed its own idea of what a health sample
 * or a motion state is.
 *
 * ## There is no JavaScript implementation beside this file, deliberately
 *
 * There was one — a `registerPlugin` call and an `installHost()` that
 * published `window.JessMoveNative` — and it could never have run.
 * `capacitor.config.ts` sets `server.url` to the deployed site, so the
 * webview loads www.jessmove.com and no bundle from this package is ever
 * fetched. Every native capability would have been dead in the installed
 * app while behaving exactly like a browser.
 *
 * Nothing needs to replace it. `JSExport.getPluginJS` on Android and a
 * `WKUserScript` on iOS inject `window.Capacitor.Plugins.JessMoveNative`
 * into whatever page the webview loads, with one function per method
 * below, before the site's first line runs. `apps/frontend/app/native.ts`
 * reads that global — a global, not an import, so the web build still has
 * no dependency on Capacitor.
 *
 * This file therefore describes a contract rather than implementing one,
 * and `native-bridge.test.ts` reads it to check the Swift and Kotlin
 * method lists still match.
 *
 * Note the absence in `NativeCalendarEvent`: there is no title, no
 * location, no attendee and no organiser, so neither platform
 * implementation has anywhere to put one. The claim that calendar titles
 * never leave the device is kept by this interface rather than by trust.
 */
export interface JessMoveNativePlugin {
  /** What this build can do. Called synchronously on the injected host. */
  capabilities(): Promise<NativeCapabilities>;

  /** Prompts for HealthKit / Health Connect read access. */
  requestHealthAccess(): Promise<{ granted: boolean }>;

  /** Prompts for motion-activity permission. */
  requestMotionAccess(): Promise<{ granted: boolean }>;

  /**
   * Prompts for read access to the device calendar.
   *
   * Without this there was no path to the grant at all: `readCalendar`
   * returns an empty list when it is missing, so `capabilities.calendar`
   * stayed false, the button that reads the device calendar was never
   * rendered, and the feature was unreachable on both platforms.
   */
  requestCalendarAccess(): Promise<{ granted: boolean }>;

  /**
   * Recent samples for the scopes this platform collects. The shell reads
   * only the six in `DATA_SCOPES`; anything else the store holds is never
   * requested, so a permission dialogue never asks for it.
   */
  readHealth(): Promise<{ readings: NativeHealthReading[] }>;

  /** The most recent activity classification, or null. */
  readMotion(): Promise<{ motion: NativeMotion | null }>;

  /** Events in the next `horizonDays`, times only. */
  readCalendar(options: { horizonDays: number }): Promise<{ events: NativeCalendarEvent[] }>;
}

/**
 * A device registration for APNs or FCM.
 *
 * `transport` rather than `platform` because it is the transport the
 * server has to speak, and the two are not always the same thing — an
 * Android build could in principle register with a different service, and
 * the server's job is to know which door to knock on, not which handset
 * is behind it.
 */
export interface DeviceRegistration {
  readonly token: string;
  readonly transport: 'apns' | 'fcm';
}
