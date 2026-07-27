import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AGENT_REGISTRY,
  DEFAULT_MODELS,
  type AiCompletionRequest,
  type AiProvider,
} from '@jessie-os/shared';
import { toAcu, type ModelProvider } from '../provider.interface';

@Injectable()
export class GeminiProvider implements ModelProvider {
  readonly name: AiProvider = 'gemini';
  private client?: GoogleGenAI;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  isConfigured(): boolean {
    return this.client !== undefined;
  }

  resolveModel(request: AiCompletionRequest): string {
    if (request.model) return request.model;
    const configured = this.config.get<string>('GEMINI_MODEL');
    if (configured) return configured;
    return this.isFrontier(request)
      ? DEFAULT_MODELS.gemini.frontier
      : DEFAULT_MODELS.gemini.mid;
  }

  private isFrontier(request: AiCompletionRequest): boolean {
    const declared = request.modelClass ?? AGENT_REGISTRY[request.agent]?.modelClass;
    return declared === 'frontier_llm';
  }

  async complete(request: AiCompletionRequest, _signal: AbortSignal) {
    if (!this.client) throw new Error('Gemini provider is not configured');

    const model = this.resolveModel(request);

    const systemInstruction = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const response = await this.client.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: request.maxTokens ?? 4096,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    const finishReason = response.candidates?.[0]?.finishReason;
    const refused = finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT';

    return {
      text: response.text ?? '',
      provider: this.name,
      model,
      refused,
      usage: {
        inputTokens,
        outputTokens,
        acu: toAcu(inputTokens, outputTokens, this.isFrontier(request)),
      },
    };
  }
}
