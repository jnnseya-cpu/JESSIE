import { WebPlugin } from '@capacitor/core';
import { NATIVE_BRIDGE_VERSION } from '@jessmove/shared';
import type { JessMoveNativePlugin } from './definitions';

/**
 * The web implementation, which is the honest one: it can do none of
 * this.
 *
 * Capacitor requires a web fallback so the same bundle loads in a
 * browser. Rather than throw — which would make every caller wrap this in
 * a try/catch and eventually one of them would forget — it announces no
 * capabilities and returns empty. `app/native.ts` then behaves exactly as
 * it did before the shell existed: `unknown` motion, no health, and
 * whatever calendar the member imported by hand.
 *
 * `platform: 'ios'` is a placeholder that never reaches anything: with
 * every capability false, no caller has a reason to read it, and
 * `usableCapabilities` still requires the version to match before any of
 * it is believed.
 */
export class JessMoveNativeWeb extends WebPlugin implements JessMoveNativePlugin {
  async capabilities() {
    return {
      bridgeVersion: NATIVE_BRIDGE_VERSION,
      platform: 'ios' as const,
      health: false,
      calendar: false,
      motion: false,
    };
  }

  async requestHealthAccess() {
    return { granted: false };
  }

  async requestMotionAccess() {
    return { granted: false };
  }

  async readHealth() {
    return { readings: [] };
  }

  async readMotion() {
    return { motion: null };
  }

  async readCalendar() {
    return { events: [] };
  }
}
