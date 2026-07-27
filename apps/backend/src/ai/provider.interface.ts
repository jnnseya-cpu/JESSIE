import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
} from '@movequest/shared';

/**
 * Every model vendor sits behind this one interface. Adding a fourth
 * provider means implementing this and registering it — no call site
 * anywhere else in the platform changes.
 */
export interface ModelProvider {
  readonly name: AiProvider;

  /** False when no API key is configured. The gateway skips unconfigured providers. */
  isConfigured(): boolean;

  /** The model this provider will use for the given request. */
  resolveModel(request: AiCompletionRequest): string;

  complete(
    request: AiCompletionRequest,
    signal: AbortSignal,
  ): Promise<Omit<AiCompletionResponse, 'fellBackFrom' | 'latencyMs' | 'traceId'>>;
}

export const MODEL_PROVIDERS = Symbol('MODEL_PROVIDERS');

/** Rough ACU conversion. 1 ACU is a normalised unit of AI work. §25.2. */
export function toAcu(inputTokens: number, outputTokens: number, frontier: boolean): number {
  const weight = frontier ? 1 : 0.35;
  return Number((((inputTokens + outputTokens * 3) / 10_000) * weight).toFixed(4));
}
