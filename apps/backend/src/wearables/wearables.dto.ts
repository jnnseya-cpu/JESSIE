import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATA_SCOPES, PROVIDERS } from '@jessmove/shared';

export class ConnectDto {
  @IsString() @MaxLength(64) userId!: string;

  @IsIn(PROVIDERS as unknown as string[])
  provider!: (typeof PROVIDERS)[number];

  @IsUrl({ require_tld: false })
  redirectUri!: string;
}

export class CallbackDto extends ConnectDto {
  @IsString() @MaxLength(2048) code!: string;
}

export class SampleDto {
  /** Deliberately a free string: unknown scopes must reach the judge and be refused loudly. */
  @IsString() @MaxLength(64) scope!: string;
  @IsNumber() value!: number;
  @IsNumber() @Min(0) ageMinutes!: number;
}

export class IngestDto {
  @IsString() @MaxLength(64) userId!: string;

  @IsIn(PROVIDERS as unknown as string[])
  provider!: (typeof PROVIDERS)[number];

  @IsInt() @Min(10) @Max(120) age!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleDto)
  samples!: SampleDto[];
}

export class ScopesDto {
  @IsString() @MaxLength(64) userId!: string;

  @IsIn(PROVIDERS as unknown as string[])
  provider!: (typeof PROVIDERS)[number];

  @IsArray()
  @IsIn(DATA_SCOPES as unknown as string[], { each: true })
  scopes!: (typeof DATA_SCOPES)[number][];
}

export class RevokeDto {
  @IsString() @MaxLength(64) userId!: string;

  @IsIn(PROVIDERS as unknown as string[])
  provider!: (typeof PROVIDERS)[number];
}
