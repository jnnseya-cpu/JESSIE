import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EVIDENCE_SOURCES, UK_ALLERGENS } from '@jessmove/foodlens';

export class DeclaredItemDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidencePct!: number;
}

export class Per100gDto {
  @IsNumber() @Min(0) fatG!: number;
  @IsNumber() @Min(0) saturatesG!: number;
  @IsNumber() @Min(0) sugarsG!: number;
  @IsNumber() @Min(0) saltG!: number;
}

export class GramsDto {
  @IsNumber() @Min(0) proteinG!: number;
  @IsNumber() @Min(0) carbohydrateG!: number;
  @IsNumber() @Min(0) fatG!: number;
}

export class PhotoDto {
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType!: string;

  @IsString()
  @MaxLength(15_000_000)
  dataBase64!: string;
}

export class AnalyzeDto {
  @IsInt()
  @Min(10)
  @Max(120)
  age!: number;

  @IsOptional()
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType?: string;

  /** ≤ 15_000_000 chars of base64 ≈ the 10MB photo ceiling. */
  @IsOptional()
  @IsString()
  @MaxLength(15_000_000)
  dataBase64?: string;

  /**
   * Up to three photographs of the same meal. A second angle resolves
   * depth, which is most of portion size — the capture checks ask for
   * one, so the request has to be able to carry it.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos?: PhotoDto[];

  @IsOptional()
  @IsString()
  @MaxLength(48)
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(6000)
  userConfirmedKcal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(6000)
  declaredKcal?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeclaredItemDto)
  declaredItems?: DeclaredItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => Per100gDto)
  per100g?: Per100gDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GramsDto)
  grams?: GramsDto;

  @IsOptional()
  @IsIn(EVIDENCE_SOURCES as unknown as string[])
  allergenSource?: (typeof EVIDENCE_SOURCES)[number];

  @IsOptional()
  @IsArray()
  @IsIn(UK_ALLERGENS as unknown as string[], { each: true })
  allergensPresent?: (typeof UK_ALLERGENS)[number][];

  @IsOptional()
  @IsBoolean()
  allergensFullList?: boolean;
}
