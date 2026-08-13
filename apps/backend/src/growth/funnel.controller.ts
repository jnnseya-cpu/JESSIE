import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AdminOnly } from '../auth/auth.guard';
import { FUNNEL_STEPS, FunnelService, type FunnelStep } from './funnel.service';

class FunnelStepDto {
  /*
   * `registered` is absent on purpose. It is the only step that means
   * money, so it is the only one anybody would forge, and it is recorded
   * server-side where an account actually comes into existence.
   */
  @IsIn(['landed', 'viewed_ask', 'opened', 'started'])
  step!: Exclude<FunnelStep, 'registered'>;

  @IsOptional() @IsString() @MaxLength(200) path?: string;
  @IsOptional() @IsString() @MaxLength(300) referrer?: string;
  @IsOptional() @IsString() @MaxLength(20) device?: string;
  /** The organisation whose link brought them here, if any. */
  @IsOptional() @IsString() @MaxLength(24) referrerCode?: string;
}

/**
 * Where people are lost.
 *
 * Public to write and admin to read, which is the right way round: the
 * browser can say "somebody opened the account page" and cannot say
 * "somebody registered", and nobody but us can see the numbers.
 */
@Controller('funnel')
export class FunnelController {
  constructor(private readonly funnel: FunnelService) {}

  @Post()
  record(@Req() req: Request, @Body() body: FunnelStepDto) {
    this.funnel.record({
      step: body.step,
      source: req.ip ?? 'unknown',
      path: body.path,
      referrer: body.referrer ?? null,
      device: body.device ?? null,
      referrerCode: body.referrerCode ?? null,
    });
    // Nothing to say back. A beacon that waits for a body is a beacon that
    // slows down the page it is measuring.
    return { recorded: true };
  }

  @AdminOnly()
  @Get()
  async summary(@Query('days') days?: string) {
    const window = Math.min(365, Math.max(1, Number(days) || 30));
    return this.funnel.summary(window);
  }

  /** The steps and what each one means, so the numbers are readable. */
  @AdminOnly()
  @Get('steps')
  steps() {
    return { steps: FUNNEL_STEPS };
  }
}
