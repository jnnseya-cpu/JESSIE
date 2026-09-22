import type { BodyPathway, SafetyStatus, TwinState } from './pathways';

/**
 * §6 — The Autonomous Body Plan, and §15 core product objects.
 *
 * Agent 12 — Minimum Effective Change: select the smallest intervention
 * with the highest predicted impact. The plan is deliberately capped at
 * six slots so the user is never handed fifteen simultaneous tasks.
 */

export interface CommandAction {
  id: string;
  /** What the user actually does. One sentence, imperative, concrete. */
  instruction: string;
  category: 'anchor' | 'food' | 'movement' | 'strength' | 'recovery' | 'power_up';
  estimatedMinutes: number;
  /**
   * 0–1, from the Dynamic Adherence Agent — and `null` until that agent
   * actually runs.
   *
   * It was a number, and the numbers were written by hand. Every adult
   * received 0.71 for the walk and 0.66 for the drink swap whatever the
   * platform knew about them, which is a prediction about a named person
   * that nothing predicted. Nullable is the honest shape: a caller can
   * tell "we have not modelled this" from "we think it is unlikely",
   * which a hardcoded 0.52 cannot express.
   */
  completionProbability: number | null;
  /**
   * Why this action — a property of the action, never a finding about
   * the member.
   *
   * "Protecting muscle matters more than the scale" is the first kind
   * and is fine. "Your evening meals are already balanced" is the
   * second: it reads as something measured, nothing measured it, and on
   * a health surface an invented observation about somebody's diet is
   * not a wording problem. Until an agent produces these from data, they
   * say what is true of the action for anybody.
   */
  rationale: string;
}

export interface DailyBodyCommand {
  id: string;
  userId: string;
  date: string;
  /** The action that happens even on a difficult day. Always present. */
  anchorAction: CommandAction;
  foodAction?: CommandAction;
  movementAction?: CommandAction;
  strengthAction?: CommandAction;
  recoveryAction?: CommandAction;
  optionalPowerUp?: CommandAction;
  estimatedACUs: number;
  reasonCodes: string[];
  /** No plan may be delivered without the guardian's approval. */
  safetyApproved: boolean;
}

export interface BodyCommandProfile {
  userId: string;
  pathway: BodyPathway;
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  bmi?: number;
  waistToHeightRatio?: number;
  currentState: TwinState;
  safetyStatus: SafetyStatus;
  targetRange?: {
    minimum?: number;
    maximum?: number;
    unit: 'KG' | 'BMI' | 'WAIST_CM' | 'FUNCTION_SCORE';
  };
  confidenceScore: number;
}

export interface BehaviourPattern {
  id: string;
  userId: string;
  /** Trigger → Decision → Immediate Reward → Longer-Term Effect → Replacement. */
  trigger: string;
  behaviour: string;
  immediateReward?: string;
  estimatedImpact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  confidence: number;
  replacementAction?: string;
  detectedAt: string;
}

/**
 * Agent 13 — Dynamic Adherence ranking.
 *
 *   rank = (health value × safety × completion probability) ÷ friction
 *
 * Safety is a multiplier, so a zero-safety action ranks zero regardless
 * of how valuable or easy it is. It cannot be outvoted.
 */
export interface RankingInput {
  healthValue: number;
  /** 0 or 1. The guardian's verdict, not a matter of degree. */
  safety: 0 | 1;
  completionProbability: number;
  /** Strictly positive. How much effort the action costs the user. */
  friction: number;
}

export function rankRecommendation(input: RankingInput): number {
  if (input.friction <= 0) {
    throw new RangeError('friction must be greater than zero');
  }
  return Number(
    (
      (input.healthValue * input.safety * input.completionProbability) /
      input.friction
    ).toFixed(4),
  );
}

/** The plan may never exceed six actions. §6. */
export const MAX_DAILY_ACTIONS = 6;

export function countActions(plan: DailyBodyCommand): number {
  return [
    plan.anchorAction,
    plan.foodAction,
    plan.movementAction,
    plan.strengthAction,
    plan.recoveryAction,
    plan.optionalPowerUp,
  ].filter(Boolean).length;
}

/** Calibration runs 7–14 days before any change is pushed. §14. */
export const CALIBRATION_DAYS = { min: 7, max: 14 } as const;
