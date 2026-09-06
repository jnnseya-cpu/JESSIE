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
 * it during render. It is resolved once here, at start-up, and cached —
 * a capability set that changes mid-session is a permission change, and
 * a permission change reloads the webview anyway.
 */
export async function installHost(): Promise<void> {
  let capabilities: NativeCapabilities | null = null;
  try {
    capabilities = usableCapabilities(await JessMoveNative.capabilities());
  } catch {
    capabilities = null;
  }

  (window as unknown as { JessMoveNative?: unknown }).JessMoveNative = {
    capabilities: () => capabilities,
    readMotion: async () => (await JessMoveNative.readMotion()).motion,
    readHealth: async () => (await JessMoveNative.readHealth()).readings,
    readCalendar: async (horizonDays: number) =>
      (await JessMoveNative.readCalendar({ horizonDays })).events,
    requestHealthAccess: async () => (await JessMoveNative.requestHealthAccess()).granted,
    requestMotionAccess: async () => (await JessMoveNative.requestMotionAccess()).granted,
  };
}

export { NATIVE_BRIDGE_VERSION };
