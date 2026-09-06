import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell.
 *
 * Capacitor, not React Native, and the reason is the one this repository
 * keeps coming back to: do not rebuild what already works. The web app is
 * thirty routes and a 7,500-line design system that has just been through
 * a typography, contrast and layout pass. Reimplementing it in React
 * Native would create a second product to keep correct, and the second
 * one would be wrong first.
 *
 * What the shell is actually for is the four things a browser cannot do,
 * every one of which the platform already has server-side support for and
 * no client:
 *
 *   - **Apple Health and Health Connect.** `/wearables` declares both
 *     `transport: 'on_device'` and `POST /wearables/ingest` has a scope
 *     judge and an age gate behind it. Nothing has ever been able to read
 *     those stores.
 *   - **The device calendar.** The .ics import is an honest substitute;
 *     this is the real thing, through the same derivation.
 *   - **Continuous motion.** `ContextSignals.motionState` is the field
 *     the safety layer uses to withhold a prompt from somebody driving.
 *     The web build reports `unknown`, correctly, and always will.
 *   - **Notifications that arrive without the member having added a web
 *     page to their home screen first.**
 *
 * ## `server.url`, and why
 *
 * The web app is server-rendered, so there is no static bundle to embed
 * without changing how the whole site builds. The shell points at the
 * deployed site and adds native capability on top of it, which also means
 * a copy change never needs an app-store review.
 *
 * The App Store's minimum-functionality rule (4.2) rejects apps that are
 * only a wrapper around a website. This one is not: it reads HealthKit,
 * the calendar and motion, and registers for push. That distinction has
 * to be made in the review notes as well as in the code, and it is the
 * single most likely reason a first submission is rejected. See README.
 */
const config: CapacitorConfig = {
  appId: 'com.jessmove.app',
  appName: 'Jess Move',
  webDir: 'public',
  ios: {
    /* The status bar sits under the notch; the web app already sets
       viewport-fit=cover and the safe-area insets to match. */
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    /* https rather than the default capacitor:// so that cookies, the
       service worker and the existing CORS allowlist all behave exactly
       as they do in a browser. A different scheme would make the shell a
       third origin nobody has configured. */
    allowMixedContent: false,
  },
  server: {
    url: 'https://www.jessmove.com',
    androidScheme: 'https',
    /* Stripe Checkout and the billing portal open in the system browser
       rather than the webview; anything else stays inside. Card details
       must never be entered in a webview an app controls. */
    allowNavigation: ['www.jessmove.com', 'jessmove.com', 'api.jessmove.com'],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
