import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { POST_CATEGORIES, POST_STATUSES, type PostCategory } from '@jessmove/shared';

/**
 * Every request body is a class, not an interface. An interface is erased
 * at build time, so the global ValidationPipe finds no metadata and waves
 * the request through — which is how a malformed body becomes a 500
 * instead of a 400.
 */

export class DraftPostDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  topic!: string;

  @IsIn(POST_CATEGORIES)
  category!: PostCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(80)
  keyword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  clusterKey?: string;

  @IsOptional()
  @IsIn([true, false])
  strict?: boolean;
}

export class TransitionDto {
  @IsIn(POST_STATUSES)
  to!: (typeof POST_STATUSES)[number];

  /**
   * Required for `published`, and checked in the service rather than here,
   * so the error explains *why* a reviewer is needed rather than just
   * naming a missing field.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reviewer?: string;
}

export class ViewDto {
  @IsString()
  @MaxLength(120)
  slug!: string;

  /** Seconds on the page. Capped — an abandoned tab is not a two-hour read. */
  @IsInt()
  @Min(0)
  @Max(3600)
  dwellSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  scrollPercent!: number;

  /** Host only. The client strips the path before sending; the server re-checks. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  referrerHost?: string;

  @IsOptional()
  @IsIn(['mobile', 'tablet', 'desktop', 'unknown'])
  device?: 'mobile' | 'tablet' | 'desktop' | 'unknown';

  @IsOptional()
  @IsISO8601()
  at?: string;
}
