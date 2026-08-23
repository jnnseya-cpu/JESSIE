'use client';

import { useEffect, useRef } from 'react';
import { apiBase } from '../api-base';

/**
 * View tracking.
 *
 * What this sends: the slug, how long the tab was actually visible, how far
 * down the page the reader got, the referrer *host* and a coarse device
 * class. That is the whole payload.
 *
 * What it does not send, and has no code to obtain: any identifier, any
 * cookie, the full referring URL, or anything about the reader. The server
 * hashes the connecting address with a salt it regenerates daily and keeps
 * only the digest, so a unique-visitor count holds within a day and
 * deliberately stops holding across days.
 *
 * Dwell is counted only while the tab is visible. A page left open in a
 * background tab over lunch is not a two-hour read, and counting it as one
 * makes the metric useless in exactly the direction that flatters us.
 *
 * **Why the address comes from `apiBase()`.** This component used to read
 * `NEXT_PUBLIC_API_BASE_URL` itself and return early when it was unset — so
 * on any deployment without that build-time variable it disabled itself in
 * silence while every other part of the site carried on working, because
 * everything else resolves the API at runtime and falls back to
 * api.jessmove.com. The result was a blog that served articles and recorded
 * no views, with nothing in a log to say so. `api-base.ts` exists precisely
 * because three components once defaulted to localhost in production; this
 * was the fourth, and it had never been migrated.
 */

function deviceClass(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function referrerHost(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    const url = new URL(document.referrer);
    // Same-site navigation is not a referrer worth recording.
    if (url.host === window.location.host) return null;
    return url.host;
  } catch {
    return null;
  }
}

export function ViewBeacon({ slug }: { slug: string }) {
  const visibleMs = useRef(0);
  const since = useRef<number | null>(null);
  const maxScroll = useRef(0);
  const sent = useRef(false);

  useEffect(() => {
    since.current = document.visibilityState === 'visible' ? performance.now() : null;

    const accrue = (): void => {
      if (since.current !== null) {
        visibleMs.current += performance.now() - since.current;
        since.current = null;
      }
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        since.current = performance.now();
      } else {
        accrue();
        send();
      }
    };

    const onScroll = (): void => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const percent =
        scrollable <= 0 ? 100 : Math.round(((window.scrollY + 0) / scrollable) * 100);
      maxScroll.current = Math.min(100, Math.max(maxScroll.current, percent));
    };

    const send = (): void => {
      accrue();
      const dwellSeconds = Math.min(3600, Math.round(visibleMs.current / 1000));
      // Under two seconds is a bounce or a prefetch, not a view.
      if (dwellSeconds < 2) return;

      const body = JSON.stringify({
        slug,
        dwellSeconds,
        scrollPercent: maxScroll.current,
        referrerHost: referrerHost(),
        device: deviceClass(),
      });

      const url = `${apiBase()}/blog/views`;

      /*
       * `fetch` with `keepalive`, not `sendBeacon`.
       *
       * sendBeacon looked like the right tool and silently was not. Sending
       * a Blob typed `application/json` cross-origin makes the request
       * preflighted, and sendBeacon cannot perform a preflight — so the
       * browser drops it. The call still returns `true`, because that only
       * means the payload was queued locally, so there was nothing to see:
       * no console error, no failed request, no log line. The site and the
       * API are on different hosts in every environment — localhost:3000 to
       * localhost:4000 here, www to api in production — so this never
       * worked anywhere, and the view count that "wasn't working" was
       * really a beacon that never arrived.
       *
       * `keepalive` gives the same survives-the-page-closing property and
       * goes through CORS properly.
       */
      void fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
        // No cookies: this is a count, not a session, and the server
        // identifies nobody.
        credentials: 'omit',
      }).catch(() => {
        /* analytics must never break the page */
      });
      sent.current = true;
      // Reset so a later send reports only the additional time.
      visibleMs.current = 0;
      if (document.visibilityState === 'visible') since.current = performance.now();
    };

    onScroll();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', send);

    // A mid-read ping, so a reader who never closes the tab still counts.
    const timer = window.setTimeout(send, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', send);
      window.clearTimeout(timer);
      if (!sent.current) send();
    };
  }, [slug]);

  return null;
}
