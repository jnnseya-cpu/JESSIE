import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AGE_MODES,
  CONTRAINDICATIONS,
  ENVIRONMENTS,
  MOVEMENT_VARIANTS,
  SNAP_DURATION_SECONDS,
  type AgeMode,
  type ContraindicationCode,
  type Environment,
  type MovementVariant,
  type MovementVector,
  type PublishState,
} from '@jessmove/shared';

/**
 * Who reviewed a movement, and when.
 *
 * Required rather than optional because the database requires it:
 * `published_requires_review` in migration 0001 refuses any published row
 * without both. Validating here turns a constraint violation into a
 * readable 400, and means the reviewer is recorded against the movement
 * rather than inferred from whoever was holding an admin session.
 *
 * Not an enum of staff ids, because the reviewer is a clinician outside
 * this system — a physiotherapy registration number, a name, whatever the
 * organisation can later be held to. The point is that it is *somebody*,
 * and that the record says who.
 */
export class PublishReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  physioReviewerId!: string;

  /** The date of the review, not the date of the publish. */
  @IsISO8601()
  reviewDate!: string;
}

/* ------------------------------------------------------------------ *
 * The movement library's write route
 * ------------------------------------------------------------------ */

/**
 * `POST /movements` had no DTO.
 *
 * Its body was typed `Movement`, which is an interface in
 * `@jessmove/shared`. TypeScript erases an interface at compile time, so
 * the global ValidationPipe — `whitelist`, `forbidNonWhitelisted`,
 * `transform` — had no class to validate against and let the body
 * through untouched. This is the same root cause as the basket endpoint
 * that reported a two-hundred-item shop from a two-hundred-character
 * string: a type is not a validator.
 *
 * The consequence here is larger than a wrong number. This route writes
 * the movement library, which is health content. The publishing gate and
 * the `published_requires_review` constraint still stand behind it, so
 * nothing unreviewed could reach the public — but an admin session could
 * write arbitrary fields into a clinical record, and nothing said no.
 *
 * Every enum below is derived from the shared constant rather than
 * restated, so a new variant, environment or contraindication cannot be
 * added to the platform and silently rejected here.
 */

/** The 9-dimension Movement Vector, validated against its own axes. §10.1. */
export class MovementVectorDto {
  @IsIn(['mobilise', 'lengthen', 'activate', 'circulate', 'decompress', 'settle', 'orient'])
  intent!: MovementVector['intent'];

  @IsIn([
    'cervical',
    'thoracic',
    'lumbar',
    'shoulder',
    'hip',
    'knee',
    'ankle',
    'wrist',
    'whole_body',
  ])
  region!: MovementVector['region'];

  @IsIn(['sagittal', 'frontal', 'transverse', 'multi'])
  plane!: MovementVector['plane'];

  @IsIn(['none', 'bodyweight_partial', 'bodyweight_full', 'external'])
  load!: MovementVector['load'];

  @IsInt()
  @Min(0)
  @Max(3)
  neuroDemand!: MovementVector['neuroDemand'];

  @IsIn(['none', 'paced', 'extended_exhale'])
  breath!: MovementVector['breath'];

  @IsIn(['proprioceptive', 'vestibular', 'interoceptive'])
  sensory!: MovementVector['sensory'];

  /** Square metres. A Snap that needs a hall is not a Snap. */
  @IsNumber()
  @Min(0)
  @Max(20)
  footprintM2!: number;

  @IsInt()
  @Min(0)
  @Max(3)
  conspicuousness!: MovementVector['conspicuousness'];
}

/** Cue text for one variant in one age mode. */
export class CueSetDto {
  @IsIn(AGE_MODES)
  ageMode!: AgeMode;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  instructions!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  safetyNote?: string;
}

export class MovementVariantRecordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsIn(MOVEMENT_VARIANTS)
  variant!: MovementVariant;

  @ValidateNested()
  @Type(() => MovementVectorDto)
  vector!: MovementVectorDto;

  @IsArray()
  @ArrayMaxSize(CONTRAINDICATIONS.length)
  @IsIn(CONTRAINDICATIONS, { each: true })
  contraindications!: ContraindicationCode[];

  @IsArray()
  @ArrayMaxSize(ENVIRONMENTS.length)
  @IsIn(ENVIRONMENTS, { each: true })
  environments!: Environment[];

  /*
   * Bounded by the Snap definition rather than by an arbitrary ceiling.
   * The publishing gate already refuses anything outside this range; a
   * 400 here says so before the row is written instead of after.
   */
  @IsInt()
  @Min(SNAP_DURATION_SECONDS.min)
  @Max(SNAP_DURATION_SECONDS.max)
  durationSeconds!: number;

  @IsArray()
  @ArrayMaxSize(AGE_MODES.length)
  @ValidateNested({ each: true })
  @Type(() => CueSetDto)
  cueSets!: CueSetDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructionText?: string;

  @IsBoolean()
  screeningPassed!: boolean;

  /** Who signed the safety screening. §23. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  screenedBy?: string;

  @IsOptional()
  @IsISO8601()
  screenedAt?: string;
}

export class MovementUpsertDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  /*
   * A slug reaches a public URL, so it is constrained to what a URL can
   * carry rather than to "a string".
   */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by single hyphens',
  })
  @MaxLength(120)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsIn(['draft', 'in_review', 'published', 'retired'])
  state!: PublishState;

  /*
   * Five variants are required to publish and no more than five exist,
   * so a longer array is a mistake, not a richer movement.
   */
  @IsArray()
  @ArrayMaxSize(MOVEMENT_VARIANTS.length)
  @ValidateNested({ each: true })
  @Type(() => MovementVariantRecordDto)
  variants!: MovementVariantRecordDto[];

  @IsISO8601()
  createdAt!: string;

  @IsISO8601()
  updatedAt!: string;
}
