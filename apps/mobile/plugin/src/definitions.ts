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
