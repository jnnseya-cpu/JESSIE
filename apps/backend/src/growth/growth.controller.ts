import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  COMMISSION_RATE,
  COMMISSION_UNLOCK_REFERRALS,
  EXECUTIVE_APPROVAL_ABOVE_GBP,
  LADDER_ACU_REWARD,
  LIFETIME_CAP_PER_CUSTOMER_GBP,
  MANUAL_REVIEW_ABOVE_GBP,
  MONTHLY_CAP_GBP,
  NEVER_COMMISSIONABLE,
  PARTNER_KIND_DEFINITIONS,
  PAYOUT_MINIMUM_GBP,
  PAYOUT_RULES,
  PROGRAMME_SUMMARY,
  REFERRAL_TRANSITIONS,
  REVENUE_DEDUCTIONS,
  REWARD_LADDER,
  REWARD_PATH,
  RISK_PATH,
  TRUST_HOLD_THRESHOLD,
  TRUST_REJECT_THRESHOLD,
  TRUST_SIGNAL_DEFINITIONS,
  VALIDATION_WINDOW_DAYS,
  commissionFor,
  nextRung,
  payoutDecision,
  statusFor,
  trustScore,
} from '@jessmove/shared';
import { PayoutDto, RevenueDto, TrustDto } from './growth.dto';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';

@Controller('growth')
export class GrowthController {
  /** The published programme terms, in full. Partners see exactly this. */
  @Get('programme')
  programme() {
    return {
      summary: PROGRAMME_SUMMARY,
      ladder: REWARD_LADDER.map((r) => ({ ...r, acuReward: LADDER_ACU_REWARD[r.status] })),
      kinds: PARTNER_KIND_DEFINITIONS,
      commission: {
        rate: COMMISSION_RATE,
        unlockAt: COMMISSION_UNLOCK_REFERRALS,
        monthlyCapGbp: MONTHLY_CAP_GBP,
        lifetimeCapPerCustomerGbp: LIFETIME_CAP_PER_CUSTOMER_GBP,
        paidOn: 'verified net revenue',
        deductions: REVENUE_DEDUCTIONS,
        neverCommissionable: NEVER_COMMISSIONABLE,
      },
      trust: {
        signals: TRUST_SIGNAL_DEFINITIONS,
        holdBelow: TRUST_HOLD_THRESHOLD,
        rejectBelow: TRUST_REJECT_THRESHOLD,
        rewardPath: REWARD_PATH,
        riskPath: RISK_PATH,
        transitions: REFERRAL_TRANSITIONS,
      },
      payouts: {
        minimumGbp: PAYOUT_MINIMUM_GBP,
        validationWindowDays: VALIDATION_WINDOW_DAYS,
        manualReviewAboveGbp: MANUAL_REVIEW_ABOVE_GBP,
        executiveApprovalAboveGbp: EXECUTIVE_APPROVAL_ABOVE_GBP,
        rules: PAYOUT_RULES,
      },
    };
  }

  /** Where a partner sits on the ladder, and what is next. */
  @Get('ladder')
  ladder() {
    return REWARD_LADDER.map((r) => ({
      ...r,
      acuReward: LADDER_ACU_REWARD[r.status],
      statusAt: statusFor(r.paidReferrals),
      next: nextRung(r.paidReferrals),
    }));
  }

  /** Price a commission. Shows the working, not just the number. */
  @AdminOnly()
  @Post('commission')
  commission(@Body() body: RevenueDto) {
    const { kind, verifiedPaidReferrals, lifetimeAlreadyPaidGbp, ...revenue } = body;
    return commissionFor(
      {
        paymentReceivedGbp: revenue.paymentReceivedGbp,
        taxGbp: revenue.taxGbp ?? 0,
        paymentFeesGbp: revenue.paymentFeesGbp ?? 0,
        refundsGbp: revenue.refundsGbp ?? 0,
        chargebacksGbp: revenue.chargebacksGbp ?? 0,
        discountsGbp: revenue.discountsGbp ?? 0,
        creditsGbp: revenue.creditsGbp ?? 0,
        freeAcuValueGbp: revenue.freeAcuValueGbp ?? 0,
        promotionalValueGbp: revenue.promotionalValueGbp ?? 0,
        fraudDeductionsGbp: revenue.fraudDeductionsGbp ?? 0,
      },
      { kind, verifiedPaidReferrals, lifetimeAlreadyPaidGbp },
    );
  }

  /** Score a referral against the fraud signals. */
  @AdminOnly()
  @Post('trust')
  trust(@Body() body: TrustDto) {
    return { referralId: body.referralId ?? null, ...trustScore(body.signals ?? []) };
  }

  /** Can this balance be paid out right now, and if not, why not. */
  @AdminOnly()
  @Post('payout')
  payout(@Body() body: PayoutDto) {
    return payoutDecision(body);
  }
}
