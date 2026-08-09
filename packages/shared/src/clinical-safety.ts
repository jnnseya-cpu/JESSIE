/**
 * DCB0129 — clinical risk management for a health IT system.
 *
 * The standard asks a manufacturer for three things: a named Clinical
 * Safety Officer who is accountable, a hazard log that identifies what
 * could harm a patient and what stops it, and evidence that the residual
 * risk was judged acceptable by that person rather than by the people who
 * built it.
 *
 * This file is the second of those, held as data rather than as a
 * document, for one reason: a hazard log in a spreadsheet drifts from the
 * software within a release or two, and a log that describes a system
 * that no longer exists is worse than none — it is a false assurance
 * somebody has signed. Here every control names the mechanism that
 * enforces it, and the ones marked as tested fail the build if they stop
 * being true.
 *
 * WHAT THIS FILE CANNOT DO.
 *
 * It cannot make anybody a Clinical Safety Officer. DCB0129 requires that
 * person to be a suitably qualified and experienced clinician with current
 * professional registration and training in clinical risk management, and
 * no amount of code substitutes for that. So the officer record below
 * carries the registration details as required fields and the log reports
 * itself as *not yet valid for submission* until they are recorded — an
 * unverifiable name in an assurance document is worse than an admitted
 * gap, because the first buyer who checks stops believing the rest of it.
 *
 * Nor is a hazard log a safety case. The safety case is the argument, made
 * by the officer, that the residual risks are acceptable. This is the
 * evidence that argument would be built from.
 */

/* ------------------------------------------------------------------ *
 * The officer
 * ------------------------------------------------------------------ */

export interface ClinicalSafetyOfficer {
  readonly name: string;
  readonly role: string;
  /** GMC, NMC, HCPC, GPhC or equivalent. Required by the standard. */
  readonly registrationBody: string | null;
  readonly registrationNumber: string | null;
  /** Evidence of clinical risk management training. */
  readonly riskManagementTraining: string | null;
  /** When they accepted accountability for the safety case. */
  readonly appointedOn: string | null;
  readonly contact: string;
}

/**
 * The appointed officer.
 *
 * Named because the platform's owner has appointed him. The registration
 * fields are null because they have not been supplied, and they are the
 * difference between an appointment and a valid one — see `officerStatus`.
 */
export const CLINICAL_SAFETY_OFFICER: ClinicalSafetyOfficer = {
  name: 'Mr Justin Nseya',
  role: 'Clinical Safety Officer',
  registrationBody: null,
  registrationNumber: null,
  riskManagementTraining: null,
  appointedOn: null,
  contact: 'clinical-safety@jessmove.com',
};

export interface OfficerStatus {
  readonly named: boolean;
  readonly validForSubmission: boolean;
  readonly missing: readonly string[];
  readonly says: string;
}

/**
 * Whether the appointment satisfies the standard, said plainly.
 *
 * Deliberately unforgiving. A hazard log that presents an incomplete
 * appointment as a complete one is the single most damaging thing this
 * file could contain, because it is the claim a reviewer checks first and
 * the one that decides whether they believe anything else.
 */
export function officerStatus(
  officer: ClinicalSafetyOfficer = CLINICAL_SAFETY_OFFICER,
): OfficerStatus {
  const missing: string[] = [];
  if (!officer.registrationBody) missing.push('professional registration body');
  if (!officer.registrationNumber) missing.push('registration number');
  if (!officer.riskManagementTraining) missing.push('clinical risk management training');
  if (!officer.appointedOn) missing.push('date of appointment');

  const named = officer.name.trim().length > 0;
  const valid = named && missing.length === 0;

  return {
    named,
    validForSubmission: valid,
    missing,
    says: valid
      ? `${officer.name} is the appointed Clinical Safety Officer and the appointment record is complete.`
      : `${officer.name} has been appointed as Clinical Safety Officer. The appointment is not yet complete for a DCB0129 submission: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} still to be recorded. DCB0129 requires the officer to be a suitably qualified and experienced clinician holding current professional registration, and this platform cannot assert that on anybody's behalf.`,
  };
}

