/**
 * What a model call actually costs, and therefore what it must be charged.
 *
 * This file exists because the platform had two pricing systems and they
 * did not agree, in a way that made the disagreement invisible.
 *
 * `requiredAcus()` is the Cost Governor: it takes a real provider cost in
 * pounds and returns `cost × 4 × 100` ACU, so an action always clears four
 * times what it costs to serve. That part was correct.
 *
 * The gateway never gave it a real provider cost. The adapters computed
 * ACU straight from token counts —
 *
 *     ((input + output × 3) / 10_000) × (frontier ? 1 : 0.35)
 *
 * — and the gateway then *derived* a provider cost by dividing that ACU
 * figure back down by 400. So the number handed to the profitability guard
 * was reconstructed from the number the guard was supposed to be checking.
 * It could never fail, and it never did.
 *
 * Measured against list prices, that formula charged between 0.068× and
 * 0.99× of direct provider cost. Not one call on this platform has ever
 * cleared 4×; on a frontier model the shortfall was roughly fifty-fold, and
 * the heavier the member's usage the faster the loss grew.
 *
 * The fix is one path. Token counts produce a cost in pounds here; that
 * cost goes to `requiredAcus()`; the 4× lives in exactly one place and
 * applies to every call.
 *
 * ---
 *
 * **The rates below are list prices and must be checked against real
 * invoices.** They are the one input to this whole model that cannot be
 * derived from the code, they change without notice, and an under-estimate
 * is a direct loss on every call. They are deliberately rounded *up* and
 * converted at a conservative $1 = £0.80 — paying slightly too much
 * attention to cost is recoverable, paying too little is what this file is
 * fixing. `AI_TOKEN_RATES_JSON` overrides them without a deploy.
 */

import { ACU_PER_GBP, COST_PROTECTION_MULTIPLE } from './economics';

export interface TokenRate {
  readonly gbpPerMillionInput: number;
  readonly gbpPerMillionOutput: number;
}

/**
 * List prices, rounded up, converted at $1 = £0.80.
 *
 * Keyed by the model ids in `DEFAULT_MODELS`. A model absent from this
 * table is charged at `UNKNOWN_MODEL_RATE`, not waved through.
 */
export const MODEL_TOKEN_RATES: Readonly<Record<string, TokenRate>> = {
  'claude-opus-5': { gbpPerMillionInput: 12.0, gbpPerMillionOutput: 60.0 },
  'claude-sonnet-5': { gbpPerMillionInput: 2.4, gbpPerMillionOutput: 12.0 },
  'gpt-4.1': { gbpPerMillionInput: 1.6, gbpPerMillionOutput: 6.4 },
  'gpt-4.1-mini': { gbpPerMillionInput: 0.32, gbpPerMillionOutput: 1.28 },
  'gemini-2.5-pro': { gbpPerMillionInput: 1.0, gbpPerMillionOutput: 8.0 },
  'gemini-2.5-flash': { gbpPerMillionInput: 0.24, gbpPerMillionOutput: 2.0 },
};

/**
 * What an unrecognised model costs.
 *
 * The most expensive rate in the table, deliberately. A model this file
 * has never heard of is one somebody configured through `ANTHROPIC_MODEL`
 * or a sibling variable, and the safe assumption about an unknown cost is
 * the highest one we know of — the alternative is that changing an
 * environment variable silently switches off the margin.
 */
export const UNKNOWN_MODEL_RATE: TokenRate = { gbpPerMillionInput: 12.0, gbpPerMillionOutput: 60.0 };

/** Parses `AI_TOKEN_RATES_JSON`, ignoring anything malformed. */
export function parseRateOverrides(raw: string | undefined): Record<string, TokenRate> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, TokenRate> = {};
    for (const [model, value] of Object.entries(parsed)) {
      const rate = value as Partial<TokenRate>;
      const input = Number(rate.gbpPerMillionInput);
      const output = Number(rate.gbpPerMillionOutput);
      // A zero or negative rate would mean free AI, which is the exact
      // failure this file exists to prevent. It is not accepted from
      // configuration any more than it would be accepted in code.
      if (Number.isFinite(input) && Number.isFinite(output) && input > 0 && output > 0) {
        out[model] = { gbpPerMillionInput: input, gbpPerMillionOutput: output };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function tokenRateFor(
  model: string,
  env: Record<string, string | undefined> = {},
): { rate: TokenRate; known: boolean } {
  const overrides = parseRateOverrides(env.AI_TOKEN_RATES_JSON);
  const override = overrides[model];
  if (override) return { rate: override, known: true };

  const listed = MODEL_TOKEN_RATES[model];
  if (listed) return { rate: listed, known: true };

  return { rate: UNKNOWN_MODEL_RATE, known: false };
}

/**
 * The direct provider cost of one call, in pounds.
 *
 * Negative or non-finite token counts are treated as zero rather than
 * subtracting from the bill — a provider reporting nonsense must not be
 * able to reduce what a call costs.
 */
export function providerCostGbp(
  model: string,
  inputTokens: number,
  outputTokens: number,
  env: Record<string, string | undefined> = {},
): number {
  const { rate } = tokenRateFor(model, env);
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;

  return (input * rate.gbpPerMillionInput + output * rate.gbpPerMillionOutput) / 1_000_000;
}

/**
 * What to charge for a call, in ACU, at the platform's protection multiple.
 *
 * The floor of 1 is not rounding. A call that reaches a provider has a
 * cost, and charging zero for it is the unmetered path the whole gate
 * exists to close — `Math.ceil` of a very small number is 1, and a call
 * that somehow reports no tokens at all still consumed a request.
 */
export function acusForTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
  env: Record<string, string | undefined> = {},
): number {
  const cost = providerCostGbp(model, inputTokens, outputTokens, env);
  return Math.max(1, Math.ceil(cost * COST_PROTECTION_MULTIPLE * ACU_PER_GBP));
}

/**
 * The multiple a call actually clears — revenue over direct cost.
 *
 * Exists so the claim can be tested rather than asserted. Anything below
 * `COST_PROTECTION_MULTIPLE` is a call being served at a discount nobody
 * decided to give.
 */
export function realisedCallMargin(
  model: string,
  inputTokens: number,
  outputTokens: number,
  env: Record<string, string | undefined> = {},
): number {
  const cost = providerCostGbp(model, inputTokens, outputTokens, env);
  if (cost <= 0) return Number.POSITIVE_INFINITY;
  const revenue = acusForTokens(model, inputTokens, outputTokens, env) / ACU_PER_GBP;
  return Number((revenue / cost).toFixed(3));
}

