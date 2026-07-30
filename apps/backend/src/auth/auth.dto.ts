import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;

  /** Length is the only rule. Composition rules push people to Password1! */
  @IsString() @MinLength(10) @MaxLength(200) password!: string;

  @IsString() @MinLength(2) @MaxLength(40) displayName!: string;

  /** Verified age band comes later; self-declared age still gates everything. */
  @IsInt() @Min(10) @Max(120) age!: number;

  @IsOptional() @IsEmail() guardianEmail?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(200) password!: string;
}
