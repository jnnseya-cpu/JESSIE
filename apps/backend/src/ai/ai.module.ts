import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcuModule } from '../acu/acu.module';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayService } from './ai-gateway.service';
import { AiController } from './ai.controller';
import { MODEL_PROVIDERS, type ModelProvider } from './provider.interface';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [ConfigModule, AcuModule, AuthModule],
  controllers: [AiController],
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    GeminiProvider,
    {
      provide: MODEL_PROVIDERS,
      inject: [AnthropicProvider, OpenAiProvider, GeminiProvider],
      useFactory: (
        anthropic: AnthropicProvider,
        openai: OpenAiProvider,
        gemini: GeminiProvider,
      ): ModelProvider[] => [anthropic, openai, gemini],
    },
    AiGatewayService,
  ],
  exports: [AiGatewayService],
})
export class AiModule {}
