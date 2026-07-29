import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AGE_MODES,
  LOCATION_CLASSES,
  MOTION_STATES,
  MOVEMENT_CATEGORIES,
  MOVEMENT_VARIANTS,
  SIGNAL_CLASSES,
  SNAP_DURATION_SECONDS,
  type LocationClass,
  type MotionState,
  type SignalClass,
} from '@movequest/shared';

/**
 * The request bodies, as validated classes rather than interfaces.
 *
 * A TypeScript interface is erased at build time, so a global
 * ValidationPipe cannot see it — the pipe runs, finds no metadata, and
 * passes anything straight through to the service. That is how a
 * malformed body reached `signals.motionState` and produced a 500 on an
 * endpoint whose documented contract is that it never hard-errors.
 *
 * These classes exist so a bad request is a 400 that names the offending
 * field, and the service only ever receives a shape it can rely on.
 */

/*
 * The permitted values are imported from @movequest/shared rather than
 * restated here. Hand-copying them is how a DTO silently drifts from the
 * domain it is supposed to guard.
 */

export class ContextSignalsDto {
  @IsString()
  userId!: string;

  @IsIn(MOTION_STATES)
  motionState!: MotionState;

  @IsIn(LOCATION_CLASSES)
  locationClass!: LocationClass;

  @IsBoolean()
  onCall!: boolean;

  @IsBoolean()
  doNotDisturb!: boolean;

  @IsOptional()
  @IsBoolean()
  inLesson?: boolean;

  @IsOptional()
  @IsBoolean()
  clinicallyFlaggedRest?: boolean;

  @IsInt()
  @Min(0)
  @Max(23)
  localHour!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(23, { each: true })
  quietHours?: [number, number];

  @IsInt()
  @Min(0)
  snapsDeliveredToday!: number;

  @IsInt()
  @Min(0)
  dailyCap!: number;

  @IsInt()
  @Min(0)
  minutesSinceLastNudge!: number;

  @IsArray()
  @IsIn(SIGNAL_CLASSES, { each: true })
  consentedSignals!: SignalClass[];
}

export class PrescriptionRequestDto {
  @IsString()
  userId!: string;

  @IsIn(AGE_MODES)
  mode!: (typeof AGE_MODES)[number];

  /**
   * How long the person actually has. Below the Snap floor there is
   * nothing to prescribe, so it is rejected rather than rounded up.
   */
  @IsInt()
  @Min(SNAP_DURATION_SECONDS.min)
  availableSeconds!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxRpe?: number;

  @IsOptional()
  @IsArray()
  @IsIn(MOVEMENT_CATEGORIES, { each: true })
  excludeCategories?: Array<(typeof MOVEMENT_CATEGORIES)[number]>;

  @ValidateNested()
  @Type(() => ContextSignalsDto)
  signals!: ContextSignalsDto;

  /**
   * Variants the capability profile permits. Never widened by the
   * service, so an empty list is a client bug rather than a licence to
   * offer everything.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MOVEMENT_VARIANTS, { each: true })
  permittedVariants!: Array<(typeof MOVEMENT_VARIANTS)[number]>;

  @IsNumber()
  @Min(0.1)
  @Max(3)
  capabilityNormaliser!: number;
}
