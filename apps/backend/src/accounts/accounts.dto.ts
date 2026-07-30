import {
  IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import {
  ACCOUNT_KINDS, AVATAR_KINDS, COVER_KINDS, IMAGE_MIME_TYPES, PROFILE_VISIBILITY,
  type AccountKind, type AvatarKind, type CoverKind, type ProfileVisibility,
} from '@jessmove/shared';

/** Everything a profile write may carry. Bounds here, policy in the service. */
export class ProfilePatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(40) handle?: string;
  @IsOptional() @IsString() @MaxLength(40) pronouns?: string | null;
  @IsOptional() @IsString() @MaxLength(120) realName?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string | null;
  @IsOptional() @IsString() @MaxLength(20) locale?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsIn(PROFILE_VISIBILITY) visibility?: ProfileVisibility;
  @IsOptional() @IsIn(AVATAR_KINDS) avatarKind?: AvatarKind;
  @IsOptional() @IsString() @MaxLength(40) avatarPreset?: string | null;
  @IsOptional() @IsIn(COVER_KINDS) coverKind?: CoverKind;
  @IsOptional() @IsString() @MaxLength(40) coverPreset?: string | null;
}

export class SaveDto {
  /**
   * Verified age. The policy gate needs it and will not infer it — an
   * absent age must never fall through to the permissive branch.
   */
  @IsInt() @Min(10) @Max(120) age!: number;

  /** The version this edit was based on. Drives conflict detection. */
  @IsInt() @Min(0) basedOnVersion!: number;

  @IsObject() patch!: Record<string, unknown>;
}

export class MediaCheckDto {
  @IsIn(['avatar', 'cover']) slot!: 'avatar' | 'cover';
  @IsInt() @Min(10) @Max(120) age!: number;
  @IsString() @MaxLength(100) mimeType!: string;
  @IsNumber() @Min(0) @Max(100_000_000) bytes!: number;
  @IsInt() @Min(0) @Max(50_000) widthPx!: number;
  @IsInt() @Min(0) @Max(50_000) heightPx!: number;
}

export class UploadMediaDto {
  @IsIn(['avatar', 'cover']) slot!: 'avatar' | 'cover';
  @IsInt() @Min(10) @Max(120) age!: number;
  @IsString() @MaxLength(100) mimeType!: string;
  /** The file, base64-encoded. ~15MB of base64 covers the 10MB cover limit. */
  @IsString() @MinLength(8) @MaxLength(15_000_000) dataBase64!: string;
}

export class CreateAccountDto {
  @IsString() @MaxLength(120) userId!: string;
  @IsIn(ACCOUNT_KINDS) kind!: AccountKind;
  @IsInt() @Min(10) @Max(120) age!: number;
  @IsOptional() @IsString() @MaxLength(120) guardianId?: string;
}
