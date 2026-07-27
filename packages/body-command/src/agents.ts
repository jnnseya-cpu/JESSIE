/**
 * §5 — The BodyCommand AI Agent Force. Nineteen agents.
 *
 * Agent 17 (Safety and Escalation Guardian) has authority over every
 * other agent. That is expressed here as `supervisor: true` and enforced
 * in safety.ts, which no other agent may bypass.
 */

export const BC_AGENT_CODES = [
  'ORCH',
  'ADIPOSITY',
  'COMPOSITION',
  'FOODLENS',
  'ENERGY',
  'MICROMOVE',
  'STRENGTH',
  'SLEEP',
  'ROOTCAUSE',
  'ENVIRONMENT',
  'SCHEDULE',
  'MINCHANGE',
  'ADHERENCE',
  'PLATEAU',
  'PREDICTIVE',
  'RESTART',
  'GUARDIAN',
  'HUMAN',
  'ACU',
] as const;
export type BcAgentCode = (typeof BC_AGENT_CODES)[number];

export interface BcAgentDefinition {
  code: BcAgentCode;
  number: number;
  name: string;
  purpose: string;
  /** True only for the Safety and Escalation Guardian. */
  supervisor: boolean;
  /** Whether this agent may consume ACUs at all. */
  meteredAcu: boolean;
}

export const BC_AGENTS: Readonly<Record<BcAgentCode, BcAgentDefinition>> = {
  ORCH: { code: 'ORCH', number: 1, name: 'Master Health Orchestrator', purpose: 'Decides pathway, which agents activate, what happens today, what defers, when to ease off, when to progress, and when to stop autonomous guidance.', supervisor: false, meteredAcu: true },
  ADIPOSITY: { code: 'ADIPOSITY', number: 2, name: 'BMI and Central-Adiposity Interpreter', purpose: 'Calculates BMI but never uses it in isolation — interprets alongside waist-to-height, trend, muscularity, age and measurement confidence.', supervisor: false, meteredAcu: false },
  COMPOSITION: { code: 'COMPOSITION', number: 3, name: 'Body-Composition Protection', purpose: 'Prevents weight reduction becoming uncontrolled muscle loss. May change the objective from "lose more" to "stabilise, protect muscle, improve waist trend".', supervisor: false, meteredAcu: true },
  FOODLENS: { code: 'FOODLENS', number: 4, name: 'FoodLens Integration', purpose: 'Converts food analysis into personal actions — identifies the strongest single opportunity rather than rebuilding every meal.', supervisor: false, meteredAcu: true },
  ENERGY: { code: 'ENERGY', number: 5, name: 'Personal Energy-Balance', purpose: 'Estimates direction of energy balance with explicit ranges, confidence and main uncertainty. Optimises trends, not one-day perfection.', supervisor: false, meteredAcu: true },
  MICROMOVE: { code: 'MICROMOVE', number: 6, name: 'Micro-Movement Multiplier', purpose: 'Turns micro-movement into metabolic support — detects prolonged sitting and post-meal sedentary periods, delivers 2–5 minute breaks.', supervisor: false, meteredAcu: false },
  STRENGTH: { code: 'STRENGTH', number: 7, name: 'Strength and Muscle Guardian', purpose: 'Builds a minimum strength-protection structure, wheelchair-compatible and age-adaptive. Rewards strength consistency, not scale movement.', supervisor: false, meteredAcu: false },
  SLEEP: { code: 'SLEEP', number: 8, name: 'Sleep–Appetite Intelligence', purpose: 'Learns how sleep drives appetite, cravings and completion. Presented as a personal correlation, never a medical diagnosis.', supervisor: false, meteredAcu: true },
  ROOTCAUSE: { code: 'ROOTCAUSE', number: 9, name: 'Behaviour Root-Cause Investigator', purpose: 'Builds the chain: trigger → decision → immediate reward → longer-term effect → replacement → reinforcement.', supervisor: false, meteredAcu: true },
  ENVIRONMENT: { code: 'ENVIRONMENT', number: 10, name: 'Environment Architect', purpose: 'Changes the environment rather than demanding more willpower — shopping lists, item placement, emergency meals, takeaway shortlists, preparation windows.', supervisor: false, meteredAcu: true },
  SCHEDULE: { code: 'SCHEDULE', number: 11, name: 'Schedule and Friction', purpose: 'Embeds the plan into the calendar the user already has rather than asking them to build a new one.', supervisor: false, meteredAcu: true },
  MINCHANGE: { code: 'MINCHANGE', number: 12, name: 'Minimum Effective Change', purpose: 'Selects the smallest intervention with the highest predicted impact. Never issues fifteen simultaneous tasks.', supervisor: false, meteredAcu: true },
  ADHERENCE: { code: 'ADHERENCE', number: 13, name: 'Dynamic Adherence', purpose: 'Predicts completion and ranks by (health value × safety × completion probability) ÷ friction.', supervisor: false, meteredAcu: true },
  PLATEAU: { code: 'PLATEAU', number: 14, name: 'Plateau Intelligence', purpose: 'Distinguishes fluctuation, missing data, adherence drift, muscle gain and genuine plateau. Must not respond by aggressively reducing food.', supervisor: false, meteredAcu: true },
  PREDICTIVE: { code: 'PREDICTIVE', number: 15, name: 'Predictive Risk', purpose: 'Forecasts high-risk situations and builds preventive plans before the event occurs.', supervisor: false, meteredAcu: true },
  RESTART: { code: 'RESTART', number: 16, name: 'Restart and Recovery', purpose: 'Prevents one difficult period becoming abandonment. No punishment, no zeroing of progress.', supervisor: false, meteredAcu: true },
  GUARDIAN: { code: 'GUARDIAN', number: 17, name: 'Safety and Escalation Guardian', purpose: 'Authority over every other agent. Blocks weight-loss plans, suspends calorie targets, disables competition, restricts food scoring, forces maintenance or specialist pathways.', supervisor: true, meteredAcu: false },
  HUMAN: { code: 'HUMAN', number: 18, name: 'Human Escalation', purpose: 'Prepares a user-controlled summary for GP, dietitian, physiotherapist, trainer, pharmacist, specialist or carer. The user chooses what is shared.', supervisor: false, meteredAcu: true },
  ACU: { code: 'ACU', number: 19, name: 'ACU Optimisation', purpose: 'Routes each task to deterministic calculation, local processing, cache, low-cost AI, advanced AI, batch or human confirmation.', supervisor: false, meteredAcu: false },
};

/** Exactly one agent holds supervisory authority. Asserted in tests. */
export function supervisors(): BcAgentDefinition[] {
  return Object.values(BC_AGENTS).filter((a) => a.supervisor);
}

/** §13 — the eight machine-learning models behind the agent force. */
export const BC_MODELS = [
  'personal_adherence',
  'behaviour_sequence',
  'body_trajectory',
  'intervention_ranking',
  'lapse_prediction',
  'safety_anomaly',
  'provider_routing',
  'personal_language',
] as const;
export type BcModel = (typeof BC_MODELS)[number];

/**
 * §17 — Privacy firewall. Fields an employer must never receive.
 * Organisations get threshold-protected aggregate engagement only.
 */
export const EMPLOYER_PROHIBITED_FIELDS = [
  'bmi',
  'weight',
  'waist',
  'food_logs',
  'health_conditions',
  'medication_information',
  'meal_photographs',
  'individual_adherence',
  'predicted_health_risk',
] as const;
export type EmployerProhibitedField = (typeof EMPLOYER_PROHIBITED_FIELDS)[number];
