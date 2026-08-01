import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Humans-only proof, shared by both doors. */
export class HumanCheck {
  /** Signed challenge issued by GET /auth/challenge. */
  @IsString() @MaxLength(2048) challenge!: string;

  /** Honeypot. Humans never see it; anything in it fails validation. */
  @IsOptional() @IsString() @MaxLength(0) website?: string;
}


export class RegisterDto extends HumanCheck {
  @IsEmail() email!: string;

  /** Length is the only rule. Composition rules push people to Password1! */
  @IsString() @MinLength(10) @MaxLength(200) password!: string;

  @IsString() @MinLength(2) @MaxLength(40) displayName!: string;

  /** Verified age band comes later; self-declared age still gates everything. */
  @IsInt() @Min(10) @Max(120) age!: number;

  @IsOptional() @IsEmail() guardianEmail?: string;
}

export class LoginDto extends HumanCheck {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}

export class UpdateNameDto {
  @IsString() @MinLength(2) @MaxLength(40) displayName!: string;
}

export class MediaUploadDto {
  @IsIn(['avatar', 'cover'])
  slot!: 'avatar' | 'cover';

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType!: string;

  @IsString()
  @MaxLength(15_000_000)
  dataBase64!: string;
}

export class DeleteAccountDto {
  @IsString() @MinLength(10) @MaxLength(200) password!: string;
}


export class ForgotDto extends HumanCheck {
  @IsEmail() email!: string;
}

export class ResetDto {
  @IsString() @MaxLength(2048) token!: string;
  @IsString() @MinLength(10) @MaxLength(200) password!: string;
}
