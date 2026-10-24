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
import { EVIDENCE_SOURCES, SWAP_CONSTRAINTS, UK_ALLERGENS } from '@jessmove/foodlens';

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
  /*
   * Optional, because most labels carry them and some do not, and a
   * required field would turn a partial label into a rejected scan.
   * Absent stays absent: there is no default here for the same reason
   * there is no zero in the ledger.
   */
  @IsOptional() @IsNumber() @Min(0) proteinG?: number;
  @IsOptional() @IsNumber() @Min(0) carbohydrateG?: number;
  @IsOptional() @IsNumber() @Min(0) fibreG?: number;
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

export class ReadBarcodeDto {
  @IsOptional()
  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType?: string;

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

  /**
   * Returns what the model actually said. Off unless asked for, because
   * a diagnostic in every response is a diagnostic nobody reads.
   */
  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}

/**
 * One product joining the ledger with the pack size a member actually
 * bought. Per-100g figures alone cannot be totalled — a total needs the
 * amount — so a product with no readable size contributes nothing rather
 * than a guess, exactly as the trolley behaves.
 */
export class LogEntryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  barcode?: string;

  /** As printed: "400g", "1.5 l", "4 x 125 g". */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantity?: string;

  /** Or the grams outright, when the client has already read the size. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50_000)
  grams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  kcalPer100g?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => Per100gDto)
  per100g?: Per100gDto;
}

/**
 * What a member declares about their food.
 *
 * `excludes` is the safety field: an allergen or a religious restriction,
 * absolute at every rung of the swap ladder. Capped in length and count
 * because it is matched against suggestion text, and an unbounded list of
 * long strings is a filter that costs more than the thing it filters.
 */
/**
 * One product in the trolley.
 *
 * `POST /foodlens/basket` was the only write endpoint on the API with no
 * DTO at all — its signature was an inline
 * `{ products?: BasketProduct[] }`, which TypeScript erases and the
 * global ValidationPipe therefore has nothing to validate against. An
 * adversarial sweep of all fifty write endpoints found exactly one
 * payload that got past the pipe, and this was it:
 *
 *   {"products": "AAAA…200 chars"}  ->  {"products": 200, …}
 *
 * A string is iterable, so `basketFrom` walked its characters and
 * answered that the member's trolley held two hundred items. Nothing was
 * written and no money was involved — it is a stateless calculator — but
 * it returned a confidently wrong number to somebody who asked what was
 * in their shopping, which is the kind of answer this product exists not
 * to give.
 *
 * Bounded as well as typed: a trolley is a trolley, and an unbounded
 * array of nested objects on an unauthenticated endpoint is a cost
 * somebody else can choose for you.
 */
export class BasketProductDto {
  @IsString()
  @MaxLength(20)
  barcode!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  /** As printed on the pack: "400g", "1.5 l", "4 x 125 g". */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  quantity?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  kcalPer100g?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => Per100gDto)
  per100g?: Per100gDto;
}

export class BasketDto {
  /** A weekly shop, not a warehouse. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BasketProductDto)
  products?: BasketProductDto[];
}

export class FoodConstraintsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cuisine?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  @ArrayMaxSize(40)
  excludes?: string[];

  /** Which of `SWAP_CONSTRAINTS` the member says apply to them. */
  @IsOptional()
  @IsArray()
  @IsIn(SWAP_CONSTRAINTS, { each: true })
  declared?: string[];
}
