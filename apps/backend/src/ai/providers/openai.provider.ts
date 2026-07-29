import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AGENT_REGISTRY,
  DEFAULT_MODELS,
  type AiCompletionRequest,
  type AiProvider,
} from '@jessmove/shared';
import { toAcu, type ModelProvider } from '../provider.interface';

@Injectable()
export class OpenAiProvider implements ModelProvider {
  readonly name: AiProvider = 'openai';
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      const baseURL = this.config.get<string>('OPENAI_BASE_URL') || undefined;
      this.client = new OpenAI({ apiKey, baseURL });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  resolveModel(request: AiCompletionRequest): string {
    if (request.model) return request.model;
    const configured = this.config.get<string>('OPENAI_MODEL');
    if (configured) return configured;
    return this.isFrontier(request)
      ? DEFAULT_MODELS.openai.frontier
      : DEFAULT_MODELS.openai.mid;
  }

  private isFrontier(request: AiCompletionRequest): boolean {
    const declared = request.modelClass ?? AGENT_REGISTRY[request.agent]?.modelClass;
    return declared === 'frontier_llm';
  }

  async complete(request: AiCompletionRequest, signal: AbortSignal) {
    if (!this.client) throw new Error('OpenAI provider is not configured');

    const model = this.resolveModel(request);

    const response = await this.client.chat.completions.create(
      {
        model,
        max_completion_tokens: request.maxTokens ?? 4096,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        ...(request.jsonSchema
          ? {
              response_format: {
                type: 'json_schema' as const,
                json_schema: {
                  name: 'jessmove_structured_output',
                  schema: request.jsonSchema,
                  strict: true,
                },
              },
            }
          : {}),
      },
      { signal },
    );

    const choice = response.choices[0];
    const refused = choice?.finish_reason === 'content_filter';

    return {
      text: choice?.message?.content ?? '',
      provider: this.name,
      model: response.model,
      refused,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        acu: toAcu(
          response.usage?.prompt_tokens ?? 0,
          response.usage?.completion_tokens ?? 0,
          this.isFrontier(request),
        ),
      },
    };
  }
}
