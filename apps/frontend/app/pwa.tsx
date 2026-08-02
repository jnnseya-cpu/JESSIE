'use client';

import { useEffect, useState } from 'react';

/**
 * Service worker registration, the update prompt, and the install prompt.
 *
 * Three behaviours worth being deliberate about.
 *
 * **The update is offered, never forced — but it is never left to rot.** A
 * worker that calls `skipWaiting` on its own reloads the page under whoever
 * is using it, which in a movement app means interrupting somebody
 * mid-exercise. So the new version waits. It is applied when the app is put
 * down: on the way to the background there is nothing to interrupt, and the
 * person comes back to current code rather than to a build from weeks ago.
 * An installed app that is never told to check would otherwise run the same
 * JavaScript indefinitely, which reads as features vanishing.
 *
 * **The install prompt is deferred, not fired on load.** A browser
 * install banner shown two seconds after arrival is dismissed by almost
 * everybody, and a dismissal is remembered. This holds the event and offers
 * it once the visitor has actually looked at something.
 *
 * **Nothing here fails loudly.** A browser without service workers, or a
 * user who has disabled them, gets the ordinary site. None of this is
 * load-bearing.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Registering after load keeps the worker off the critical path — it
    // must never compete with the first render for bandwidth.
    let registration: ServiceWorkerRegistration | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const register = async (): Promise<void> => {
      try {
        // updateViaCache: 'none' keeps the worker script itself out of the
        // HTTP cache. Without it the browser can revalidate against a
        // months-old copy and conclude, wrongly, that nothing has changed.
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });

        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` being set means this is an update rather than a
            // first install; a first install has nothing to interrupt.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });

        // Registration alone does not ask whether there is a new version.
        // An installed app is opened from the home screen and may not make
        // a single navigation for weeks, so the check has to be explicit:
        // now, hourly while open, and every time it comes back to the front.
        void registration.update();
        timer = setInterval(() => void registration?.update(), 60 * 60 * 1000);
      } catch {
        /* A failed registration is not an error the visitor needs to see. */
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void registration?.update();
    };
    document.addEventListener('visibilitychange', onVisible);

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, []);

  /**
   * Apply a waiting update the moment the app goes to the background. The
   * reload happens against a page nobody is looking at, so the choice
   * between "interrupt them" and "leave them on old code" does not have to
   * be made at all.
   */
  useEffect(() => {
    if (!waiting) return;
    const onHidden = (): void => {
      if (document.visibilityState !== 'hidden') return;
      waiting.postMessage('skip-waiting');
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => window.location.reload(),
        { once: true },
      );
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [waiting]);

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const applyUpdate = (): void => {
    waiting?.postMessage('skip-waiting');
    // The new worker takes control, then the page reloads once.
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    setWaiting(null);
  };

  const install = async (): Promise<void> => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (dismissed) return null;

  if (waiting) {
    return (
      <div className="pwa" role="status">
        <p>
          <strong>A new version is ready.</strong> It applies the moment you put the app down,
          or now if you prefer.
        </p>
        <div className="pwa__row">
          <button type="button" className="btn btn--primary" onClick={applyUpdate}>
            Update now
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setDismissed(true)}>
            Later
          </button>
        </div>
      </div>
    );
  }

  if (installEvent) {
    return (
      <div className="pwa" role="status">
        <p>
          <strong>Add Jess Move to your home screen.</strong> It opens like an app and the
          pages you have read stay available without a signal.
        </p>
        <div className="pwa__row">
          <button type="button" className="btn btn--primary" onClick={() => void install()}>
            Add to home screen
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setDismissed(true)}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
