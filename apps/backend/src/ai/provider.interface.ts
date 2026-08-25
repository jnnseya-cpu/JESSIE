import { acusForTokens } from '@jessmove/shared';
import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
} from '@jessmove/shared';

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

/**
 * What a completed call costs the member, in ACU.
 *
 * This used to be a formula of its own:
 *
 *     ((input + output × 3) / 10_000) × (frontier ? 1 : 0.35)
 *
 * which is a shape, not a price. It knew nothing about what any model
 * charges, and the gateway then divided the result back down by 400 to
 * produce the "provider cost" it handed to the profitability guard — so
 * the guard was checking a number reconstructed from the number it was
 * checking, and passed every time. Measured against list prices it billed
 * between 0.068× and 0.99× of direct cost. Every AI call on this platform
 * lost money, and the frontier models lost the most.
 *
 * It now delegates to the one place a price is decided. The model id is
 * required rather than a frontier boolean, because "frontier" is a tier
 * and a tier is not a rate — two frontier models can differ tenfold, and
 * an unrecognised model must be charged at the most expensive rate known
 * rather than at an average.
 */
export function toAcu(model: string, inputTokens: number, outputTokens: number): number {
  return acusForTokens(model, inputTokens, outputTokens, process.env);
}