/* ------------------------------------------------------------------ *
 * The risk matrix, as the standard defines it
 * ------------------------------------------------------------------ */

export const SEVERITIES = [
  'minor',
  'significant',
  'considerable',
  'major',
  'catastrophic',
] as const;
export type Severity = (typeof SEVERITIES)[number];

export const LIKELIHOODS = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

export const SEVERITY_MEANING: Readonly<Record<Severity, string>> = {
  minor: 'Minor injury not requiring professional intervention, or non-serious inconvenience.',
  significant: 'Minor injury requiring professional intervention, or significant psychological trauma.',
  considerable: 'Serious injury or incapacity requiring professional intervention.',
  major: 'Severe or life-threatening injury, or the death of one patient.',
  catastrophic: 'Death of multiple patients.',
};

export const LIKELIHOOD_MEANING: Readonly<Record<Likelihood, string>> = {
  very_low: 'Negligible or nearly negligible possibility of occurring.',
  low: 'Could occur but in the great majority of occasions will not.',
  medium: 'Possible.',
  high: 'Not certain but very possible; would be expected to occur.',
  very_high: 'Certain or almost certain; highly likely to occur.',
};

/**
 * The DCB0129 matrix. Risk 1 and 2 are acceptable, 3 is undesirable and
 * acceptable only where further reduction is impractical, 4 and 5 are
 * unacceptable and the system must not ship carrying them.
 */
const MATRIX: Readonly<Record<Likelihood, Readonly<Record<Severity, number>>>> = {
  very_high: { minor: 3, significant: 4, considerable: 4, major: 5, catastrophic: 5 },
  high: { minor: 2, significant: 3, considerable: 4, major: 4, catastrophic: 5 },
  medium: { minor: 2, significant: 3, considerable: 3, major: 4, catastrophic: 5 },
  low: { minor: 1, significant: 2, considerable: 3, major: 3, catastrophic: 4 },
  very_low: { minor: 1, significant: 1, considerable: 2, major: 2, catastrophic: 3 },
};

export type Acceptability = 'acceptable' | 'undesirable' | 'unacceptable';

export function riskScore(likelihood: Likelihood, severity: Severity): number {
  return MATRIX[likelihood][severity];
}

export function acceptability(score: number): Acceptability {
  if (score <= 2) return 'acceptable';
  if (score === 3) return 'undesirable';
  return 'unacceptable';
}

/* ------------------------------------------------------------------ *
 * The hazards
 * ------------------------------------------------------------------ */

export interface HazardControl {
  readonly what: string;
  /** The mechanism. A control nobody can point at is a wish. */
  readonly where: string;
  /** True when a test fails if this stops being true. */
  readonly tested: boolean;
}

export interface Hazard {
  readonly id: string;
  readonly hazard: string;
  /** What would have to happen for it to occur. */
  readonly cause: string;
  /** What happens to the person if it does. */
  readonly effect: string;
  readonly initial: { readonly likelihood: Likelihood; readonly severity: Severity };
  readonly controls: readonly HazardControl[];
  readonly residual: { readonly likelihood: Likelihood; readonly severity: Severity };
  /** What is still owed on this hazard, if anything. */
  readonly outstanding?: string;
}

/**
 * The hazard log.
 *
 * Written from what this system actually does rather than from a template.
 * Severity is judged on the person in front of the screen, not on the
 * organisation — a condition disclosed to an employer is a significant
 * harm even though nobody is physically injured by it.
 *
 * Note that severity never falls between the initial and residual columns.
 * A control reduces how likely something is; it does not make the outcome
 * less bad if it happens anyway, and logs that quietly downgrade severity
 * are how unacceptable risks come to look acceptable.
 */
