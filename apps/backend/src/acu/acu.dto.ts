import { Type } from 'class-transformer';
import {
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
import { MIN_TRANSACTION_GBP } from '@jessmove/shared';

/**
 * Money in, money out. Every bound here exists because the alternative is
 * a real financial defect rather than a cosmetic one.
 */

export class CostQuoteDto {
  /** Direct provider cost. Negative or absurd values must not price an action. */
  @IsNumber()
  @Min(0)
  @Max(100)
  providerCostGbp!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  infrastructureCostGbp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  dataCostGbp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  storageCostGbp?: number;

  /** Extra margin where provider cost is unpredictable. Capped at 20%. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.2)
  contingency?: number;
}

export class SubscriptionDepositDto {
  @IsNumber()
  @Min(0)
  @Max(10000)
  amountPaidGbp!: number;
}

export class TopUpDto {
  /**
   * Rejected below the minimum charge by `assertChargeable()` in the
   * service as well. Validating here means the caller gets a 400 that
   * names the field rather than a 500 from a thrown domain error.
   */
  @IsNumber()
  @Min(MIN_TRANSACTION_GBP)
  @Max(10000)
  amountGbp!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  bonusAcus?: number;
}

export class SpendDto {
  /** Which agent is spending. Charged against its own ceiling. */
  @IsString()
  agentCode!: string;

  /** Why, in words, for the decision log. */
  @IsString()
  reason!: string;

  @ValidateNested()
  @Type(() => CostQuoteDto)
  cost!: CostQuoteDto;
}

export class CreateWalletDto {
  @IsIn(['user', 'family', 'organisation'])
  subjectType!: 'user' | 'family' | 'organisation';

  @IsString()
  subjectId!: string;
}

export class GrantAcuDto {
  /** The account receiving the allowance. */
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  acus!: number;

  /** Recorded on the grant, e.g. "pilot testing allowance". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;
}
