import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import {
  MOVA_REFUSES,
  NORMALISER_USER_LABEL,
  PRESENCE_DEFINITIONS,
  PRIZE_INTEGRITY_THRESHOLD,
  SNAP_OUTCOMES,
  countsTowardPrizes,
  isPenalising,
} from '@jessmove/shared';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { MovaService } from './mova.service';

class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @IsInt()
  @Min(10)
  @Max(120)
  age!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}

@Controller('mova')
export class MovaController {
  constructor(
    private readonly mova: MovaService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Whose allowance pays for the answer.
   *
   * Without this the coach — the most-used model call on the platform —
   * ran free: the service has always accepted a payer, but nothing was
   * ever handed one, so every conversation was a provider bill against
   * nobody's balance.
   *
   * There is now no such thing as an unbilled ask, and no anonymous one
   * either. A member pays from their own allowance — which on a new
   * account is the free tier, fifty ACUs a month for two months. Somebody
   * with no account has no allowance to pay from, so the gateway refuses
   * with the sentence that says what an account would give them.
   */
  private billTo(req: Request): string | undefined {
    const token = tokenFrom(req);
    return (token ? this.auth.verify(token)?.uid : undefined) ?? undefined;
  }

  /** What the coach will and will not do — published, not implied. */
  @Get('policy')
  policy() {
    return {
      refuses: MOVA_REFUSES,
      presence: PRESENCE_DEFINITIONS,
      /*
       * Effort is normalised so two people working equally hard at
       * different baselines earn the same. The label matters as much as
       * the rule: it is never called a handicap or an adjustment, and
       * publishing the word here is how that stays true across surfaces.
       */
      effortNormaliser: {
        label: NORMALISER_USER_LABEL,
        prizeEligibleAbove: PRIZE_INTEGRITY_THRESHOLD,
        prizeEligible: countsTowardPrizes(PRIZE_INTEGRITY_THRESHOLD),
        fair: 'Two people at their own baselines earn identical Sparks.',
      },
      /*
       * Which outcomes cost a member something and which do not. A Chain
       * forgives a snooze and an expiry; it does not forgive a faked
       * session. The distinction was specified in `isPenalising` and
       * published nowhere, so the one thing a member most wants to know
       * about a streak — what breaks it — could only be learned by
       * breaking it.
       */
      snapOutcomes: {
        penalising: SNAP_OUTCOMES.filter(isPenalising),
        forgiven: SNAP_OUTCOMES.filter((o) => !isPenalising(o)),
      },
      note: 'These refusals are rules, not confidence thresholds. A better model does not unlock them.',
    };
  }

  @Post('ask')
  ask(@Req() req: Request, @Body() body: AskDto) {
    const uid = this.billTo(req);
    // A stranger gets a small daily allowance; a member spends their own.
    return this.mova.ask(body.question, body.age, body.displayName, uid);
  }
}
