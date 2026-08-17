'use client';

import { useEffect } from 'react';

/**
 * The launch screen inside the document.
 *
 * The operating system's splash — Chrome's, composed from the manifest, and
 * iOS's, from the startup images — covers the time before the browser has
 * anything to show. It stops the moment the page starts painting, and on a
 * cold start that is *earlier* than the app is usable: the shell paints,
 * then the session is fetched, then the account renders. Between those two
 * points an installed app shows an empty layout, which reads as a broken
 * app rather than a loading one.
 *
 * This closes that gap on every platform that can install the product,
 * which is the part neither manifest nor startup images can do.
 *
 * Three decisions that matter more than the markup.
 *
 * **It never appears in a browser tab.** Every visible rule is inside
 * `@media (display-mode: standalone)`. A splash on an ordinary web visit
 * would put a full-screen cover in front of the marketing pages and the
 * blog — the pages whose entire job is that a stranger arrives, reads and
 * registers — and it would do it to a search crawler too. An installed app
 * is a different context: the person chose it, it is expected to behave
 * like an app, and there is no first impression left to spend.
 *
 * **It clears itself without JavaScript.** The CSS carries a timed fade as
 * well as the ready state, so a bundle that fails to load leaves somebody
 * with the site rather than with a permanent teal rectangle. A splash that
 * depends on the app working in order to reveal the app is a splash that
 * hides every failure it should be surfacing.
 *
 * **It is invisible to assistive technology.** `aria-hidden`, and nothing
 * inside it is focusable. A screen reader announcing a decorative brand
 * panel before the content is noise, and one that could tab into a hidden
 * layer afterwards is a trap.
 */

/**
 * The panel. Server-rendered, so it is in the first byte of HTML and paints
 * with the first frame rather than after hydration — which is the whole
 * point, and the reason this is markup in the layout and not a component
 * that mounts.
 */
export function LaunchSplash() {
  return (
    <div className="splash" aria-hidden="true" data-splash>
      <div className="splash__inner">
        <svg className="splash__mark" viewBox="0 0 40 40" width="96" height="96" focusable="false">
          <defs>
            <linearGradient id="splashRamp" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#00A99D" />
              <stop offset="100%" stopColor="#B7E436" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="11" fill="#0B2136" />
          <path
            d="M31.5 12.2A13 13 0 1 1 20 7"
            fill="none"
            stroke="#3487F7"
            strokeOpacity="0.5"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M13.6 15.4v6.9a2.6 2.6 0 0 1-5.2 0"
            fill="none"
            stroke="#F4FAF9"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17.4 26.4v-11l4.3 5.2 4.3-5.2v11"
            fill="none"
            stroke="#F4FAF9"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M26 26.4l3.2-5.4 2.9-5"
            fill="none"
            stroke="url(#splashRamp)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="32.1" cy="16" r="2.4" fill="#B7E436" />
        </svg>

        <p className="splash__name">JESS MOVE</p>
        <p className="splash__line">Small Moves. Powerful Change.</p>
      </div>
    </div>
  );
}

/**
 * Marks the document ready, which is what the CSS fades on.
 *
 * A flag on `<html>` rather than state passed down a tree: the splash is a
 * sibling of the whole application, so the only thing both it and the app
 * can see is the document. It is also what lets the panel stay a server
 * component — nothing needs to re-render for it to disappear.
 *
 * `requestAnimationFrame` rather than clearing straight away in the effect.
 * Hydration finishing means React is attached, not that the first real
 * frame has been painted; removing the cover in the same tick can show one
 * frame of unstyled or empty layout, which is the flicker this exists to
 * prevent and is more noticeable than the extra sixteen milliseconds.
 */
export function AppReady() {
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.documentElement.setAttribute('data-app-ready', '');
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
