import type { HealthReport } from '@jessmove/shared';

/**
 * The platform's own health, read at render time.
 *
 * This page used to be a lie. Twelve services carried hardcoded `state`
 * values, each with a thirty-day history built from `up(30)` with a few
 * invented `degraded` days sprinkled in, under a heading that said "Live
 * availability for every part of the platform". Below it sat three
 * incident reports with specific dates, durations and detail — "Partner
 * has acknowledged; we will update daily" — describing events that never
 * happened.
 *
 * A status page is a trust instrument. It is the page somebody opens when
 * they are deciding whether to rely on this, and the one they open during
 * an outage. Fabricated uptime there is worse than no status page at all,
 * because a missing page tells you nothing and a false one tells you
 * something wrong with confidence.
 *
 * So the page now reports only what can be checked at the moment it is
 * asked: whether the API answers, and what it says about itself. There is
 * no history, because nothing has been recording one.
 */
export interface LiveStatus {
  /** Null when the API could not be reached at all. */
  readonly report: HealthReport | null;
  /** When this was read, so the page can say how fresh it is. */
  readonly checkedAt: string;
}

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production'
    ? 'https://api.jessmove.com/api'
    : 'http://localhost:4000/api';
}

/**
 * Never throws and never fails the page.
 *
 * An unreachable API returns null, which the page renders as "we cannot
 * reach it" — the honest answer, and a useful one. Falling back to a
 * cheerful default would reproduce exactly the problem this replaces.
 */
export async function readLiveStatus(): Promise<LiveStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(`${apiBase()}/health`, {
      // Never cached. A status page served from a cache is reporting the
      // past, and the moment that matters most is the one where the
      // cached answer is stale and green.
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { report: null, checkedAt };
    const json = (await res.json()) as { data?: HealthReport };
    return { report: json.data ?? null, checkedAt };
  } catch {
    return { report: null, checkedAt };
  }
}
