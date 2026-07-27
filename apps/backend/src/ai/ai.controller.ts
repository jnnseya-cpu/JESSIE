import { Body, Controller, Get, Post } from '@nestjs/common';
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
} from '@movequest/shared';
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

@Controller('ai')
export class AiController {
  constructor(private readonly gateway: AiGatewayService) {}

  /** Provider configuration and routing, for the Admin Super Control Centre. */
  @Get('providers')
  providers() {
    return this.gateway.health();
  }

  @Post('complete')
  complete(@Body() body: CompletionDto) {
    return this.gateway.complete(body);
  }
}
