'use client';

import { useEffect } from 'react';
import { initNative } from './native';

/**
 * Asks the shell what it can do, once the page has loaded inside it.
 *
 * This component is the thing that was missing, and its absence would
 * have shipped: `capacitor.config.ts` points `server.url` at the deployed
 * site, so none of the shell's own JavaScript ever runs, and
 * `installHost()` in the plugin package — written to publish
 * `window.JessMoveNative` — was never called and never could be. Every
 * native capability would have been dead in the installed app while
 * behaving exactly like a browser, which is the failure that looks like
 * no failure at all.
 *
 * Both platforms inject `window.Capacitor.Plugins.JessMoveNative` into
 * whatever page the webview loads, before the first line of site code
 * runs. So the plugin is there; something on the site simply has to ask
 * it. That is this.
 *
 * It renders nothing, it does nothing in a browser — `initNative()`
 * caches `null` and every caller behaves as it did before the app
 * existed — and it is mounted in the root layout so the answer is
 * available to any route.
 */
export function NativeBridge() {
  useEffect(() => {
    void initNative();

    /*
     * Permissions are changed in the system settings app, and the webview
     * is not reloaded on the way back. Without this a member who granted
     * HealthKit from Settings would return to an app still refusing to
     * read it.
     */
    const onVisible = () => {
      if (document.visibilityState === 'visible') void initNative();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
