import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ACTION_KINDS,
  BRIEF_CHANNELS,
  SOURCE_FAMILIES,
  type ActionKind,
  type BriefChannel,
  type SourceFamily,
} from '@jessmove/shared';

/**
 * Classes, not types.
 *
 * Every body on this controller binds to a class with validators on it,
 * because the global ValidationPipe needs a class to validate against and
 * an interface is erased at compile time. The platform has already been
 * bitten by that twice — a string read as a two-hundred-item shopping
 * basket, and an unvalidated write to the movement library — and
 * `body-validation.test.ts` now fails the build if a `@Body()` here
 * stops being a class.
 */

export class ObservationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceId!: string;

  @IsIn(SOURCE_FAMILIES)
  sourceFamily!: SourceFamily;

  /** Stable per source. This is what makes a replay a duplicate. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sourceRecordId!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'topicId must be lowercase words separated by single hyphens',
  })
  @MaxLength(120)
  topicId!: string;

  @IsString()
  @MaxLength(60)
  metric!: string;

  /*
   * A count, not a rate per million. Bounded because an unbounded value
   * dominates a median and an unbounded array of them is a memory
   * problem, and because nothing this platform counts is ever this large.
   */
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  value!: number;

  @IsIn(['count', 'rate', 'index'])
  unit!: 'count' | 'rate' | 'index';

  @IsISO8601()
  observedAt!: string;

  @IsISO8601()
  windowStart!: string;

  @IsISO8601()
  windowEnd!: string;

  /** Observed over expected, as a fraction. Not a percentage. */
  @IsNumber()
  @Min(0)
  @Max(1)
  coverage!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  evidenceHash?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUri?: string;
}

export class ObservationBatchDto {
  /*
   * Five hundred, matching the specification's batch ceiling. A batch is
   * a batch; a producer with more than this has a backfill, and a
   * backfill that arrives as one request is a request that times out
   * halfway through and gets retried from the beginning.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ObservationDto)
  observations!: ObservationDto[];
}

export class ScoreTopicDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(120)
  topicId!: string;

  /*
   * Fit, intent and readiness come from the platform's own topic map and
   * are passed in verified. The specification is explicit that a model
   * may suggest them and that they take effect only from a verified
   * mapping, which is why they arrive as numbers on a request an
   * administrator makes rather than as something inferred here.
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  fit!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  intent!: number;

  /** Zero vetoes live activation. Nothing can be served that is not ready. */
  @IsNumber()
  @Min(0)
  @Max(100)
  readiness!: number;
}

export class DraftBriefDto {
  @IsString()
  @MaxLength(80)
  snapshotId!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(120)
  topicId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  audience!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  intent!: string;

  /*
   * Identifiers, never text. The claim's words are resolved from the
   * approved revision server-side, so a brief cannot carry a sentence
   * nobody signed off on — which on a platform that writes about bodies
   * is the difference between a draft and a liability.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  approvedClaimIds!: string[];

  @IsString()
  @MaxLength(128)
  ctaId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BRIEF_CHANNELS.length)
  @IsIn(BRIEF_CHANNELS, { each: true })
  allowedChannels!: BriefChannel[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  prohibitedClaims?: string[];

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  objective!: string;

  @IsInt()
  @Min(1)
  policyVersion!: number;

  /** Breaking topics expire in a day rather than a week. */
  @IsOptional()
  @IsBoolean()
  breaking?: boolean;
}

export class ApproveBriefDto {
  @IsString()
  @MaxLength(200)
  briefId!: string;

  @IsInt()
  @Min(1)
  briefVersion!: number;

  /**
   * The person, named.
   *
   * Not taken from the session, deliberately. The reviewer may be a
   * clinician or an editor outside this system, and the point of the
   * record is that it says who is accountable rather than who happened to
   * be holding an admin token.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  approver!: string;
}

export class ProposeActionDto {
  @IsString()
  @MaxLength(200)
  briefId!: string;

  @IsInt()
  @Min(1)
  briefVersion!: number;

  @IsIn(BRIEF_CHANNELS)
  channel!: BriefChannel;

  @IsIn(ACTION_KINDS)
  actionKind!: ActionKind;

  /** A post slug. The only kind of target v1 has an adapter for. */
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(200)
  targetId!: string;

  /*
   * Deliberately an object rather than a typed pair, because the patchable
   * field set belongs to the action kind and lives in `PATCHABLE_FIELDS`.
   * The service refuses any key outside that allowlist and `columnFor`
   * refuses again before anything reaches an UPDATE, so two independent
   * checks stand between this and SQL.
   */
  @IsObject()
  patch!: Record<string, string>;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  author!: string;
}

export class ApproveActionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  approver!: string;

  /**
   * The hash of what the approver actually read.
   *
   * Sent by the console rather than recomputed here, so that approving
   * means approving the bytes that were on screen. If the patch has
   * changed since, the hashes differ and the approval is refused.
   */
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  payloadHash!: string;
}

export class RollbackActionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  approver!: string;
}
