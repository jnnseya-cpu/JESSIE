import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  assessSafety,
  bodyCommandScore,
  interpretAdiposity,
  PATHWAY_DEFINITIONS,
  rankRecommendation,
  requiredAcus,
  type BodyPathway,
  type CommandAction,
  type DailyBodyCommand,
  type EscalationSignal,
  type SafetyAssessment,
  type ScoreInput,
  type TwinState,
} from '@movequest/body-command';
import { bodySurfacePolicy, modeForAge, type AgeMode } from '@movequest/shared';

/**
 * BodyCommand, wired for both children and adults.
 *
 * The two audiences run the same engine and get materially different
 * surfaces. Charter C6 governs the difference: a child is assessed for
 * safety but is never shown a body number, a target or a comparison.
 */

export interface BodyAssessmentRequest {
  userId: string;
  age: number;
  requestedPathway?: BodyPathway;
  signals?: EscalationSignal[];
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  measurementCount?: number;
  muscularityIndicated?: boolean;
  requestsExtremeChange?: boolean;
  /** Adults only. Ignored under 18 — there is no consent that unlocks it. */
  optedIntoBodyMetrics?: boolean;
}

export interface BodyAssessmentResponse {
  userId: string;
  ageMode: AgeMode;
  pathway: BodyPathway;
  pathwayFocus: readonly string[];
  safety: SafetyAssessment;
  twinState: TwinState;
  /** Present only when the surface policy permits display. */
  metrics: {
    bmi?: number;
    waistToHeightRatio?: number;
    waistToHeightApplicable?: boolean;
    bmiUnreliable?: boolean;
    reasons: string[];
    confidence: number;
  } | null;
  /** Why metrics are or are not shown. Always populated. */
  surfacePolicy: { mayDisplay: boolean; mayTarget: boolean; reason: string };
  /** What the user actually sees framed as. */
  framing: string;
}

@Injectable()
export class BodyService {
  private readonly logger = new Logger(BodyService.name);

  assess(request: BodyAssessmentRequest): BodyAssessmentResponse {
    const ageMode = modeForAge(request.age);
    const isMinor = request.age < 18;

    // The guardian runs first and can only narrow.
    const safety = assessSafety({
      age: request.age,
      signals: request.signals ?? [],
      requestedPathway: request.requestedPathway ?? 'MAINTAIN',
      requestsExtremeChange: request.requestsExtremeChange,
    });

    const pathway = safety.forcedPathway ?? request.requestedPathway ?? 'MAINTAIN';

    // C6: consent cannot unlock body metrics for a minor.
    const policy = bodySurfacePolicy(request.age, request.optedIntoBodyMetrics ?? false);

    const reading = interpretAdiposity({
      age: request.age,
      heightCm: request.heightCm,
      weightKg: request.weightKg,
      waistCm: request.waistCm,
      measurementCount: request.measurementCount,
      muscularityIndicated: request.muscularityIndicated,
    });

    if (isMinor) {
      this.logger.log(
        `body.assess user=${request.userId} minor=true — assessed for safety, metrics withheld`,
      );
    }

    return {
      userId: request.userId,
      ageMode,
      pathway,
      pathwayFocus: PATHWAY_DEFINITIONS[pathway].focus,
      safety,
      twinState: this.twinStateFor(safety, reading.confidence),
      metrics: policy.mayDisplay
        ? {
            bmi: reading.bmi,
            waistToHeightRatio: reading.waistToHeightRatio,
            waistToHeightApplicable: reading.waistToHeightApplicable,
            bmiUnreliable: reading.bmiUnreliable,
            reasons: reading.reasons,
            confidence: reading.confidence,
          }
        : null,
      surfacePolicy: {
        mayDisplay: policy.mayDisplay,
        mayTarget: policy.mayTarget,
        reason: policy.reason,
      },
      framing: this.framingFor(ageMode, isMinor),
    };
  }

  /**
   * The daily plan. Capped at six actions, and the guardian must approve
   * before anything is returned.
   */
  plan(request: BodyAssessmentRequest): DailyBodyCommand {
    const assessment = this.assess(request);
    const isMinor = request.age < 18;

    const actions = isMinor
      ? this.childActions()
      : this.adultActions(assessment.pathway);

    const plan: DailyBodyCommand = {
      id: `bc_${randomUUID().slice(0, 8)}`,
      userId: request.userId,
      date: new Date().toISOString().slice(0, 10),
      anchorAction: actions.anchor,
      foodAction: actions.food,
      movementAction: actions.movement,
      strengthAction: actions.strength,
      recoveryAction: actions.recovery,
      optionalPowerUp: actions.powerUp,
      estimatedACUs: requiredAcus({ providerCostGbp: 0.02, infrastructureCostGbp: 0.005 }),
      reasonCodes: [
        `pathway:${assessment.pathway}`,
        `mode:${assessment.ageMode}`,
        `safety:${assessment.safety.status}`,
      ],
      safetyApproved: assessment.safety.status !== 'AUTOMATION_BLOCKED',
    };

    return plan;
  }