export const HAZARDS: readonly Hazard[] = [
  {
    id: 'H01',
    hazard: 'A person under 18 is shown a weight, a body-mass index or an energy figure.',
    cause:
      'An age check omitted on a surface that renders any of those figures, or an adult surface reachable by a minor account.',
    effect:
      'Body-image harm and a recognised pathway into disordered eating, in a group where that pathway is well documented and the platform would have opened it.',
    initial: { likelihood: 'medium', severity: 'considerable' },
    controls: [
      {
        what: 'The insight engine returns unavailable for any age under 18 before it computes anything at all.',
        where: 'risk.logic.ts — insightFor, first branch',
        tested: true,
      },
      {
        what: 'Conditions cannot be declared under 18, at the endpoint as well as in the render.',
        where: 'health-insight.controller.ts — setConditions',
        tested: true,
      },
      {
        what: 'The strength and balance module refuses under 18.',
        where: 'falls.controller.ts — record',
        tested: true,
      },
      {
        what: 'Energy is withheld from a minor in FoodLens, and the surface policy is a shared gate rather than a per-screen decision.',
        where: '@jessmove/shared — bodySurfacePolicy, charter rule C6',
        tested: true,
      },
    ],
    residual: { likelihood: 'very_low', severity: 'considerable' },
    outstanding:
      'Age is self-declared. A minor who registers as an adult defeats every control above. Ofcom’s 2026 position is that self-declaration is not highly effective age assurance, and this is the largest single residual risk in this log.',
  },
  {
    id: 'H02',
    hazard:
      'A person with exocrine pancreatic insufficiency restricts fat because the platform flagged it.',
    cause:
      'General saturated-fat guidance applied to somebody whose current clinical guidance is not to restrict fat.',
    effect:
      'Weight loss and fat-soluble vitamin deficiency — the exact harm the out-of-date low-fat advice causes, delivered by us.',
    initial: { likelihood: 'high', severity: 'considerable' },
    controls: [
      {
        what: 'The saturated-fat finding is suppressed entirely where the declared condition makes it wrong, and the suppression is stated on the page rather than silent.',
        where: 'risk.logic.ts — risksFor, doNotFlagFat',
        tested: true,
      },
      {
        what: 'The condition card states that the guidance has changed and that older leaflets say the opposite.',
        where: 'conditions.ts — pancreatic_insufficiency.careful',
        tested: false,
      },
    ],
    residual: { likelihood: 'low', severity: 'considerable' },
    outstanding: 'Depends on the member declaring the condition. Nothing infers it, by design.',
  },
  {
    id: 'H03',
    hazard:
      'A person with reduced kidney function is pushed towards protein, or towards a potassium-based salt substitute.',
    cause:
      'General guidance — eat more protein, swap to a low-sodium salt — applied without regard to renal function.',
    effect:
      'Hyperkalaemia, which can be fatal, or accelerated decline in kidney function.',
    initial: { likelihood: 'medium', severity: 'major' },
    controls: [
      {
        what: 'No surface suggests a salt substitute where the declared condition forbids it, and the salt finding names the substitute as the one swap to avoid.',
        where: 'risk.logic.ts — noSaltSubstitute',
        tested: true,
      },
      {
        what: 'Protein is never pushed where a declared condition sets the target from bloods, including against an opposing declared context.',
        where: 'risk.logic.ts — doNotPushProtein, and the conflict statement',
        tested: true,
      },
      {
        what: 'Where two declared contexts disagree, the cautious side wins and the member is told who settles it.',
        where: 'risk.logic.ts — suppressionsFor, protein conflict',
        tested: true,
      },
    ],
    residual: { likelihood: 'very_low', severity: 'major' },
  },
  {
    id: 'H04',
    hazard: 'Unintended weight loss is treated as progress rather than as a symptom.',
    cause:
      'A weight-reduction narrative running for somebody whose falling weight is the presenting sign of an undiagnosed illness.',
    effect:
      'Delayed presentation of a serious underlying condition — malignancy, inflammatory bowel disease, malabsorption — because the platform reinforced it as success.',
    initial: { likelihood: 'medium', severity: 'major' },
    controls: [
      {
        what: 'Where a declared condition makes weight loss a warning, the reduction plan does not run, the BMI target is withheld and a falling weight is raised as high with the action "tell the team treating you".',
        where: 'risk.logic.ts — weightLossIsAWarning',
        tested: true,
      },
      {
        what: 'The threshold for saying so is 0.2kg a week rather than the general 1kg.',
        where: 'risk.logic.ts — risksFor, weight going down',
        tested: true,
      },
    ],
    residual: { likelihood: 'low', severity: 'major' },
    outstanding:
      'Only fires where a relevant condition has been declared. Somebody with an undiagnosed illness has, by definition, declared nothing — the general "rate of loss" finding is the only net under them.',
  },
  {
    id: 'H05',
    hazard: 'A figure estimated from a photograph is acted on as though it were measured.',
    cause:
      'A single confident number returned for a plate whose contents were inferred rather than read.',
    effect:
      'Sustained under- or over-eating built on an error. Independent testing published in 2026 found leading photo apps underestimate meal energy by roughly 250 to 345 calories with macronutrient error rates of 48 to 66 per cent.',
    initial: { likelihood: 'very_high', severity: 'significant' },
    controls: [
      {
        what: 'Energy is returned as a range, never as a single figure.',
        where: 'foodlens.logic.ts — energy',
        tested: true,
      },
      {
        what: 'Every nutrient states its basis: label, calculated, estimate, reference or unmeasured.',
        where: 'foodlens.logic.ts — frontOfPackFrom',
        tested: true,
      },
      {
        what: 'A nutrient nothing established is shown as not measured, never as zero.',
        where: 'foodlens.logic.ts and the ledger entry mapping',
        tested: true,
      },
      {
        what: 'An intelligence score states how much of the plate was actually known.',
        where: 'foodlens.service.ts — intelligence',
        tested: true,
      },
    ],
    residual: { likelihood: 'low', severity: 'significant' },
  },
  {
    id: 'H06',
    hazard: 'Somebody falls while attempting a balance or chair-stand self-check.',
    cause:
      'A functional measure performed alone, without support in reach, on an unsuitable surface or chair.',
    effect: 'A fall, with fracture the common outcome in the age group this is aimed at.',
    initial: { likelihood: 'medium', severity: 'considerable' },
    controls: [
      {
        what: 'Every check carries safety instructions before the method: something solid within arm’s reach, a chair that cannot slide, a clear floor, somebody in the house.',
        where: 'falls.ts — FUNCTIONAL_CHECKS[].safety',
        tested: true,
      },
      {
        what: 'Each check tells the person to stop at the first position they cannot hold, and that stopping is the honest number.',
        where: 'falls.ts — FUNCTIONAL_CHECKS[].how',
        tested: false,
      },
      {
        what: 'Every measure is optional; a check not attempted is a valid record rather than an incomplete one.',
        where: 'falls_checks migration — nullable measures',
        tested: false,
      },
    ],
    residual: { likelihood: 'low', severity: 'considerable' },
    outstanding:
      'Undesirable rather than acceptable, and deliberately left there. This is a physical test performed unsupervised in somebody’s home, and no instruction reduces that to negligible — the only controls that would are supervision, which we cannot provide, or removing the checks, which would remove the thing that gets people to the right starting level. The judgement is that an unsupervised check with explicit safety instructions is safer than the alternative actually taken, which is starting a programme at a level nobody measured. That judgement belongs to the Clinical Safety Officer to accept or reject.',
  },
  {
    id: 'H07',
    hazard:
      'A good result on the strength and balance checks is read as evidence of being at low risk of falling.',
    cause:
      'A functional measure presented as, or mistaken for, a falls risk assessment.',
    effect:
      'A person declines or does not seek a real assessment — which covers medication, lying and standing blood pressure, vision, feet and the home — and falls.',
    initial: { likelihood: 'high', severity: 'major' },
    controls: [
      {
        what: 'No risk score is produced. There is no field to return one in, and the module returns a starting level for exercise instead.',
        where: 'falls.ts — StartingPoint has no risk or score member',
        tested: true,
      },
      {
        what: 'Every response carries the statement that this is not an assessment of falls risk, naming the four things it cannot see, and saying that a good result does not mean safe.',
        where: 'falls.ts — NOT_A_RISK_SCORE',
        tested: true,
      },
      {
        what: 'A fall in the last twelve months routes to a falls assessment regardless of how well the checks went.',
        where: 'falls.ts — startingPoint, referFirst',
        tested: true,
      },
    ],
    residual: { likelihood: 'low', severity: 'major' },
    outstanding:
      'The statement is on every response, and nobody can be made to read it. The platform also has no way of knowing whether an assessment was offered and declined — it can prompt, and it cannot follow up. Reducing this further needs something outside the software: a route by which a poor result reaches a clinician, which is what the NHS procurement route would provide and what nothing here currently does.',
  },
  {
    id: 'H08',
    hazard: 'A declared allergen present in a product is not surfaced to the person scanning it.',
    cause:
      'Incomplete or stale label data, or a photograph analysed as though it were a label.',
    effect:
      'Allergic reaction, up to anaphylaxis, or gluten exposure in coeliac disease.',
    initial: { likelihood: 'medium', severity: 'major' },
    controls: [
      {
        what: 'The fourteen UK declared allergens are reported from the label when a barcode is read, and the source of every figure is stated.',
        where: 'barcode.service.ts, @jessmove/foodlens — UK_ALLERGENS',
        tested: true,
      },
      {
        what: 'A photograph never produces an allergen claim; the analysis states what a photograph cannot tell you.',
        where: 'foodlens.logic.ts — NEVER_CLAIM',
        tested: true,
      },
      {
        what: 'The coeliac and lactose cards say plainly that the packet is scanned rather than trusted, and name cross-contamination as the usual cause of a reaction despite doing everything right.',
        where: 'conditions.ts — coeliac.careful',
        tested: false,
      },
    ],
    residual: { likelihood: 'low', severity: 'major' },
    outstanding:
      'Label data comes from an open catalogue that can be out of date. The platform states its source but cannot guarantee the manufacturer has not changed the recipe.',
  },
  {
    id: 'H09',
    hazard: 'The coach states something clinical, or invents context about the person.',
    cause: 'A language model answering outside the boundaries set for it.',
    effect:
      'A person acts on advice that was not clinically grounded, or loses trust after being told things about their day that were never true.',
    initial: { likelihood: 'high', severity: 'considerable' },
    controls: [
      {
        what: 'The coach publishes what it refuses to do, and the refusals are enforced rather than requested.',
        where: 'mova — MOVA_REFUSES',
        tested: true,
      },
      {
        what: 'An answer that repeats context from the tone sample is detected and the model is asked again with the mistake named.',
        where: 'mova.service.ts — repeatsSampleContext',
        tested: true,
      },
      {
        what: 'Under-18 answers are checked against the minor rules by the platform after the model returns, not by the model.',
        where: 'mova.service.ts — violatesMinorRules',
        tested: true,
      },
    ],
    residual: { likelihood: 'low', severity: 'considerable' },
    outstanding:
      'The controls detect known failure modes after the model has answered — invented context, a breach of the under-18 rules, a banned phrase. A novel failure that resembles none of them passes. This is the irreducible residual risk of putting a language model in front of a person, and the mitigations are bounded scope, published refusals and the fact that the coach answers in one line rather than at length.',
  },
  {
    id: 'H10',
    hazard: 'The platform comments on a prescribed medication.',
    cause:
      'Condition guidance drifting into dose, timing, escalation, or whether to continue.',
    effect:
      'A person alters a prescription on the basis of software that has never seen their results.',
    initial: { likelihood: 'medium', severity: 'major' },
    controls: [
      {
        what: 'Every condition card carries a clinicianOnly section naming the medication as the prescriber’s, and a test scans all cards for dose, timing and escalation language.',
        where: 'conditions.ts — clinicianOnly; conditions.test.ts',
        tested: true,
      },
      {
        what: 'The appetite-suppressing medication card is additionally scanned for injection, titration and missed-dose language.',
        where: 'gaps.test.ts',
        tested: true,
      },
      {
        what: 'A declared medication carries its own notice stating that nothing here comments on it.',
        where: 'conditions.ts — MEDICATION_NOT_ADVICE',
        tested: true,
      },
    ],
    residual: { likelihood: 'very_low', severity: 'major' },
  },
  {
    id: 'H11',
    hazard: 'A declared condition reaches an employer, a household member or a report.',
    cause: 'Group aggregation including special-category data, or a small group size.',
    effect:
      'Identification of a person’s health status by somebody with power over them, with the discrimination that follows.',
    initial: { likelihood: 'medium', severity: 'significant' },
    controls: [
      {
        what: 'Group reporting enforces a k-anonymity floor of 8.',
        where: 'groups.logic.ts — K_ANONYMITY_FLOOR',
        tested: true,
      },
      {
        what: 'No module outside the conditions service references the conditions table at all, asserted by scanning the source.',
        where: 'conditions.test.ts',
        tested: true,
      },
      {
        what: 'Conditions never enter the ordinary draft autosave, which refuses anything clinical.',
        where: 'state.logic.ts — FORBIDDEN',
        tested: true,
      },
    ],
    residual: { likelihood: 'very_low', severity: 'significant' },
  },
  {
    id: 'H12',
    hazard:
      'A person on appetite-suppressing medication under-eats to a harmful degree without noticing.',
    cause:
      'Appetite pharmacologically suppressed, intake falling well below need, and a platform whose every other rule watches for excess.',
    effect:
      'Loss of lean mass, micronutrient shortfall, and fatigue attributed to the medication rather than to intake.',
    initial: { likelihood: 'high', severity: 'considerable' },
    controls: [
      {
        what: 'Below half a reference intake is raised as a high finding, with protein-first named as the action.',
        where: 'risk.logic.ts — proteinMattersMore',
        tested: true,
      },
      {
        what: 'Loss faster than roughly one per cent of body weight a week is raised, with resistance work as the lever.',
        where: 'risk.logic.ts — muscleLossRisk',
        tested: true,
      },
      {
        what: 'Fewer than two movement days a week is raised as a muscle finding while this is happening.',
        where: 'risk.logic.ts — muscleLossRisk, activity',
        tested: true,
      },
    ],
    residual: { likelihood: 'low', severity: 'considerable' },
    outstanding:
      'Depends on the person recording what they ate. Somebody who stops recording because they ate almost nothing is invisible to this, and that is the failure mode most likely to occur.',
  },
  {
    id: 'H13',
    hazard: 'A person acts on figures that failed to save, believing them recorded.',
    cause: 'A write that failed silently, or a stale read presented as current.',
    effect:
      'Decisions taken on an incomplete record — a week that looks lighter than it was, a condition believed declared that is not.',
    initial: { likelihood: 'medium', severity: 'significant' },
    controls: [
      {
        what: 'A failed conditions write is surfaced rather than swallowed; the picker says so and does not claim to have saved.',
        where: 'conditions.service.ts and conditions.tsx — save state',
        tested: true,
      },
      {
        what: 'A failed conditions read throws rather than returning an empty list, so nobody is handed general advice their condition exists to override.',
        where: 'conditions.service.ts — forUser',
        tested: false,
      },
      {
        what: 'A failed strength-check read throws rather than restarting somebody at a level they have outgrown.',
        where: 'falls.controller.ts — history',
        tested: false,
      },
    ],
    residual: { likelihood: 'low', severity: 'significant' },
    outstanding:
      'Food ledger writes remain best-effort by design: a ledger that cannot be written must not take down the analysis somebody is waiting for. A missing row is a gap in a total rather than a failed scan, and that trade is deliberate.',
  },
  {
    id: 'H14',
    hazard: 'AI analysis stops mid-use and the person believes the picture is complete.',
    cause: 'An allowance exhausted between one action and the next.',
    effect:
      'A decision taken on a partial reading, believing it whole.',
    initial: { likelihood: 'high', severity: 'minor' },
    controls: [
      {
        what: 'The allowance is checked and held before any provider is called, so an action either runs completely or does not begin.',
        where: 'ai-gateway.service.ts — hold, before the provider chain',
        tested: true,
      },
      {
        what: 'Exhaustion returns 402 with the wallet’s own explanation of what is paused and what still works, never a generic failure.',
        where: 'allowance.filter.ts',
        tested: true,
      },
      {
        what: 'No caller dresses an empty allowance as an outage.',
        where: 'mova, foodlens, blog and growth services — AllowanceExhaustedError rethrow',
        tested: true,
      },
    ],
    residual: { likelihood: 'very_low', severity: 'minor' },
  },
];

