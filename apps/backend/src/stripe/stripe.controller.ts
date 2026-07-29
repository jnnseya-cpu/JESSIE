import { BadRequestException, Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  HANDLED_WEBHOOK_EVENTS,
  PLAN_DEFINITIONS,
  SIGNATURE_TOLERANCE_SECONDS,
  SUBSCRIPTION_STATES,
  WEBHOOK_EFFECTS,
  WEBHOOK_PATH,
  WebhookVerificationError,
} from '@jessmove/shared';
import { CheckoutDto, PortalDto, TopUpCheckoutDto } from './stripe.dto';
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

  @Post('checkout')
  checkout(@Body() body: CheckoutDto) {
    return this.stripe.createCheckoutSession(body);
  }

  @Post('topup')
  topup(@Body() body: TopUpCheckoutDto) {
    return this.stripe.createTopUpSession(body);
  }

  @Post('portal')
  portal(@Body() body: PortalDto) {
    return this.stripe.createPortalSession(body.customerId, body.returnUrl);
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
