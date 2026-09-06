import { registerPlugin } from '@capacitor/core';
import {
  NATIVE_BRIDGE_VERSION,
  usableCapabilities,
  type NativeCapabilities,
} from '@jessmove/shared';
import type { JessMoveNativePlugin } from './definitions';

export * from './definitions';

const JessMoveNative = registerPlugin<JessMoveNativePlugin>('JessMoveNative', {
  web: () => import('./web').then((m) => new m.JessMoveNativeWeb()),
});

export { JessMoveNative };

/**
 * Publishes the host object the web app looks for.
 *
 * `app/native.ts` reads `window.JessMoveNative` and validates whatever it
 * finds. It deliberately knows nothing about Capacitor: the web build
 * must not depend on a native SDK to compile, or the site stops building
 * the moment the shell's dependencies drift. So the shell adapts itself
 * to the shape the web app already expects, rather than the other way
 * round.
 *
 * `capabilities()` is synchronous on the host because the web app reads
 * it during render, so the answer has to be cached rather than awaited.
 * The cache is refreshed rather than frozen, and that is not a detail:
 * with it resolved once at start-up, a member who granted HealthKit
 * access got `granted: true` back from the prompt and then found
 * `readHealth` still refusing, because `app/native.ts` gates every read on
 * the cached `capabilities.health` and that was still the `false` read
 * before the sheet appeared. The grant worked and nothing used it until
 * the next cold start.
 *
 * Two things refresh it:
 *
 *   - any permission request, after it resolves — the grant is the event;
 *   - returning to the foreground, because permissions can be changed in
 *     the system settings app and the webview is not reloaded on the way
 *     back. `visibilitychange` rather than `@capacitor/app` because the
 *     document event already fires in both webviews and a dependency the
 *     existing stack covers is a dependency not worth adding.
 */
export async function installHost(): Promise<void> {
  let capabilities: NativeCapabilities | null = null;

  const refresh = async (): Promise<void> => {
    try {
      capabilities = usableCapabilities(await JessMoveNative.capabilities());
    } catch {
      capabilities = null;
    }
  };

  await refresh();

  /** Runs a permission prompt, then re-reads what the shell can now do. */
  const request = async (ask: () => Promise<{ granted: boolean }>): Promise<boolean> => {
    let granted = false;
    try {
      granted = (await ask()).granted;
    } catch {
      granted = false;
    }
    await refresh();
    return granted;
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refresh();
    });
  }

  (window as unknown as { JessMoveNative?: unknown }).JessMoveNative = {
    capabilities: () => capabilities,
    readMotion: async () => (await JessMoveNative.readMotion()).motion,
    readHealth: async () => (await JessMoveNative.readHealth()).readings,
    readCalendar: async (horizonDays: number) =>
      (await JessMoveNative.readCalendar({ horizonDays })).events,
    requestHealthAccess: () => request(() => JessMoveNative.requestHealthAccess()),
    requestMotionAccess: () => request(() => JessMoveNative.requestMotionAccess()),
    requestCalendarAccess: () => request(() => JessMoveNative.requestCalendarAccess()),
  };
}

export { NATIVE_BRIDGE_VERSION };