/* ------------------------------------------------------------------ *
 * Reading the log
 * ------------------------------------------------------------------ */

export interface ScoredHazard extends Hazard {
  readonly initialScore: number;
  readonly initialAcceptability: Acceptability;
  readonly residualScore: number;
  readonly residualAcceptability: Acceptability;
  readonly testedControls: number;
}

export function scoreHazard(hazard: Hazard): ScoredHazard {
  const initialScore = riskScore(hazard.initial.likelihood, hazard.initial.severity);
  const residualScore = riskScore(hazard.residual.likelihood, hazard.residual.severity);
  return {
    ...hazard,
    initialScore,
    initialAcceptability: acceptability(initialScore),
    residualScore,
    residualAcceptability: acceptability(residualScore),
    testedControls: hazard.controls.filter((c) => c.tested).length,
  };
}

export function scoredHazards(): readonly ScoredHazard[] {
  return HAZARDS.map(scoreHazard).sort((a, b) => b.residualScore - a.residualScore);
}

export interface HazardLogSummary {
  readonly officer: ClinicalSafetyOfficer;
  readonly officerStatus: OfficerStatus;
  readonly hazards: readonly ScoredHazard[];
  readonly counts: {
    readonly total: number;
    readonly unacceptableResidual: number;
    readonly undesirableResidual: number;
    readonly acceptableResidual: number;
    readonly controls: number;
    readonly testedControls: number;
  };
  readonly outstanding: readonly { readonly id: string; readonly says: string }[];
  readonly status: string;
}

