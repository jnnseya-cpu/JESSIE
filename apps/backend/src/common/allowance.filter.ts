import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { METERING_RULE } from '@jessmove/shared';
import { AllowanceExhaustedError } from '../ai/ai-gateway.service';

/**
 * An empty allowance is not a server error.
 *
 * Without this the gate throws and every caller sees a 500 — which reads
 * as "the platform is broken" when what happened is the platform working
 * exactly as designed. A 500 also tells a client to retry, and retrying is
 * the one thing that will never help here.
 *
 * 402 Payment Required is the honest code, and the body says the three
 * things somebody needs: what stopped, what still works, and what to do
 * about it. The wallet writes that sentence — it knows whether this was an
 * empty balance, a daily limit the member set themselves, or a spend that
 * needs a guardian's approval, and those want different responses.
 */
@Catch(AllowanceExhaustedError)
export class AllowanceFilter implements ExceptionFilter {
  catch(error: AllowanceExhaustedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    /*
     * The message is written where the refusal is raised, because that is
     * the only place that knows which refusal it is: no account at all, an
     * empty balance, a daily limit the member set themselves, or a spend
     * that needs a guardian's approval. Those want four different
     * responses and only one of them is "top up".
     */
    response.status(402).json({
      error: 'allowance_exhausted',
      reason: error.reason,
      message: error.memberMessage,
      required: error.detail.required,
      balance: error.detail.balance,
      agent: error.detail.agent,
      stillWorks:
        'Your history, your plan, your ledger, reminders and everything else that is not AI are ' +
        'unaffected. Only new AI analysis is paused.',
      rule: METERING_RULE,
    });
  }
}
