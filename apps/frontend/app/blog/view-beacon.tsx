'use client';

import { useEffect, useRef } from 'react';

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
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

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
    if (!API_BASE) return; // No API configured — the page still works.

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

      const url = `${API_BASE.replace(/\/$/, '')}/blog/views`;

      // sendBeacon survives the page being closed; fetch does not.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        void fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {
          /* analytics must never break the page */
        });
      }
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
