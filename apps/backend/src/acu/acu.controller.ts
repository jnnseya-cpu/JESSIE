import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ACU_ACTIONS,
  ACU_PER_GBP,
  COST_PROTECTION_MULTIPLE,
  MAX_ROLLOVER_ALLOCATIONS,
  SUBSCRIPTION_ACU_SHARE,
  WALLET_PRECEDENCE,
  WALLET_VALIDITY_DAYS,
  ZERO_ACU_ACTIONS,
  requiredAcus,
  type CostInput,
} from '@jessie-os/body-command';
import { WalletService, type SpendControls, type SpendRequest } from './wallet.service';

@Controller('acu')
export class AcuController {
  constructor(private readonly wallets: WalletService) {}

  /** The published economics. Nothing here is a secret from the customer. */
  @Get('policy')
  policy() {
    return {
      acuPerGbp: ACU_PER_GBP,
      costProtectionMultiple: COST_PROTECTION_MULTIPLE,
      subscriptionShare: SUBSCRIPTION_ACU_SHARE,
      walletPrecedence: WALLET_PRECEDENCE,
      validityDays: WALLET_VALIDITY_DAYS,
      maxRolloverAllocations: MAX_ROLLOVER_ALLOCATIONS,
      neverMetered: ZERO_ACU_ACTIONS,
      actionBands: ACU_ACTIONS,
      hardStop:
        'At zero balance, paid AI actions stop. Non-AI features continue and no debt is created.',
    };
  }

  /** Price an action before running it. */
  @Post('quote')
  quote(@Body() cost: CostInput) {
    const acus = requiredAcus(cost);
    return {
      acus,
      customerChargeGbp: Number((acus / ACU_PER_GBP).toFixed(4)),
      protectionMultiple: COST_PROTECTION_MULTIPLE,
    };
  }

  @Post('wallets')
  create(
    @Body()
    body: { subjectType: 'user' | 'family' | 'organisation'; subjectId: string; controls?: SpendControls },
  ) {
    return this.wallets.create(body.subjectType, body.subjectId, body.controls);
  }

  @Get('wallets/:id')
  balance(@Param('id') id: string) {
    const wallet = this.wallets.get(id);
    if (!wallet) return { found: false };
    return {
      found: true,
      balance: this.wallets.balance(id),
      grants: wallet.grants.filter((g) => g.remaining > 0),
      controls: wallet.controls,
      spentToday: wallet.spentToday,
      spentThisMonth: wallet.spentThisMonth,
    };
  }

  @Post('wallets/:id/subscription')
  deposit(@Param('id') id: string, @Body() body: { amountPaidGbp: number }) {
    const grant = this.wallets.depositSubscription(id, body.amountPaidGbp);
    return grant ?? { skipped: 'rollover cap reached' };
  }

  @Post('wallets/:id/topup')
  topup(@Param('id') id: string, @Body() body: { amountGbp: number; bonusAcus?: number }) {
    return this.wallets.purchase(id, body.amountGbp, body.bonusAcus ?? 0);
  }

  @Post('wallets/:id/spend')
  spend(@Param('id') id: string, @Body() body: Omit<SpendRequest, 'walletId'>) {
    return this.wallets.spend({ ...body, walletId: id });
  }
}
