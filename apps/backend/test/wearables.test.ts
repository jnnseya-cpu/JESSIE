import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeSample, neverIngestedMatch } from '../src/wearables/wearables.logic.ts';

const FULL_GRANT = ['steps', 'heart_rate_trend', 'sleep', 'recovery'] as const;

test('every never-ingested category is refused, however it is spelled', () => {
  for (const name of [
    'blood_glucose',
    'bloodGlucoseMgDl',
    'ecg_trace',
    'spo2',
    'bloodOxygen',
    'blood_pressure_systolic',
    'menstrual_cycle_day',
    'fertility_window',
    'medication_log',
    'gps_route',
    'latitude',
    'heart_rate_raw_series',
    'rr_interval_ms',
  ]) {
    assert.equal(neverIngestedMatch(name), true, `${name} must match the never-ingested list`);
    const verdict = judgeSample(
      { scope: name, value: 1, ageMinutes: 0 },
      'fitbit',
      30,
      [...FULL_GRANT],
    );
    assert.equal(verdict.ok, false, `${name} must be refused`);
    if (!verdict.ok) assert.match(verdict.why ?? '', /never-ingested/);
  }
});

test('permitted scopes are not caught by the never-ingested patterns', () => {
  for (const scope of ['steps', 'heart_rate_trend', 'sleep', 'recovery', 'workouts', 'body_measurements']) {
    assert.equal(neverIngestedMatch(scope), false, `${scope} must not be refused as never-ingested`);
  }
});

test('a scope a provider is never asked for is refused for that provider', () => {
  // Fitbit's disclosure does not include workouts.
  const verdict = judgeSample({ scope: 'workouts', value: 1, ageMinutes: 5 }, 'fitbit', 30, [
    'steps',
    'workouts',
  ]);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.why ?? '', /never asked/);
});

test('body measurements are refused under 18, whatever was granted', () => {
  const verdict = judgeSample(
    { scope: 'body_measurements', value: 60, ageMinutes: 1 },
    'garmin',
    15,
    ['body_measurements'],
  );
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.why ?? '', /under 18/);
});

test('a revoked scope is refused even though the provider supports it', () => {
  const verdict = judgeSample({ scope: 'sleep', value: 7.5, ageMinutes: 30 }, 'fitbit', 30, [
    'steps',
  ]);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.match(verdict.why ?? '', /revoked/);
});

test('a valid consented sample is accepted', () => {
  const verdict = judgeSample({ scope: 'steps', value: 4200, ageMinutes: 12 }, 'fitbit', 30, [
    ...FULL_GRANT,
  ]);
  assert.deepEqual(verdict, { ok: true, scope: 'steps' });
});
