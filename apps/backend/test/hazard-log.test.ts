import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CLINICAL_SAFETY_OFFICER,
  HAZARDS,
  LIKELIHOODS,
  SEVERITIES,
  acceptability,
  assuranceGaps,
  hazardLog,
  officerStatus,
  riskScore,
  scoreHazard,
  scoredHazards,
} from '@jessmove/shared';

/**
 * The hazard log, and the one thing it must never do.
 *
 * DCB0129 asks a manufacturer to say what could harm somebody, what stops
 * it, and who is accountable for judging the leftover risk acceptable.
 * The failure mode is not omitting a hazard — it is a log that reads as
 * complete when the appointment behind it is not, because a reviewer
 * checks the officer first and stops believing the rest of the document
 * when that does not hold up.
 */

/* ── the officer ───────────────────────────────────────────────────── */

test('the appointed officer is named', () => {
  assert.equal(CLINICAL_SAFETY_OFFICER.name, 'Mr Justin Nseya');
  assert.equal(CLINICAL_SAFETY_OFFICER.role, 'Clinical Safety Officer');
});

test('a name alone is not an appointment DCB0129 would accept', () => {
  /*
   * The standard requires a suitably qualified and experienced clinician
   * with current professional registration and clinical risk management
   * training. Software cannot supply any of that, and asserting it on
   * somebody's behalf would be the most damaging sentence in this file.
   */
  const status = officerStatus();
  assert.equal(status.named, true);
  assert.equal(status.validForSubmission, false);
  for (const needed of [
    'professional registration body',
    'registration number',
    'clinical risk management training',
    'date of appointment',
  ]) {
    assert.ok(status.missing.includes(needed), `${needed} is not being asked for`);
  }
  assert.match(status.says, /suitably qualified and experienced clinician/i);
  assert.match(status.says, /cannot assert that on anybody's behalf/i);
});

test('a complete appointment record makes it valid, and only that does', () => {
  const complete = officerStatus({
    ...CLINICAL_SAFETY_OFFICER,
    registrationBody: 'GMC',
    registrationNumber: '0000000',
    riskManagementTraining: 'NHS England clinical risk management training, 2026',
    appointedOn: '2026-08-04',
  });
  assert.equal(complete.validForSubmission, true);
  assert.deepEqual(complete.missing, []);

  // Any one of them missing and it is back to not valid.
  const partial = officerStatus({
    ...CLINICAL_SAFETY_OFFICER,
    registrationBody: 'GMC',
    registrationNumber: '0000000',
    riskManagementTraining: 'training',
    appointedOn: null,
  });
  assert.equal(partial.validForSubmission, false);
});

test('the log describes itself honestly while the appointment is incomplete', () => {
  const log = hazardLog();
  assert.equal(log.officerStatus.validForSubmission, false);
  assert.match(log.status, /not yet a DCB0129 submission/i);
  assert.match(log.status, /will not describe it as one/i);
});

/* ── the matrix ────────────────────────────────────────────────────── */

test('the matrix is the one the standard publishes', () => {
  // Spot-checks across the corners and the middle.
  assert.equal(riskScore('very_low', 'minor'), 1);
  assert.equal(riskScore('very_high', 'catastrophic'), 5);
  assert.equal(riskScore('medium', 'considerable'), 3);
  assert.equal(riskScore('low', 'major'), 3);
  assert.equal(riskScore('high', 'considerable'), 4);

  assert.equal(acceptability(1), 'acceptable');
  assert.equal(acceptability(2), 'acceptable');
  assert.equal(acceptability(3), 'undesirable');
  assert.equal(acceptability(4), 'unacceptable');
  assert.equal(acceptability(5), 'unacceptable');
});

test('every likelihood and severity has a published meaning', () => {
  for (const s of SEVERITIES) assert.ok(s.length > 0);
  for (const l of LIKELIHOODS) assert.ok(l.length > 0);
  assert.equal(SEVERITIES.length, 5);
  assert.equal(LIKELIHOODS.length, 5);
});

/* ── the hazards ───────────────────────────────────────────────────── */

test('every hazard names a cause, an effect and at least one control', () => {
  assert.ok(HAZARDS.length >= 12, `${HAZARDS.length} hazards`);
  const ids = new Set<string>();
  for (const hazard of HAZARDS) {
    assert.ok(!ids.has(hazard.id), `${hazard.id} appears twice`);
    ids.add(hazard.id);
    assert.ok(hazard.cause.length > 30, `${hazard.id} has no cause`);
    assert.ok(hazard.effect.length > 30, `${hazard.id} has no effect`);
    assert.ok(hazard.controls.length > 0, `${hazard.id} has no controls`);
    for (const control of hazard.controls) {
      assert.ok(control.where.length > 5, `a control in ${hazard.id} names no mechanism`);
    }
  }
});

test('severity is never quietly reduced by a control', () => {
  /*
   * The most common way a hazard log lies. A control changes how likely
   * something is; it does not make the outcome less bad when it happens
   * anyway. A log that lowers severity between the columns can turn an
   * unacceptable risk into an acceptable one on paper alone.
   */
  const order = [...SEVERITIES];
  for (const hazard of HAZARDS) {
    assert.equal(
      order.indexOf(hazard.residual.severity),
      order.indexOf(hazard.initial.severity),
      `${hazard.id} changes severity between initial and residual`,
    );
  }
});

test('every control actually reduces the risk it is listed against', () => {
  for (const hazard of HAZARDS.map(scoreHazard)) {
    assert.ok(
      hazard.residualScore <= hazard.initialScore,
      `${hazard.id} rates higher after its controls than before them`,
    );
  }
});

test('nothing ships carrying an unacceptable residual risk', () => {
  const log = hazardLog();
  assert.equal(
    log.counts.unacceptableResidual,
    0,
    `unacceptable: ${log.hazards
      .filter((h) => h.residualAcceptability === 'unacceptable')
      .map((h) => h.id)
      .join(', ')}`,
  );
});

test('an undesirable residual risk carries a note saying what is still owed', () => {
  for (const hazard of scoredHazards()) {
    if (hazard.residualAcceptability !== 'undesirable') continue;
    assert.ok(
      hazard.outstanding,
      `${hazard.id} is undesirable with nothing recorded about why that is tolerated`,
    );
  }
});

test('the hazards that matter most are in the log', () => {
  const text = HAZARDS.map((h) => `${h.hazard} ${h.effect}`).join(' ').toLowerCase();
  for (const [what, pattern] of [
    ['a minor shown a weight', /under 18 is shown a weight/],
    ['out-of-date fat advice', /pancreatic insufficiency restricts fat/],
    ['potassium and kidneys', /potassium-based salt substitute/],
    ['unintended weight loss', /unintended weight loss/],
    ['photo estimates taken as measured', /estimated from a photograph is acted on/],
    ['a fall during a self-check', /falls while attempting a balance/],
    ['a good result read as safe', /read as evidence of being at low risk/],
    ['a missed allergen', /declared allergen/],
    ['commenting on a prescription', /comments on a prescribed medication/],
    ['a condition reaching an employer', /reaches an employer/],
  ] as const) {
    assert.match(text, pattern, `${what} is not in the hazard log`);
  }
});

test('the log is honest about what still depends on the member', () => {
  const log = hazardLog();
  assert.ok(log.outstanding.length >= 4, 'a log with nothing outstanding is a log nobody believes');
  const said = log.outstanding.map((o) => o.says).join(' ');
  // The three real ones.
  assert.match(said, /self-declared/i, 'the age assurance limit must be admitted');
  assert.match(said, /declared nothing/i, 'the undeclared-condition limit must be admitted');
  assert.match(said, /stops recording/i, 'the disengagement failure mode must be admitted');
});

test('most controls are enforced by a test rather than described', () => {
  const log = hazardLog();
  assert.ok(
    log.counts.testedControls / log.counts.controls > 0.6,
    `only ${log.counts.testedControls} of ${log.counts.controls} controls are tested`,
  );
});

/* ── how it is served ──────────────────────────────────────────────── */

test('the hazard log is published rather than kept internally', () => {
  const source = readFileSync(
    new URL('../src/health/assurance.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /@Get\('hazards'\)/);
  assert.ok(!/@AdminOnly/.test(source), 'a risk assessment nobody can read is an assertion');
  assert.match(source, /DCB0129/);
  assert.match(source, /whatThisIsNot:/, 'and it must say it is not a safety case');
});

test('the assurance summary now separates the log from the appointment', () => {
  const gaps = assuranceGaps().map((g) => `${g.claim} ${g.evidence}`).join(' ');
  // The log is done; the appointment is not, and they are different rows.
  assert.ok(!/hazard log.{0,40}Not done/i.test(gaps), 'the hazard log is still listed as missing');
  assert.match(gaps, /Clinical Safety Officer whose appointment satisfies DCB0129/);
  assert.match(gaps, /current professional registration/i);
});
