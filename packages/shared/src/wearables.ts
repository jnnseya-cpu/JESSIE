/**
 * Wearable and health-platform integration.
 *
 * Two properties matter more than breadth of support:
 *
 *   1. **Nothing is required.** The engine's floor is a calendar it does
 *      not need and a phone it does not need either — the lightweight tier
 *      reaches people over SMS. A wearable improves the estimate; it never
 *      gates the product.
 *   2. **Every connection is individually revocable**, and revoking one
 *      degrades exactly one input rather than breaking the app. What that
 *      degradation actually looks like is spelled out per scope below,
 *      because "you can turn it off" means nothing if nobody can tell you
 *      what turning it off costs.
 */

/* ============================================================
   1 — Providers
   ============================================================ */

export const PROVIDERS = [
  'apple_health',
  'health_connect',
  'fitbit',
  'garmin',
  'samsung_health',
  'oura',
  'polar',
] as const;
export type Provider = (typeof PROVIDERS)[number];

export const DATA_SCOPES = [
  'steps',
  'heart_rate_trend',
  'sleep',
  'recovery',
  'workouts',
  'body_measurements',
] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export interface ProviderDefinition {
  readonly provider: Provider;
  readonly label: string;
  /** Scopes Jess Move will ever ask this provider for. */
  readonly requests: readonly DataScope[];
  /** How the connection is made. */
  readonly transport: 'on_device' | 'oauth_cloud';
  /** Typical delay between a reading and Jess Move seeing it. */
  readonly typicalLagMinutes: number;
  /** Whether the person's raw data leaves their device at all. */
  readonly rawDataLeavesDevice: boolean;
}

export const PROVIDER_DEFINITIONS: Readonly<Record<Provider, ProviderDefinition>> = {
  apple_health: {
    provider: 'apple_health',
    label: 'Apple Health',
    requests: ['steps', 'heart_rate_trend', 'sleep', 'workouts'],
    transport: 'on_device',
    typicalLagMinutes: 5,
    rawDataLeavesDevice: false,
  },
  health_connect: {
    provider: 'health_connect',
    label: 'Health Connect',
    requests: ['steps', 'heart_rate_trend', 'sleep', 'workouts'],
    transport: 'on_device',
    typicalLagMinutes: 5,
    rawDataLeavesDevice: false,
  },
  fitbit: {
    provider: 'fitbit',
    label: 'Fitbit',
    requests: ['steps', 'heart_rate_trend', 'sleep', 'recovery'],
    transport: 'oauth_cloud',
    typicalLagMinutes: 15,
    rawDataLeavesDevice: true,
  },
  garmin: {
    provider: 'garmin',
    label: 'Garmin',
    requests: ['steps', 'heart_rate_trend', 'sleep', 'recovery', 'workouts'],
    transport: 'oauth_cloud',
    typicalLagMinutes: 20,
    rawDataLeavesDevice: true,
  },
  samsung_health: {
    provider: 'samsung_health',
    label: 'Samsung Health',
    requests: ['steps', 'heart_rate_trend', 'sleep'],
    transport: 'on_device',
    typicalLagMinutes: 10,
    rawDataLeavesDevice: false,
  },
  oura: {
    provider: 'oura',
    label: 'Oura',
    requests: ['sleep', 'recovery', 'heart_rate_trend'],
    transport: 'oauth_cloud',
    typicalLagMinutes: 30,
    rawDataLeavesDevice: true,
  },
  polar: {
    provider: 'polar',
    label: 'Polar',
    requests: ['heart_rate_trend', 'sleep', 'recovery', 'workouts'],
    transport: 'oauth_cloud',
    typicalLagMinutes: 25,
    rawDataLeavesDevice: true,
  },
};

/* ============================================================
   2 — What is never ingested
   ============================================================ */

/**
 * Requested by nobody, stored by nothing. Several of these are available
 * from the providers above and are deliberately left on the table.
 */
export const NEVER_INGESTED = [
  'ECG traces and arrhythmia notifications',
  'blood oxygen readings',
  'blood glucose',
  'blood pressure',
  'menstrual cycle detail beyond an optional user-set phase',
  'fertility indicators',
  'medication logs',
  'GPS traces and route history',
  'continuous raw heart-rate time series',
] as const;

/** Why each is refused, when somebody inevitably asks. */
export const REFUSAL_REASON =
  'Each of these either edges the product toward a medical-device claim, or creates a ' +
  're-identification surface that no movement recommendation is worth. The engine has ' +
  'never needed them to place a two-minute movement in a real day.';

/* ============================================================
   3 — Degradation
   ============================================================ */

/**
 * Revoking one scope degrades one input. This table is the honest answer
 * to "what do I lose?" and is rendered verbatim in the consent centre.
 */
