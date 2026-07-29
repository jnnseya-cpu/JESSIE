import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MESSAGE_CHANNELS,
  MOVA_PRESENCE,
  type MessageChannel,
  type TemplateToken,
} from '@jessmove/shared';

export class RecipientDto {
  @IsString()
  @MaxLength(120)
  userId!: string;

  /**
   * Verified age. It is the first thing the resolver reads and the only
   * rule with no override, so it is required rather than defaulted.
   */
  @IsInt()
  @Min(10)
  @Max(120)
  age!: number;

  @IsIn(MOVA_PRESENCE)
  presence!: (typeof MOVA_PRESENCE)[number];

  @IsIn(MESSAGE_CHANNELS, { each: true })
  consentedChannels!: MessageChannel[];

  @IsBoolean()
  inQuietHours!: boolean;

  @IsBoolean()
  contextHeld!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  coachingSentToday!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  dailyCap!: number;

  @IsBoolean()
  hasGuardian!: boolean;
}

export class SendEventDto {
  @IsString()
  @MaxLength(120)
  event!: string;

  @ValidateNested()
  @Type(() => RecipientDto)
  to!: RecipientDto;

  /** Template values. Unknown tokens are rejected at render, not here. */
  @IsOptional()
  @IsObject()
  values?: Partial<Record<TemplateToken, string>>;
}
