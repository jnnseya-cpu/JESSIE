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
import {
  EVIDENCE_SOURCES,
  NUTRI_CATEGORIES,
  NUTRI_GRADES,
  SWAP_CONSTRAINTS,
  UK_ALLERGENS,
  type NovaGroup,
  type NutriCategory,
  type NutriGrade,
} from '@jessmove/foodlens';

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
  /*
   * All seven optional, because a label is not a schema.
   *
   * The front-of-pack four were required here and the three below were
   * not, with the comment arguing for optional sitting under the wrong
   * half of the list. The consequence was not theoretical: a product
   * whose record carries fat but no salt — ordinary, and common on
   * fresh and own-brand lines — was rejected outright, so the shelf
   * scanner's trolley totals returned 400 for a great many real shops.
   *
   * Absent stays absent: there is no default here for the same reason
   * there is no zero in the ledger. A missing figure is left out of the
   * total and counted in `weighed`, which is the honest handling and was
   * already implemented downstream.
   */
  @IsOptional() @IsNumber() @Min(0) fatG?: number;
  @IsOptional() @IsNumber() @Min(0) saturatesG?: number;
  @IsOptional() @IsNumber() @Min(0) sugarsG?: number;
  @IsOptional() @IsNumber() @Min(0) saltG?: number;
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

  /*
   * The four readings, echoed back by the client from what the barcode
   * lookup already returned to it.
   *
   * Client-supplied, and worth saying why rather than leaving it to be
   * discovered. The alternative is for this endpoint to look each
   * barcode up again server-side, which would stop a client inventing a
   * grade — but a basket may hold two hundred items, and a caller
   * posting two hundred unseen barcodes would turn one request into two
   * hundred outbound lookups against a free, community-run database.
   * That is a worse failure than a member mis-stating the contents of
   * their own trolley, which affects nothing but their own arithmetic.
   *
   * So: validated tightly, bounded, and never trusted for anything but
   * this stateless calculation. Nothing here is stored and nothing here
   * reaches another member.
   */
  @IsOptional()
  @IsIn(NUTRI_GRADES)
  nutriGrade?: NutriGrade | null;

  @IsOptional()
  @IsIn(NUTRI_CATEGORIES)
  nutriCategory?: NutriCategory | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  novaGroup?: NovaGroup | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => BasketAdditiveDto)
  additives?: BasketAdditiveDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  origins?: string[];
}

/** An additive as the lookup reported it, echoed back for the basket view. */
export class BasketAdditiveDto {
  @IsString()
  @MaxLength(12)
  code!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(200)
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  regulatoryNote?: string;
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
