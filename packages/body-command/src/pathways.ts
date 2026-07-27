/**
 * §2 — The Objective Engine.
 *
 * "The system should never assume that a lower BMI is always better."
 *
 * Onboarding produces a Personal Body Objective in one of these modes.
 * Reduction is one pathway among nine, not the default.
 */
export const BODY_PATHWAYS = [
  'REDUCE',
  'WAIST',
  'MAINTAIN',
  'RECOMPOSITION',
  'GAIN',
  'CHILD_GROWTH',
  'OLDER_ADULT_INDEPENDENCE',
  'LIMITED_MOBILITY',
  'PROFESSIONAL_SUPPORT',
] as const;
export type BodyPathway = (typeof BODY_PATHWAYS)[number];

export interface PathwayDefinition {
  readonly pathway: BodyPathway;
  readonly label: string;
  readonly focus: readonly string[];
  /** Whether this pathway may run a weight-reduction plan at all. */
  readonly reductionPermitted: boolean;
  /** Whether fully automated guidance is appropriate without human review. */
  readonly automationPermitted: boolean;
}

export const PATHWAY_DEFINITIONS: Readonly<Record<BodyPathway, PathwayDefinition>> = {
  REDUCE: {
    pathway: 'REDUCE',
    label: 'Reduce',
    focus: ['sustainable food modification', 'reduced sedentary time', 'walking', 'muscle protection', 'sleep', 'behaviour triggers', 'long-term maintenance'],
    reductionPermitted: true,
    automationPermitted: true,
  },
  WAIST: {
    pathway: 'WAIST',
    label: 'Waist',
    focus: ['waist trend', 'food quality', 'movement', 'strength', 'sleep', 'sustainable energy balance'],
    reductionPermitted: true,
    automationPermitted: true,
  },
  MAINTAIN: {
    pathway: 'MAINTAIN',
    label: 'Maintain',
    focus: ['weight stability', 'movement', 'food diversity', 'strength', 'sleep', 'prevention of gradual gain'],
    reductionPermitted: false,
    automationPermitted: true,
  },
  RECOMPOSITION: {
    pathway: 'RECOMPOSITION',
    label: 'Strength Recomposition',
    focus: ['fat reduction with lean-tissue protection', 'progressive resistance', 'protein distribution', 'recovery'],
    reductionPermitted: true,
    automationPermitted: true,
  },
  GAIN: {
    pathway: 'GAIN',
    label: 'Gain Safely',
    focus: ['meal consistency', 'energy-dense nutritious foods', 'protein', 'strength', 'appetite support'],
    reductionPermitted: false,
    automationPermitted: true,
  },
  CHILD_GROWTH: {
    pathway: 'CHILD_GROWTH',
    label: 'Child Growth',
    focus: ['healthy development', 'family routines', 'movement', 'food variety', 'sleep', 'confidence'],
    // No child is ever placed on an automated weight-reduction plan.
    reductionPermitted: false,
    automationPermitted: false,
  },
  OLDER_ADULT_INDEPENDENCE: {
    pathway: 'OLDER_ADULT_INDEPENDENCE',
    label: 'Older-Adult Independence',
    focus: ['muscle preservation', 'balance', 'mobility', 'hydration', 'appetite', 'prevention of unintentional loss', 'functional independence'],
    reductionPermitted: false,
    automationPermitted: true,
  },
  LIMITED_MOBILITY: {
    pathway: 'LIMITED_MOBILITY',
    label: 'Limited Mobility',
    focus: ['seated activity', 'wheelchair movement', 'upper-body strength', 'adapted energy estimates', 'accessibility-first goals'],
    reductionPermitted: true,
    automationPermitted: true,
  },
  PROFESSIONAL_SUPPORT: {
    pathway: 'PROFESSIONAL_SUPPORT',
    label: 'Professional Support',
    focus: ['human review', 'user-controlled clinical summary', 'no automated progression'],
    reductionPermitted: false,
    automationPermitted: false,
  },
};

/** Digital Twin operating states. §4. */
export const TWIN_STATES = [
  'EMERALD',
  'GREEN',
  'AMBER',
  'ORANGE',
  'RED',
  'BLUE',
  'PURPLE',
  'GREY',
] as const;
export type TwinState = (typeof TWIN_STATES)[number];

export const TWIN_STATE_MEANING: Readonly<Record<TwinState, string>> = {
  EMERALD: 'Strong progress — safe and consistent.',
  GREEN: 'On track — the main trend is moving appropriately.',
  AMBER: 'Friction detected — one or more behaviours are weakening progress.',
  ORANGE: 'Intervention required — the existing plan is unlikely to achieve the objective.',
  RED: 'Safety escalation — automated progression pauses or is restricted.',
  BLUE: 'Maintenance — the user is in a stable personal range.',
  PURPLE: 'Specialist pathway — child, pregnancy, disability, frailty, eating disorder or professional care.',
  GREY: 'Insufficient data to assess.',
};

export const SAFETY_STATUSES = [
  'CLEARED',
  'LIMITED',
  'REVIEW_REQUIRED',
  'AUTOMATION_BLOCKED',
] as const;
export type SafetyStatus = (typeof SAFETY_STATUSES)[number];