export function hazardLog(
  officer: ClinicalSafetyOfficer = CLINICAL_SAFETY_OFFICER,
): HazardLogSummary {
  const hazards = scoredHazards();
  const status = officerStatus(officer);
  const controls = hazards.reduce((n, h) => n + h.controls.length, 0);

  return {
    officer,
    officerStatus: status,
    hazards,
    counts: {
      total: hazards.length,
      unacceptableResidual: hazards.filter((h) => h.residualAcceptability === 'unacceptable').length,
      undesirableResidual: hazards.filter((h) => h.residualAcceptability === 'undesirable').length,
      acceptableResidual: hazards.filter((h) => h.residualAcceptability === 'acceptable').length,
      controls,
      testedControls: hazards.reduce((n, h) => n + h.testedControls, 0),
    },
    outstanding: hazards
      .filter((h): h is ScoredHazard & { outstanding: string } => Boolean(h.outstanding))
      .map((h) => ({ id: h.id, says: h.outstanding })),
    status: status.validForSubmission
      ? 'A hazard log with a complete officer appointment. The safety case — the argument that these residual risks are acceptable — is the officer’s to make and sign.'
      : 'A hazard log with an incomplete officer appointment. It is usable evidence and it is not yet a DCB0129 submission, and this platform will not describe it as one until the appointment record is complete.',
  };
}

export const HAZARD_LOG_PREAMBLE =
  'Clinical risk management under DCB0129, held as data rather than as a document so that it ' +
  'cannot drift from the software it describes. Every control names the mechanism that enforces ' +
  'it; the ones marked tested fail the build if they stop being true. Severity is never reduced ' +
  'between the initial and residual columns — a control changes how likely something is, not how ' +
  'bad it is when it happens anyway.';