export const DEGRADATION: Readonly<Record<DataScope, { losesPrecision: string; stillWorks: string }>> = {
  steps: {
    losesPrecision: 'Sedentary detection falls back to device inactivity and calendar structure.',
    stillWorks: 'Gaps are still found. They are found slightly later in a long sitting block.',
  },
  heart_rate_trend: {
    losesPrecision: 'Readiness stops accounting for cardiovascular strain.',
    stillWorks: 'Readiness uses sleep, your check-in and completion history instead.',
  },
  sleep: {
    losesPrecision: 'Low Energy Day is triggered by your own check-in rather than automatically.',
    stillWorks: 'Recovery and fatigue logic is unchanged; it just asks rather than infers.',
  },
  recovery: {
    losesPrecision: 'Intensity ceilings are set more conservatively.',
    stillWorks: 'Conservative is the safe direction. Nothing is blocked.',
  },
  workouts: {
    losesPrecision: 'Deliberate exercise is not credited automatically.',
    stillWorks: 'You can log it in two taps, and Effort Equivalence treats it identically.',
  },
  body_measurements: {
    losesPrecision: 'BodyCommand trajectory widens its cone.',
    stillWorks: 'Every pathway still runs. Under 18, this scope is never requested at all.',
  },
};

/* ============================================================
   4 — Freshness and conflict
   ============================================================ */

export const STALE_AFTER_MINUTES = 180;

export interface Reading {
  readonly provider: Provider;
  readonly scope: DataScope;
  readonly value: number;
  readonly ageMinutes: number;
}

/**
 * A reading past `STALE_AFTER_MINUTES` is not silently used. It is marked
 * stale, and the surface that shows it must say so — a confident number
 * from three hours ago is worse than an honest gap.
 */
export function isStale(reading: Reading): boolean {
  return reading.ageMinutes > STALE_AFTER_MINUTES;
}

/**
 * Two watches disagree more often than anyone expects. Resolution is
 * deterministic and stated: freshest first, then on-device over cloud,
 * then the provider that natively owns the scope.
 */
export function resolveConflict(readings: readonly Reading[]): {
  chosen: Reading;
  because: string;
  disagreementPct: number;
} {
  if (readings.length === 0) throw new RangeError('nothing to resolve');
  const fresh = readings.filter((r) => !isStale(r));
  const pool = fresh.length > 0 ? fresh : readings;

  const sorted = [...pool].sort((a, b) => {
    if (a.ageMinutes !== b.ageMinutes) return a.ageMinutes - b.ageMinutes;
    const aLocal = PROVIDER_DEFINITIONS[a.provider].transport === 'on_device' ? 0 : 1;
    const bLocal = PROVIDER_DEFINITIONS[b.provider].transport === 'on_device' ? 0 : 1;
    return aLocal - bLocal;
  });

  const chosen = sorted[0];
  const values = pool.map((r) => r.value);
  const spread = Math.max(...values) - Math.min(...values);
  const disagreementPct = Number(((spread / Math.max(...values)) * 100).toFixed(1));

  const because =
    fresh.length === 0
      ? 'Every source is stale, so the freshest stale one is used and labelled as such.'
      : PROVIDER_DEFINITIONS[chosen.provider].transport === 'on_device'
        ? 'Freshest reading, and it never left the device.'
        : 'Freshest reading available.';

  return { chosen, because, disagreementPct };
}

/**
 * When sources disagree by more than this, the engine stops picking a
 * winner and widens its uncertainty instead.
 */
export const DISAGREEMENT_TOLERANCE_PCT = 15;

export function shouldWidenForDisagreement(disagreementPct: number): boolean {
  return disagreementPct > DISAGREEMENT_TOLERANCE_PCT;
}

/* ============================================================
   5 — Connection lifecycle
   ============================================================ */

export const CONNECTION_STATES = [
  'not_connected',
  'connected',
  'reauthorisation_needed',
  'degraded',
  'revoked',
] as const;
export type ConnectionState = (typeof CONNECTION_STATES)[number];

/**
 * Revocation is immediate, local-first, and deletes what was ingested.
 * These four guarantees are shown at the moment of connecting, not buried
 * in a policy nobody reads.
 */
export const REVOCATION_GUARANTEES = [
  'Takes effect immediately — no sync cycle, no support ticket.',
  'Deletes data already ingested from that provider within 24 hours.',
  'Never disables another provider, and never disables the product.',
  'Reconnecting later starts fresh rather than restoring the old history.',
] as const;

/** What is shown before a person connects anything. §26. */
export interface ConnectionDisclosure {
  readonly accesses: readonly DataScope[];
  readonly whyNeeded: string;
  readonly willNotAccess: readonly string[];
  readonly howToDisconnect: string;
}

export function disclosureFor(provider: Provider): ConnectionDisclosure {
  const def = PROVIDER_DEFINITIONS[provider];
  return {
    accesses: def.requests,
    whyNeeded:
      'To place a movement at a moment you can actually take it, and to stop suggesting ' +
      'anything on a day your body is asking for a break.',
    willNotAccess: [...NEVER_INGESTED],
    howToDisconnect: 'Settings → Connections → ' + def.label + ' → Disconnect. One tap.',
  };
}
