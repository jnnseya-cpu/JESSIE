import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  BODY_PATHWAYS,
  ESCALATION_SIGNALS,
  type BodyPathway,
  type EscalationSignal,
} from '@jessmove/body-command';

/**
 * Body assessment input.
 *
 * Bounds are deliberately generous but finite. A height of 40cm or a
 * weight of 900kg is a client bug or a probe, and either way it must not
 * reach a service that will happily compute a BMI from it and present the
 * result to a person.
 */
export class BodyAssessmentDto {
  @IsString()
  userId!: string;

  /**
   * Verified age. It selects the mode, and below 18 it forces the growth
   * pathway with automation off — so it is required, never inferred.
   */
  @IsInt()
  @Min(10)
  @Max(120)
  age!: number;

  @IsOptional()
  @IsIn(BODY_PATHWAYS)
  requestedPathway?: BodyPathway;

  @IsOptional()
  @IsArray()
  @IsIn(ESCALATION_SIGNALS, { each: true })
  signals?: EscalationSignal[];

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(260)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(400)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(250)
  waistCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  measurementCount?: number;

  @IsOptional()
  @IsBoolean()
  muscularityIndicated?: boolean;

  @IsOptional()
  @IsBoolean()
  requestsExtremeChange?: boolean;

  /**
   * Adults only. `bodySurfacePolicy` does not consult this below 18 —
   * there is no consent that unlocks body metrics for a child — but it is
   * still validated as a boolean so a truthy string cannot masquerade as
   * consent anywhere downstream.
   */
  @IsOptional()
  @IsBoolean()
  optedIntoBodyMetrics?: boolean;
}
