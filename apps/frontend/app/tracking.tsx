'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CONSENT_COPY,
  TRACKING_EVENTS,
  mayTrack,
  scrubPayload,
  type TrackingEvent,
} from '@jessmove/shared';

/**
 * Meta Pixel and Google Tag, loaded only when somebody has said yes.
 *
 * The ordering is the whole design. Both vendors are contacted by fetching
 * a script from their domain, and that request carries the visitor's address
 * and the page they are on — so a tag that loads on arrival and waits for
 * consent before *firing* has already told them everything the first event
 * would have. Nothing here is fetched until an explicit accept, which means
 * a visitor who declines has never touched either company.
 *
 * Everything else is enforced in `@jessmove/shared`: which paths may carry a
 * tag at all, that an account or health surface never may, that under-18s
 * are never profiled, and which payload keys can never leave. This file is
 * the plumbing; the rules are shared so the server, the tests and this
 * component cannot hold different opinions about them.
 *
 * IDs come from `NEXT_PUBLIC_META_PIXEL_ID` and `NEXT_PUBLIC_GOOGLE_TAG_ID`.
 * They are public by nature — they appear in the page source of every site
 * that uses them — so they belong in configuration, not in the secret store,
 * and their absence simply means that network is off.
 */

const STORAGE_KEY = 'jm_measure_consent';

type Consent = 'accepted' | 'declined' | 'unset';

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[] };
    _fbq?: unknown;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const metaId = () => (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();
const googleId = () => (process.env.NEXT_PUBLIC_GOOGLE_TAG_ID ?? '').trim();

/** Either network configured. With neither, the banner never appears. */
export function measurementConfigured(): boolean {
  return metaId().length > 0 || googleId().length > 0;
}

function readConsent(): Consent {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'declined' ? v : 'unset';
  } catch {
    // A browser refusing storage is a browser telling you something.
    return 'declined';
  }
}

/**
 * Do Not Track and Global Privacy Control.
 *
 * Read once and treated as a standing instruction, above the banner. A
 * person who set GPC and then clicked accept out of habit is still refused,
 * because honouring a signal only when it agrees with you is not honouring it.
 */
function browserOptOut(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/* ------------------------------------------------------------------ *
 * Loaders — each runs at most once, and only after consent
 * ------------------------------------------------------------------ */

let metaLoaded = false;
let googleLoaded = false;

function loadMeta(id: string): void {
  if (metaLoaded || !id || typeof window === 'undefined') return;
  metaLoaded = true;

  /* eslint-disable */
  const f = window as unknown as Record<string, unknown>;
  const n = ((...args: unknown[]) => {
    const fn = window.fbq as { callMethod?: (...a: unknown[]) => void; queue?: unknown[] };
    fn.callMethod ? fn.callMethod(...args) : fn.queue?.push(args);
  }) as Window['fbq'];
  (n as unknown as { push: unknown }).push = n;
  (n as unknown as { loaded: boolean }).loaded = true;
  (n as unknown as { version: string }).version = '2.0';
  (n as unknown as { queue: unknown[] }).queue = [];
  window.fbq = n;
  if (!f._fbq) f._fbq = n;

  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);

  // `PageView` is sent by init on Meta's side; sending it again here would
  // double-count every landing.
  window.fbq?.('init', id);
  window.fbq?.('track', 'PageView');
}

function loadGoogle(id: string): void {
  if (googleLoaded || !id || typeof window === 'undefined') return;
  googleLoaded = true;

  window.dataLayer = window.dataLayer || [];
  const gtag: Window['gtag'] = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag = gtag;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  gtag('js', new Date());
  /*
   * Consent Mode, set to granted because this only runs after an explicit
   * accept — and set explicitly rather than left to default, so the tag
   * cannot fall back to a regional default that disagrees with the banner
   * the visitor actually saw.
   *
   * `anonymize_ip` and the two personalisation refusals are what keep this
   * a measurement tag rather than an advertising one: no ad profile is built
   * from a health platform's traffic.
   */
  gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted' });
  gtag('config', id, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

/* ------------------------------------------------------------------ *
 * The public surface
 * ------------------------------------------------------------------ */

/**
 * Send one event to whichever networks are configured.
 *
 * Safe to call from anywhere: it re-checks eligibility every time rather
 * than trusting that whoever mounted the gate got it right, so a call from a
 * page that should not be tracked does nothing rather than leaking.
 */
export function trackEvent(event: TrackingEvent, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  const verdict = mayTrack({
    consented: readConsent() === 'accepted',
    path: window.location.pathname,
    age: null,
    browserOptOut: browserOptOut(),
  });
  if (!verdict.may) return;

  const names = TRACKING_EVENTS[event];
  const clean = scrubPayload(payload);

  try {
    window.fbq?.('track', names.meta, clean);
  } catch {
    /* a measurement that breaks the page it measures is not worth having */
  }
  try {
    window.gtag?.('event', names.google, clean);
  } catch {
    /* same */
  }
}

/**
 * The gate. Mounted once, in the root layout.
 *
 * Renders the banner when a decision has not been made, loads the scripts
 * when it has been made in the affirmative, and does nothing at all on a
 * surface where tracking is not permitted — which is why the account never
 * shows a cookie banner it has no reason to show.
 */
export function Measurement() {
  const [consent, setConsent] = useState<Consent>('unset');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setReady(true);
  }, []);

  const eligibleHere = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    // Age is unknown to this component by design: it never reads the session.
    // The account is not a trackable surface, so a signed-in member on a
    // health screen is excluded by path before age is ever relevant.
    return mayTrack({
      consented: true,
      path: window.location.pathname,
      age: null,
      browserOptOut: browserOptOut(),
    }).may;
  }, []);

  useEffect(() => {
    if (!ready || consent !== 'accepted') return;
    if (!eligibleHere()) return;
    loadMeta(metaId());
    loadGoogle(googleId());
  }, [ready, consent, eligibleHere]);

  const decide = (choice: Consent) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* the decision still applies for this page view */
    }
    setConsent(choice);
  };

  if (!ready) return null;
  if (!measurementConfigured()) return null;
  if (consent !== 'unset') return null;
  if (!eligibleHere()) return null;
  if (browserOptOut()) return null;

  return (
    <aside className="mcb" role="dialog" aria-label="Measurement choice">
      <div className="mcb__inner">
        <div>
          <strong>{CONSENT_COPY.title}</strong>
          <p>{CONSENT_COPY.body}</p>
          <p className="mcb__detail">{CONSENT_COPY.detail}</p>
        </div>
        <div className="mcb__actions">
          <button type="button" className="btn btn--ghost" onClick={() => decide('declined')}>
            {CONSENT_COPY.decline}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => decide('accepted')}>
            {CONSENT_COPY.accept}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Lets somebody change their mind later, from the cookie policy. */
export function forgetMeasurementChoice(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}
