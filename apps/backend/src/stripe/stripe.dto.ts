import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { BILLING_PLANS, MIN_TRANSACTION_GBP, type BillingPlan } from '@jessmove/shared';

export class CheckoutDto {
  @IsString() @MaxLength(120) userId!: string;
  @IsIn(BILLING_PLANS) plan!: BillingPlan;
  @IsOptional() @IsInt() @Min(1) @Max(10_000) quantity?: number;
  @IsUrl({ require_tld: false }) successUrl!: string;
  @IsUrl({ require_tld: false }) cancelUrl!: string;
}

export class TopUpCheckoutDto {
  @IsString() @MaxLength(120) userId!: string;
  /** The £5 floor is enforced here and again in the service. */
  @IsNumber() @Min(MIN_TRANSACTION_GBP) @Max(1000) amountGbp!: number;
  @IsUrl({ require_tld: false }) successUrl!: string;
  @IsUrl({ require_tld: false }) cancelUrl!: string;
}

/**
 * The portal is opened for the caller's own account.
 *
 * `customerId` used to be the only field, taken straight from the body and
 * passed to Stripe — so the request decided whose billing to open. It is
 * now resolved server-side from `userId`, which `@SelfOnly` has already
 * proved belongs to the session.
 */
export class PortalDto {
  @IsString() @MaxLength(120) userId!: string;
  @IsUrl({ require_tld: false }) returnUrl!: string;
}
