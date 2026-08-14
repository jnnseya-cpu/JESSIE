import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AGENT_CODES,
  AI_PROVIDERS,
  type AgentCode,
  type AiProvider,
  type AiRole,
} from '@jessmove/shared';
import { AdminOnly } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { AiGatewayService } from './ai-gateway.service';

class AiMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: AiRole;

  @IsString()
  content!: string;
}

class CompletionDto {
  @IsIn(AGENT_CODES as unknown as string[])
  agent!: AgentCode;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiMessageDto)
  messages!: AiMessageDto[];

  @IsOptional()
  @IsIn(AI_PROVIDERS as unknown as string[])
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128_000)
  maxTokens?: number;
}

/**
 * The raw gateway.
 *
 * Both routes are staff-only, and neither is how a member reaches a model.
 * A member goes through MOVA or FoodLens, where the age register, the
 * published refusals and the allowance all apply. This controller applies
 * none of them: it takes any agent, any model and any token budget. Left
 * open it was a way to spend the platform's provider budget from the
 * internet, and a way around every under-18 protection at the same time.
 *
 * Which models are configured is staff information too — the deployment's
 * provider names are not something a public endpoint should hand out.
 */
@Controller('ai')
export class AiController {
  constructor(
    private readonly gateway: AiGatewayService,
    private readonly auth: AuthService,
  ) {}

  /** Provider configuration and routing, for the Admin Super Control Centre. */
  @AdminOnly()
  @Get('providers')
  providers() {
    return this.gateway.health();
  }

  /**
   * Whether each key actually works, rather than whether one is set.
   *
   * A POST because it spends: a handful of tokens per provider, billed to
   * the administrator who asked. That is a deliberate trade — the
   * alternative is an endpoint that reports a revoked key as healthy and
   * a scheduled job that fails at seven in the morning with no symptom
   * except that nothing appeared.
   */
  @AdminOnly()
  @Post('providers/probe')
  probe(@Req() req: Request) {
    const token = tokenFrom(req);
    const uid = token ? this.auth.verify(token)?.uid : undefined;
    if (!uid) throw new UnauthorizedException('this endpoint needs a signed-in administrator');
    return this.gateway.probe(uid);
  }

  @AdminOnly()
  @Post('complete')
  complete(@Req() req: Request, @Body() body: CompletionDto) {
    const token = tokenFrom(req);
    const uid = token ? this.auth.verify(token)?.uid : undefined;
    if (!uid) throw new UnauthorizedException('this endpoint needs a signed-in administrator');
    // Staff use is metered like everyone else's: an unmetered call is a
    // bill nobody sees.
    return this.gateway.complete({ ...body, billTo: uid });
  }
}
