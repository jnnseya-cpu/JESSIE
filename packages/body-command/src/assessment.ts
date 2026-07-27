/**
 * §3 — The Required-Level Engine.
 *
 * "The system must never present one rigid 'ideal weight'."
 *
 * It produces a Personal Health Range. BMI is one navigation signal
 * interpreted alongside others — never a verdict, never a beauty score.
 */

export type MeasurementUnit = 'KG' | 'BMI' | 'WAIST_CM' | 'FUNCTION_SCORE';

export type Direction = 'REDUCE' | 'MAINTAIN' | 'GAIN' | 'PROTECT_MUSCLE' | 'OBTAIN_REVIEW';

export interface PersonalHealthRange {
  /** Where the user currently sits. */
  currentPosition: string;
  /** Reduce, maintain, gain, protect muscle or obtain review. */
  appropriateDirection: Direction;
  /** A range, never a single perfect number. */
  operatingRange: { minimum: number; maximum: number; unit: MeasurementUnit };
  /** A manageable initial objective. */
  firstMilestone: string;
  /** Where the system switches from active change to stabilisation. */
  maintenanceZone: { minimum: number; maximum: number; unit: MeasurementUnit };
  /** 0–1. How reliable this assessment is. */
  confidence: number;
  /** What the system needs in order to improve confidence. */
  missingInformation: string[];
}

export interface AdiposityInput {
  age: number;
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  /** Number of distinct measurements available. Drives confidence. */
  measurementCount?: number;
  /** Declared indicators of high muscularity. BMI cannot distinguish muscle from fat. */
  muscularityIndicated?: boolean;
}

export interface AdiposityReading {
  bmi?: number;
  waistToHeightRatio?: number;
  /**
   * NICE recommends waist-to-height ratio alongside BMI for adults with
   * BMI below 35 as an estimate of central adiposity. Below 18 this is
   * never applicable — children require an age- and sex-adjusted centile.
   */
  waistToHeightApplicable: boolean;
  /** True when BMI alone is known to be an unreliable signal here. */
  bmiUnreliable: boolean;
  reasons: string[];
  confidence: number;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Number((weightKg / (m * m)).toFixed(1));
}

export function waistToHeight(waistCm: number, heightCm: number): number {
  return Number((waistCm / heightCm).toFixed(3));
}

/**
 * Agent 2 — BMI and Central-Adiposity Interpreter.
 * Calculates BMI but never uses it in isolation.
 */
export function interpretAdiposity(input: AdiposityInput): AdiposityReading {
  const reasons: string[] = [];
  const isMinor = input.age < 18;

  if (isMinor) {
    // Adult BMI categories must never be applied under 18. §11.
    return {
      waistToHeightApplicable: false,
      bmiUnreliable: true,
      reasons: [
        'Under 18 — adult BMI categories do not apply. An age- and sex-adjusted centile assessment is required.',
      ],
      confidence: 0,
    };
  }

  const value =
    input.weightKg && input.heightCm ? bmi(input.weightKg, input.heightCm) : undefined;
  const wthr =
    input.waistCm && input.heightCm ? waistToHeight(input.waistCm, input.heightCm) : undefined;

  let bmiUnreliable = false;

  if (input.muscularityIndicated) {
    bmiUnreliable = true;
    reasons.push('BMI cannot distinguish muscle from fat, and high muscularity is indicated.');
  }

  // NICE: consider waist-to-height ratio alongside BMI for adults with BMI < 35.
  const applicable = value !== undefined && value < 35;
  if (applicable && wthr === undefined) {
    reasons.push('A waist measurement would materially improve this assessment.');
  }
  if (value !== undefined && value >= 35) {
    reasons.push('Waist-to-height ratio adds little above a BMI of 35.');
  }

  const measurements = input.measurementCount ?? 1;
  let confidence = 0.4;
  if (value !== undefined) confidence += 0.2;
  if (wthr !== undefined) confidence += 0.2;
  if (measurements >= 3) confidence += 0.15;
  if (bmiUnreliable) confidence -= 0.2;

  return {
    bmi: value,
    waistToHeightRatio: wthr,
    waistToHeightApplicable: applicable,
    bmiUnreliable,
    reasons,
    confidence: Number(Math.max(0, Math.min(confidence, 0.95)).toFixed(2)),
  };
}

/**
 * §7 — The Body Trajectory Engine.
 * Three paths, never an exact completion date.
 */
export interface Trajectory {
  conservative: string;
  expected: string;
  optimised: string;
  mainDriver: string;
  primaryBlocker: string;
  confidence: 'low' | 'medium' | 'high';
  /** Days until the forecast is revisited. */
  reviewInDays: number;
}

export const TRAJECTORY_REVIEW_DAYS = 14;
