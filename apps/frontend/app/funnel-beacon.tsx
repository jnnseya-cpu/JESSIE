'use client';

import { useEffect } from 'react';
import { apiBase } from './api-base';
import { trackEvent } from './tracking';

/**
 * Four points on the way to an account, and nothing else.
 *
 * What it sends: which of four steps, the path without its query string, a
 * coarse device class, and the referring host. That is the whole payload.
 *
 * What it does not send, and has no code to obtain: any identifier, any
 * cookie, the full referring URL, or anything about the person. The server
 * hashes the connecting address with a salt it rotates daily, so a visit
 * correlates within a day and deliberately stops across days.
 *
 * It fires once per mount and never blocks the page: `keepalive` so a
 * click away still delivers it, and every failure swallowed, because a
 * measurement that can break the page it measures is not worth having.
 *
 * `registered` is not here. It is recorded on the server where an account
 * actually comes into existence — the one number that means anything is
 * the one number a browser is never asked to report.
 */

export type BeaconStep = 'landed' | 'viewed_ask' | 'opened' | 'started';

function deviceClass(): string {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/**
 * The same four steps, told to the advertising networks.
 *
 * Only the two that mean something commercially: arriving, and opening the
 * form. `trackEvent` re-checks consent, surface and browser opt-out on every
 * call, so a beacon on a page that may not carry a tag sends nothing — which
 * is why this mapping can live next to the first-party beacon without
 * widening what either of them reaches.
 */
const PIXEL_STEP: Partial<Record<BeaconStep, 'page_view' | 'begin_signup'>> = {
  landed: 'page_view',
  started: 'begin_signup',
};

export function FunnelBeacon({ step }: { step: BeaconStep }) {
  useEffect(() => {
    const pixel = PIXEL_STEP[step];
    if (pixel) trackEvent(pixel, { source: 'funnel' });
  }, [step]);

  useEffect(() => {
    // Referring *host* only. The full URL is somebody's browsing history.
    let referrer: string | undefined;
    try {
      referrer = document.referrer && new URL(document.referrer).origin !== window.location.origin
        ? document.referrer
        : undefined;
    } catch {
      referrer = undefined;
    }

    try {
      void fetch(`${apiBase()}/funnel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          step,
          path: window.location.pathname,
          referrer,
          device: deviceClass(),
        }),
      }).catch(() => undefined);
    } catch {
      /* a page that cannot be measured is still a page that works */
    }
  }, [step]);

  return null;
}
