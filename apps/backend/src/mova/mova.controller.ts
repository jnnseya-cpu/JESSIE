import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { MOVA_REFUSES, PLATFORM_PAYERS, PRESENCE_DEFINITIONS } from '@jessmove/shared';
import { AbuseService } from '../auth/abuse.service';
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
    private readonly abuse: AbuseService,
  ) {}

  /**
   * Whose allowance pays for the answer.
   *
   * Without this the coach — the most-used model call on the platform —
   * ran free: the service has always accepted a payer, but nothing was
   * ever handed one, so every conversation was a provider bill against
   * nobody's balance.
   *
   * There is now no such thing as an unbilled ask. A member pays from
   * their own allowance; a visitor with no account draws on the platform's
   * daily trial budget, which is a real balance that runs out. Both are
   * gated before the call rather than counted after it.
   */
  private billTo(req: Request): string {
    const token = tokenFrom(req);
    return (token ? this.auth.verify(token)?.uid : undefined) ?? PLATFORM_PAYERS.trial;
  }

  /** What the coach will and will not do — published, not implied. */
  @Get('policy')
  policy() {
    return {
      refuses: MOVA_REFUSES,
      presence: PRESENCE_DEFINITIONS,
      note: 'These refusals are rules, not confidence thresholds. A better model does not unlock them.',
    };
  }

  @Post('ask')
  ask(@Req() req: Request, @Body() body: AskDto) {
    const uid = this.billTo(req);
    // A stranger gets a small daily allowance; a member spends their own.
    if (!uid) this.abuse.assertAnonymousAllowance(req.ip ?? 'unknown', 'mova.ask');
    return this.mova.ask(body.question, body.age, body.displayName, uid);
  }
}
