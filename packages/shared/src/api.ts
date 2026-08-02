/**
 * Transport-level contracts shared by the API and its consumers.
 */

export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiMeta {
  requestId: string;
  timestamp: string;
  /** The signature line, present on every response. See design.ts. */
  poweredBy: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level detail for validation failures. */
    details?: Record<string, string[]>;
    requestId: string;
  };
}

/** k-anonymity floor for every cohort query. §16.3. */
export const K_ANONYMITY_THRESHOLD = 8;

/**
 * Returned in place of a cohort metric when the grouping resolves to
 * fewer than k contributing users. There is no override and no
 * privileged role that can lift it.
 */
export const SUPPRESSED = 'SUPPRESSED' as const;
export type Suppressed = typeof SUPPRESSED;

export type CohortValue<T> = T | Suppressed;

export function suppressBelowThreshold<T>(
  value: T,
  contributingUsers: number,
  threshold = K_ANONYMITY_THRESHOLD,
): CohortValue<T> {
  return contributingUsers >= threshold ? value : SUPPRESSED;
}

export function isSuppressed<T>(value: CohortValue<T>): value is Suppressed {
  return value === SUPPRESSED;
}

/** Health probe shape. */
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
  /**
   * Which commit is actually serving this request.
   *
   * Weeks were spent on a fault whose whole answer was "the code you are
   * looking at is not the code that is deployed" — a failed build here, a
   * service worker holding an old bundle there — and there was no single
   * request that would say so. There is now.
   */
  build: {
    commit: string | null;
    shortCommit: string | null;
    branch: string | null;
    deployedAt: string | null;
    environment: string | null;
  };
  checks: Record<string, { status: 'ok' | 'degraded' | 'down'; detail?: string }>;
}
