import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { MOVA_REFUSES, PRESENCE_DEFINITIONS } from '@jessmove/shared';
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
   * nobody's balance. An anonymous ask still answers; it simply has no
   * wallet to charge.
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
      note: 'These refusals are rules, not confidence thresholds. A better model does not unlock them.',
    };
  }

  @Post('ask')
  ask(@Req() req: Request, @Body() body: AskDto) {
    return this.mova.ask(body.question, body.age, body.displayName, this.billTo(req));
  }
}
