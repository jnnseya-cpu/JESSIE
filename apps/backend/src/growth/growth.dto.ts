import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PARTNER_KINDS, TRUST_SIGNALS, type PartnerKind, type TrustSignal } from '@jessmove/shared';

/** Money in, money out — every field bounded. */
export class RevenueDto {
  @IsNumber() @Min(0) @Max(10_000_000) paymentReceivedGbp!: number;
  @IsOptional() @IsNumber() @Min(0) taxGbp?: number;
  @IsOptional() @IsNumber() @Min(0) paymentFeesGbp?: number;
  @IsOptional() @IsNumber() @Min(0) refundsGbp?: number;
  @IsOptional() @IsNumber() @Min(0) chargebacksGbp?: number;
  @IsOptional() @IsNumber() @Min(0) discountsGbp?: number;
  @IsOptional() @IsNumber() @Min(0) creditsGbp?: number;
  @IsOptional() @IsNumber() @Min(0) freeAcuValueGbp?: number;
  @IsOptional() @IsNumber() @Min(0) promotionalValueGbp?: number;
  @IsOptional() @IsNumber() @Min(0) fraudDeductionsGbp?: number;

  @IsIn(PARTNER_KINDS) kind!: PartnerKind;
  @IsInt() @Min(0) @Max(1_000_000) verifiedPaidReferrals!: number;
  @IsNumber() @Min(0) lifetimeAlreadyPaidGbp!: number;
}

export class TrustDto {
  @IsOptional() @IsIn(TRUST_SIGNALS, { each: true }) signals?: TrustSignal[];
  @IsOptional() @IsString() @MaxLength(120) referralId?: string;
}

export class PayoutDto {
  @IsNumber() @Min(-1_000_000) @Max(10_000_000) balanceGbp!: number;
  @IsBoolean() kycComplete!: boolean;
  @IsInt() @Min(0) @Max(3650) oldestEarningAgeDays!: number;
  @IsOptional() @IsNumber() @Min(0) clawbackGbp?: number;
}