  /**
   * Children's actions are framed by growth, energy and confidence.
   * No portions, no targets, no numbers about the body.
   */
  private childActions() {
    return {
      anchor: this.action(
        'Do the two-minute Wake-Up Shake before school.',
        'anchor',
        2,
        0.82,
        'It is short, and it is the one that matters most today.',
      ),
      food: this.action(
        'Add one new colour to your plate at dinner.',
        'food',
        0,
        0.74,
        'More colours means more of the good stuff. No counting, no measuring.',
      ),
      movement: this.action(
        'Beat the Kettle — move until it boils.',
        'movement',
        3,
        0.79,
        'A game, not a workout.',
      ),
      strength: this.action(
        'Try five Superhero Holds.',
        'strength',
        2,
        0.68,
        'Building strong is about what your body can do.',
      ),
      recovery: this.action(
        'Screens down fifteen minutes before bed.',
        'recovery',
        0,
        0.61,
        'Sleep is when your body does the growing.',
      ),
      powerUp: this.action(
        'Show a grown-up one move you learned.',
        'power_up',
        2,
        0.55,
        'Teaching it makes it stick.',
      ),
    };
  }

  private adultActions(pathway: BodyPathway) {
    const strengthLed = pathway === 'RECOMPOSITION' || pathway === 'OLDER_ADULT_INDEPENDENCE';
    return {
      anchor: this.action(
        'Walk for ten minutes after lunch.',
        'anchor',
        10,
        0.71,
        'Your strongest completion window is straight after eating.',
      ),
      food: this.action(
        'Replace the afternoon sugary drink.',
        'food',
        0,
        0.66,
        'Your evening meals are already balanced. Drinks are the bigger opportunity.',
      ),
      movement: this.action(
        'Complete three desk-break Snaps.',
        'movement',
        6,
        0.78,
        'You have three real gaps in the calendar today.',
      ),
      strength: this.action(
        strengthLed
          ? 'Complete the six-minute lower-body session.'
          : 'Two sets of chair-supported presses.',
        'strength',
        6,
        strengthLed ? 0.58 : 0.64,
        'Protecting muscle matters more than the scale.',
      ),
      recovery: this.action(
        'Start bedtime preparation at 22:15.',
        'recovery',
        0,
        0.52,
        'Short sleep predicts tomorrow’s afternoon snacking for you.',
      ),
      powerUp: this.action(
        'Add one vegetable colour at dinner.',
        'power_up',
        0,
        0.49,
        'Optional. Skipping it costs nothing.',
      ),
    };
  }

  private action(
    instruction: string,
    category: CommandAction['category'],
    minutes: number,
    probability: number,
    rationale: string,
  ): CommandAction {
    return {
      id: `act_${randomUUID().slice(0, 6)}`,
      instruction,
      category,
      estimatedMinutes: minutes,
      completionProbability: probability,
      rationale,
    };
  }

  private twinStateFor(safety: SafetyAssessment, confidence: number): TwinState {
    if (safety.status === 'AUTOMATION_BLOCKED') return 'PURPLE';
    if (safety.status === 'REVIEW_REQUIRED') return 'RED';
    if (confidence < 0.3) return 'GREY';
    if (safety.status === 'LIMITED') return 'AMBER';
    return 'GREEN';
  }

  private framingFor(mode: AgeMode, isMinor: boolean): string {
    if (isMinor) {
      return 'Growth, energy, confidence, food variety, family routines, activity and sleep.';
    }
    if (mode === 'independence' || mode === 'vitality') {
      return 'Muscle, balance, mobility, hydration, appetite and staying independent.';
    }
    return 'Food quality, movement, strength, recovery and the behaviours behind them.';
  }

  /** §8 — the scorecard. BMI contributes nothing to it. */
  score(input: ScoreInput): number {
    return bodyCommandScore(input);
  }

  /** Agent 13 — adherence ranking. Safety is a multiplier, not a weight. */
  rank(
    healthValue: number,
    safe: boolean,
    completionProbability: number,
    friction: number,
  ): number {
    return rankRecommendation({
      healthValue,
      safety: safe ? 1 : 0,
      completionProbability,
      friction,
    });
  }
}
