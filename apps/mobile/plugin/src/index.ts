import { registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  NATIVE_BRIDGE_VERSION,
  usableCapabilities,
  type NativeCapabilities,
} from '@jessmove/shared';
import type { DeviceRegistration, JessMoveNativePlugin } from './definitions';

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
/**
 * The notification channel Android needs, matching `channel_id` in
 * `fcm.logic.ts`.
 *
 * Android 8 and later route every notification through a channel, and one
 * that names a channel the app never created is dropped without an error.
 * Creating it here rather than in the Kotlin keeps the id next to the
 * only other place it appears in this repository.
 */
const CHANNEL_ID = 'jessmove-snap';

/**
 * Push for the installed app, which Web Push cannot reach.
 *
 * A Capacitor webview has no `PushManager` — not on iOS, where Safari's
 * push is a Home Screen web app feature this shell is not, and not in
 * Android's System WebView, which has no push at all. So the shell
 * registers natively and hands the token to the web app, which is the
 * half that knows who is signed in.
 *
 * The token arrives on an event rather than from a call, so it is cached
 * and any caller waiting for it is resolved when it lands. A registration
 * that never completes resolves null rather than hanging: the member is
 * then told notifications could not be turned on, which is true, instead
 * of watching a button spin.
 */
class PushRegistration {
  private token: DeviceRegistration | null = null;
  private waiting: ((value: DeviceRegistration | null) => void)[] = [];
  private started = false;

  /** How long a registration gets before it is treated as failed. */
  private static readonly TIMEOUT_MS = 15_000;

  private settle(value: DeviceRegistration | null): void {
    if (value) this.token = value;
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve(value);
  }

  async listen(platform: 'ios' | 'android', navigate: (url: string) => void): Promise<void> {
    await PushNotifications.addListener('registration', (token) => {
      this.settle({ token: token.value, transport: platform === 'ios' ? 'apns' : 'fcm' });
    });

    await PushNotifications.addListener('registrationError', () => {
      this.settle(null);
    });

    /*
     * The tap. Without this the notification opens the app on whatever
     * screen it was last on, which for a two-minute movement offered at
     * eleven o'clock is the difference between doing it and not.
     */
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification.data?.url;
      if (typeof url === 'string' && url.length > 0) navigate(url);
    });

    if (platform === 'android') {
      await PushNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Movement moments',
        description: 'A two-minute movement, offered inside a window you chose.',
        importance: 4,
        visibility: 1,
      }).catch(() => {
        /* createChannel does not exist on iOS and fails harmlessly here */
      });
    }
  }

  async request(): Promise<DeviceRegistration | null> {
    if (this.token) return this.token;

    const permission = await PushNotifications.requestPermissions().catch(() => null);
    if (permission?.receive !== 'granted') return null;

    return new Promise<DeviceRegistration | null>((resolve) => {
      this.waiting.push(resolve);
      if (!this.started) {
        this.started = true;
        void PushNotifications.register().catch(() => this.settle(null));
      }
      setTimeout(() => {
        // Resolving null rather than leaving it pending: the caller shows
        // a member-facing message, and a promise that never settles shows
        // nothing at all.
        if (!this.token) this.settle(null);
      }, PushRegistration.TIMEOUT_MS);
    });
  }
}

export async function installHost(): Promise<void> {
  let capabilities: NativeCapabilities | null = null;

  // Returns what it stored as well as storing it: the closure assignment
  // is invisible to control-flow analysis, so a later `if (capabilities)`
  // would narrow to `never` against the initial null.
  const refresh = async (): Promise<NativeCapabilities | null> => {
    try {
      capabilities = usableCapabilities(await JessMoveNative.capabilities());
    } catch {
      capabilities = null;
    }
    return capabilities;
  };

  const announced = await refresh();

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

  const push = new PushRegistration();
  if (announced) {
    // Listeners are attached before anything can request a token, so a
    // registration that resolves quickly is not missed. Only inside a
    // real shell: in a browser `capabilities` is null and none of this
    // plugin is loaded at all.
    await push.listen(announced.platform, (url) => {
      window.location.assign(url);
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
    /*
     * The shell gets the token; the web app knows who is signed in and
     * posts it. Splitting it that way keeps the shell with no idea who
     * the member is, which is the same division everything else here
     * uses — it reads the device, the product decides what that means.
     */
    requestPushToken: () => push.request(),
  };
}

export { NATIVE_BRIDGE_VERSION };
