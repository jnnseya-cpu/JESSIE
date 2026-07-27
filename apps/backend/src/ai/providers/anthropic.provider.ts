import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AGENT_REGISTRY,
  DEFAULT_MODELS,
  type AiCompletionRequest,
  type AiProvider,
} from '@jessie-os/shared';
import { toAcu, type ModelProvider } from '../provider.interface';

@Injectable()
export class AnthropicProvider implements ModelProvider {
  readonly name: AiProvider = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private client?: Anthropic;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  resolveModel(request: AiCompletionRequest): string {
    if (request.model) return request.model;
    const configured = this.config.get<string>('ANTHROPIC_MODEL');
    if (configured) return configured;
    const frontier = this.isFrontier(request);
    return frontier ? DEFAULT_MODELS.anthropic.frontier : DEFAULT_MODELS.anthropic.mid;
  }

  private isFrontier(request: AiCompletionRequest): boolean {
    const declared = request.modelClass ?? AGENT_REGISTRY[request.agent]?.modelClass;
    return declared === 'frontier_llm';
  }

  async complete(request: AiCompletionRequest, signal: AbortSignal) {
    if (!this.client) throw new Error('Anthropic provider is not configured');

    const model = this.resolveModel(request);
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create(
      {
        model,
        max_tokens: request.maxTokens ?? 4096,
        ...(system ? { system } : {}),
        // Thinking is on by default on Opus 5; adaptive is the supported
        // on-mode across the current Claude family. budget_tokens is
        // removed on these models and would be rejected.
        thinking: { type: 'adaptive' },
        messages,
      },
      { signal },
    );

    // A refusal returns HTTP 200 with an empty or partial content array.
    // Check stop_reason before reading content — indexing content[0]
    // unconditionally breaks here.
    const refused = response.stop_reason === 'refusal';
    if (refused) {
      this.logger.warn(
        `Anthropic declined a request from agent ${request.agent}; falling through to the next provider.`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      text,
      provider: this.name,
      model: response.model,
      refused,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        acu: toAcu(
          response.usage.input_tokens,
          response.usage.output_tokens,
          this.isFrontier(request),
        ),
      },
    };
  }
}
