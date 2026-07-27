import { PATHWAY_DEFINITIONS, type BodyPathway, type SafetyStatus } from './pathways';

/**
 * §5, Agent 17 — Safety and Escalation Guardian.
 *
 * "This agent has authority over every other agent."
 *
 * Safety is a supervisor, not a peer. Nothing in this module may produce a
 * plan that the guardian has not approved, and the guardian's verdict is
 * never a weight that other factors can outvote.
 */

export const ESCALATION_SIGNALS = [
  'pregnancy',
  'suspected_eating_disorder',
  'declared_eating_disorder',
  'rapid_unexplained_weight_change',
  'repeated_very_low_intake',
  'faintness',
  'chest_pain',
  'severe_breathlessness',
  'purging_indicators',
  'excessive_compensatory_exercise',
  'child_safeguarding_concern',
  'frailty',
  'unplanned_weight_loss',
  'medication_concern',
] as const;
export type EscalationSignal = (typeof ESCALATION_SIGNALS)[number];

/**
 * Signals that block automated progression outright rather than merely
 * limiting it. Present any one of these and the guardian returns
 * AUTOMATION_BLOCKED — no weight-loss plan, no calorie target.
 */
export const BLOCKING_SIGNALS: readonly EscalationSignal[] = [
  'pregnancy',
  'suspected_eating_disorder',
  'declared_eating_disorder',
  'purging_indicators',
  'excessive_compensatory_exercise',
  'child_safeguarding_concern',
  'chest_pain',
  'severe_breathlessness',
];

/** Powers the guardian holds over every other agent. §5. */
export const GUARDIAN_POWERS = [
  'block_weight_loss_plan',
  'suspend_calorie_targets',
  'disable_competitive_features',
  'recommend_professional_assessment',
  'restrict_food_scoring',
  'switch_to_maintenance',
  'activate_child_safe_mode',
  'activate_frailty_protection',
  'activate_eating_disorder_safeguards',
] as const;
export type GuardianPower = (typeof GUARDIAN_POWERS)[number];

export interface SafetyAssessment {
  status: SafetyStatus;
  signals: EscalationSignal[];
  powersExercised: GuardianPower[];
  /** Whether a weight-reduction plan may be generated at all. */
  reductionPermitted: boolean;
  /** Whether any automated progression may run without human review. */
  automationPermitted: boolean;
  /** Plain, non-alarming explanation for the user. Never a diagnosis. */
  userMessage: string;
  /** Pathway the guardian forces, overriding the user's selection. */
  forcedPathway?: BodyPathway;
}

export interface SafetyInput {
  age: number;
  signals: EscalationSignal[];
  requestedPathway: BodyPathway;
  /** True when the user has asked for a rate of change the system judges unsafe. */
  requestsExtremeChange?: boolean;
}

/**
 * The guardian runs before any plan is built. It can only ever *narrow*
 * what is permitted — there is no input that widens it.
 */
export function assessSafety(input: SafetyInput): SafetyAssessment {
  const signals = [...new Set(input.signals)];
  const powers: GuardianPower[] = [];

  const blocking = signals.filter((s) => BLOCKING_SIGNALS.includes(s));
  const isMinor = input.age < 18;

  // Under 18: never an adult pathway, never automated reduction. §11.
  if (isMinor) {
    powers.push('activate_child_safe_mode', 'block_weight_loss_plan');
    return {
      status: blocking.length > 0 ? 'AUTOMATION_BLOCKED' : 'LIMITED',
      signals,
      powersExercised: powers,
      reductionPermitted: false,
      automationPermitted: false,
      forcedPathway: 'CHILD_GROWTH',
      userMessage:
        'We focus on growth, energy, confidence and family routines at this age. ' +
        'We do not set weight targets.',
    };
  }

  if (signals.includes('pregnancy')) {
    powers.push('block_weight_loss_plan', 'suspend_calorie_targets', 'recommend_professional_assessment');
    return {
      status: 'AUTOMATION_BLOCKED',
      signals,
      powersExercised: powers,
      reductionPermitted: false,
      automationPermitted: false,
      forcedPathway: 'PROFESSIONAL_SUPPORT',
      userMessage:
        'We will not run an automated weight plan during pregnancy. ' +
        'Your midwife or GP is the right person to guide this.',
    };
  }

  if (
    signals.includes('suspected_eating_disorder') ||
    signals.includes('declared_eating_disorder') ||
    signals.includes('purging_indicators') ||
    signals.includes('excessive_compensatory_exercise')
  ) {
    powers.push(
      'block_weight_loss_plan',
      'suspend_calorie_targets',
      'restrict_food_scoring',
      'disable_competitive_features',
      'activate_eating_disorder_safeguards',
      'recommend_professional_assessment',
    );
    return {
      status: 'AUTOMATION_BLOCKED',
      signals,
      powersExercised: powers,
      reductionPermitted: false,
      automationPermitted: false,
      forcedPathway: 'PROFESSIONAL_SUPPORT',
      userMessage:
        'We have turned off targets, scores and comparisons. ' +
        'Speaking to a professional is the most useful next step, and we can help you prepare a summary if you want one.',
    };
  }

  if (blocking.length > 0) {
    powers.push('recommend_professional_assessment', 'switch_to_maintenance');
    return {
      status: 'AUTOMATION_BLOCKED',
      signals,
      powersExercised: powers,
      reductionPermitted: false,
      automationPermitted: false,
      forcedPathway: 'PROFESSIONAL_SUPPORT',
      userMessage:
        'Some of what you have told us is worth discussing with a clinician before we go further. ' +
        'We have paused automated progression in the meantime.',
    };
  }

  if (signals.includes('frailty') || signals.includes('unplanned_weight_loss')) {
    powers.push('activate_frailty_protection', 'block_weight_loss_plan', 'switch_to_maintenance');
    return {
      status: 'REVIEW_REQUIRED',
      signals,
      powersExercised: powers,
      reductionPermitted: false,
      automationPermitted: true,
      forcedPathway: 'OLDER_ADULT_INDEPENDENCE',
      userMessage:
        'We are prioritising strength, appetite and steadiness rather than weight change.',
    };
  }

  const requested = PATHWAY_DEFINITIONS[input.requestedPathway];

  if (input.requestsExtremeChange && requested.reductionPermitted) {
    powers.push('recommend_professional_assessment');
    return {
      status: 'LIMITED',
      signals,
      powersExercised: powers,
      reductionPermitted: true,
      automationPermitted: true,
      userMessage:
        'Your selected target requires rapid weight loss. A slower target is more likely to protect ' +
        'muscle, improve adherence and reduce rebound risk.',
    };
  }

  if (signals.length > 0) {
    return {
      status: 'LIMITED',
      signals,
      powersExercised: powers,
      reductionPermitted: requested.reductionPermitted,
      automationPermitted: requested.automationPermitted,
      userMessage: 'We have adjusted your plan to account for what you told us.',
    };
  }

  return {
    status: 'CLEARED',
    signals,
    powersExercised: powers,
    reductionPermitted: requested.reductionPermitted,
    automationPermitted: requested.automationPermitted,
    userMessage: '',
  };
}
