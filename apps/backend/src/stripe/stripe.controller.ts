import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  HANDLED_WEBHOOK_EVENTS,
  PAST_DUE_GRACE_DAYS,
  PLAN_DEFINITIONS,
  SIGNATURE_TOLERANCE_SECONDS,
  SUBSCRIPTION_STATES,
  WEBHOOK_EFFECTS,
  WEBHOOK_PATH,
  WebhookVerificationError,
} from '@jessmove/shared';
import { CheckoutDto, PortalDto, TopUpCheckoutDto } from './stripe.dto';
import { SelfOnly } from '../auth/auth.guard';
import { StripeService } from './stripe.service';
import { verifyWebhook } from './signature';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripe: StripeService) {}

  /** Is Stripe wired up, and what is still missing. Safe to expose. */
  @Get('status')
  status() {
    return this.stripe.status();
  }

  /** The plans, and which environment variable carries each Price ID. */
  @Get('plans')
  plans() {
    return {
      plans: Object.values(PLAN_DEFINITIONS),
      subscriptionStates: SUBSCRIPTION_STATES,
      handledEvents: HANDLED_WEBHOOK_EVENTS.map((e) => ({ type: e, effect: WEBHOOK_EFFECTS[e] })),
      webhookPath: WEBHOOK_PATH,
      signatureToleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
      note: 'Price IDs live in configuration, never in code.',
    };
  }

  /*
   * All three of these name an account or a Stripe customer, and all three
   * were open. `@SelfOnly` is what the rest of the platform uses for that
   * shape and it belongs here more than anywhere else, because these are
   * the routes that touch money.
   */

  /**
   * A member's own billing state, and whether it entitles them right now.
   *
   * `entitledNow` is the only thing that answers that question honestly,
   * because `state` alone does not: `past_due` reads as unpaid and still
   * entitles for the grace period, and it stops entitling once the grace
   * period runs out. Reporting the raw state would put the frontend in
   * charge of that arithmetic, and a boundary the frontend computes is a
   * boundary that is not enforced.
   */
  @SelfOnly('userId')
  @Get('subscription/:userId')
  async subscription(@Param('userId') userId: string) {
    const record = await this.stripe.subscriptionFor(userId);
    return {
      subscription: record,
      entitled: await this.stripe.entitledNow(userId),
      graceDays: PAST_DUE_GRACE_DAYS,
    };
  }

  @SelfOnly('userId')
  @Post('checkout')
  checkout(@Body() body: CheckoutDto) {
    return this.stripe.createCheckoutSession(body);
  }

  @SelfOnly('userId')
  @Post('topup')
  topup(@Body() body: TopUpCheckoutDto) {
    return this.stripe.createTopUpSession(body);
  }

  /**
   * The Billing Portal, for the signed-in member's own customer record.
   *
   * This took a `customerId` from the request body with no session at all.
   * A Stripe customer id is not a secret — it travels in checkout
   * redirects, receipts and support threads — and the portal it opens can
   * cancel the subscription, read every past invoice and change the card
   * on file. Anybody holding one could do all of that to somebody else's
   * account, from an unauthenticated POST.
   *
   * The customer is now resolved from the session on the server. The
   * request no longer says whose billing to open, because that was never
   * the caller's to decide.
   */
  @SelfOnly('userId')
  @Post('portal')
  async portal(@Body() body: PortalDto) {
    const customerId = await this.stripe.customerIdFor(body.userId);
    if (!customerId) {
      throw new BadRequestException('this account has no billing record yet');
    }
    return this.stripe.createPortalSession(customerId, body.returnUrl);
  }

  /**
   * The webhook.
   *
   * Verified against the RAW body — `rawBody: true` in main.ts is what
   * makes that possible, and without it every signature check would fail
   * because JSON.parse followed by JSON.stringify produces a different
   * string.
   *
   * A verification failure is a 400: the request did not come from Stripe,
   * or it is a replay. Everything that verifies returns 200, including
   * event types this platform ignores — a 4xx on an unknown type makes
   * Stripe retry it for three days and then disable the endpoint.
   */
  @Post('webhook')
  webhook(@Req() req: Request, @Headers('stripe-signature') signature?: string) {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException(
        'the raw request body is unavailable — the app must be created with rawBody: true',
      );
    }

    let event: Record<string, unknown>;
    try {
      event = verifyWebhook(raw.toString('utf8'), signature, this.stripe.webhookSecret());
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.stripe.applyEvent(event);
  }
}
