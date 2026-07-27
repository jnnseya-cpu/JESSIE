import type { AgentCode, ModelClass } from './agents';

/**
 * The AI Gateway contract. §17, §19.
 *
 * One interface, three providers. Every agent invocation is routed through
 * the gateway so that model choice, cost ceilings, redaction, policy
 * verdicts and decision logging are enforced in one place rather than
 * scattered across call sites.
 */

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/**
 * Model routing policy. §9.
 * `mid_tier_llm` is Claude Sonnet class; `frontier_llm` is Claude Opus class.
 */
export const DEFAULT_MODELS: Readonly<Record<AiProvider, Record<'mid' | 'frontier', string>>> = {
  anthropic: { mid: 'claude-sonnet-5', frontier: 'claude-opus-5' },
  openai: { mid: 'gpt-4.1-mini', frontier: 'gpt-4.1' },
  gemini: { mid: 'gemini-2.5-flash', frontier: 'gemini-2.5-pro' },
};

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
  role: AiRole;
  content: string;
}

export interface AiCompletionRequest {
  /** Which agent is calling. Drives cost ceiling and tool allow-list. */
  agent: AgentCode;
  messages: AiMessage[];
  /** Overrides the routing policy for this call. */
  provider?: AiProvider;
  model?: string;
  modelClass?: ModelClass;
  maxTokens?: number;
  /** Deterministic JSON output. */
  jsonSchema?: Record<string, unknown>;
  /** Correlates the call with the decision log. */
  traceId?: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Adaptive Coaching Units consumed. Metered per §15. */
  acu: number;
}

export interface AiCompletionResponse {
  text: string;
  provider: AiProvider;
  model: string;
  usage: AiUsage;
  /** Populated when the primary provider failed and the chain was walked. */
  fellBackFrom?: AiProvider[];
  latencyMs: number;
  traceId: string;
  /** True when the response stopped because the provider declined the request. */
  refused: boolean;
}

export interface AiProviderHealth {
  provider: AiProvider;
  configured: boolean;
  /** Null until the first probe completes. */
  reachable: boolean | null;
  model: string;
  lastCheckedAt?: string;
}

/**
 * Fields that must be stripped before any prompt leaves the platform.
 * §9.2 — calendar titles and attendees are never sent to any LLM.
 */
export const NEVER_SEND_TO_MODEL = [
  'calendar_title',
  'calendar_attendees',
  'precise_location',
  'email',
  'phone',
  'full_name',
  'nhs_number',
  'free_text_prom',
  'safeguarding_notes',
] as const;

/** Thrown when every provider in the fallback chain has failed. */
export class AiGatewayError extends Error {
  constructor(
    message: string,
    readonly attempted: AiProvider[],
    readonly causes: Record<string, string>,
  ) {
    super(message);
    this.name = 'AiGatewayError';
  }
}
