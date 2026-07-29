'use client';

import { useEffect, useState } from 'react';

/**
 * Service worker registration, the update prompt, and the install prompt.
 *
 * Three behaviours worth being deliberate about.
 *
 * **The update is offered, never forced.** A worker that calls
 * `skipWaiting` on its own reloads the page under whoever is using it. In a
 * movement app that means interrupting somebody mid-exercise, which is
 * exactly the kind of small rudeness that gets an app deleted. The new
 * version waits until it is accepted.
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
    const register = async (): Promise<void> => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // `controller` being set means this is an update rather than a
            // first install; a first install has nothing to interrupt.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      } catch {
        /* A failed registration is not an error the visitor needs to see. */
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }, []);

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
          <strong>A new version is ready.</strong> It will apply next time you open the app, or
          now if you prefer.
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
