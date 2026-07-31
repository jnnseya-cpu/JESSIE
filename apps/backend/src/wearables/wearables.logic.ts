import {
  DATA_SCOPES,
  NEVER_INGESTED,
  PROVIDER_DEFINITIONS,
  REFUSAL_REASON,
  type DataScope,
  type Provider,
} from '@jessmove/shared';

/**
 * The pure rules of wearable ingestion — no Nest decorators, so the tests
 * exercise exactly what runs. The shared package owns *what* is promised
 * (providers, scopes, the never-ingested list, degradation); this file
 * owns turning a pushed sample into an accept or a refusal.
 */

export interface Sample {
  readonly scope: string;
  readonly value: number;
  readonly ageMinutes: number;
}

export interface SampleVerdict {
  readonly ok: boolean;
  /** Set when ok — the validated scope. */
  readonly scope?: DataScope;
  /** Set when refused — the reason, always human-readable. */
  readonly why?: string;
}

/**
 * Field names that pattern-match the never-ingested list. A provider SDK
 * renaming `blood_glucose` to `bloodGlucoseMgDl` must not slip through.
 */
const NEVER_INGESTED_PATTERNS = [
  'ecg',
  'arrhythmia',
  'spo2',
  'blood_oxygen',
  'bloodoxygen',
  'glucose',
  'blood_pressure',
  'bloodpressure',
  'systolic',
  'diastolic',
  'menstrual',
  'cycle_phase_detail',
  'fertility',
  'ovulation',
  'medication',
  'gps',
  'latitude',
  'longitude',
  'route',
  'hr_series',
  'heart_rate_raw',
  'rr_interval',
] as const;

export function neverIngestedMatch(name: string): boolean {
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return NEVER_INGESTED_PATTERNS.some((p) => flat.includes(p));
}

export function judgeSample(
  sample: Sample,
  provider: Provider,
  age: number,
  grantedScopes: readonly DataScope[],
): SampleVerdict {
  if (neverIngestedMatch(sample.scope)) {
    return {
      ok: false,
      why: `"${sample.scope}" is on the never-ingested list. ${REFUSAL_REASON}`,
    };
  }
  if (!(DATA_SCOPES as readonly string[]).includes(sample.scope)) {
    return { ok: false, why: `"${sample.scope}" is not a scope this platform ingests at all.` };
  }
  const scope = sample.scope as DataScope;
  // Safeguarding outranks provider capability: the age rule fires first.
  if (scope === 'body_measurements' && age < 18) {
    return { ok: false, why: 'body_measurements is never requested under 18, under any consent setting.' };
  }
  if (!PROVIDER_DEFINITIONS[provider].requests.includes(scope)) {
    return {
      ok: false,
      why: `${PROVIDER_DEFINITIONS[provider].label} is never asked for ${scope} — see the provider's disclosure.`,
    };
  }
  if (!grantedScopes.includes(scope)) {
    return { ok: false, why: `The ${scope} scope has been revoked for this connection.` };
  }
  if (!Number.isFinite(sample.value) || !Number.isFinite(sample.ageMinutes) || sample.ageMinutes < 0) {
    return { ok: false, why: 'A sample needs a finite value and a non-negative age.' };
  }
  return { ok: true, scope };
}

/** OAuth endpoints for the cloud providers. Codes ready: set the env pair. */
export const OAUTH = {
  fitbit: {
    authorize: 'https://www.fitbit.com/oauth2/authorize',
    token: 'https://api.fitbit.com/oauth2/token',
    envPrefix: 'FITBIT',
    style: 'basic_auth' as const,
  },
  oura: {
    authorize: 'https://cloud.ouraring.com/oauth/authorize',
    token: 'https://api.ouraring.com/oauth/token',
    envPrefix: 'OURA',
    style: 'body_secret' as const,
  },
  polar: {
    authorize: 'https://flow.polar.com/oauth2/authorization',
    token: 'https://polarremote.com/v2/oauth2/token',
    envPrefix: 'POLAR',
    style: 'basic_auth' as const,
  },
  /** Garmin's Health API is OAuth1 behind a partner agreement — stated, not faked. */
  garmin: {
    authorize: null,
    token: null,
    envPrefix: 'GARMIN',
    style: 'partner_programme' as const,
  },
} as const;

export type OauthProvider = keyof typeof OAUTH;

export function isOauthProvider(p: Provider): p is Provider & OauthProvider {
  return p in OAUTH;
}

export { NEVER_INGESTED };
