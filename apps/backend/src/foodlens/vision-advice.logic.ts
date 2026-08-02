/**
 * Turns provider error strings into the one sentence an operator can act
 * on. Pure, so the mapping is testable — every branch here was a real
 * failure mode during setup, and "the model was unavailable" is not an
 * instruction.
 */
export function adviseOnVisionFailure(causes: Record<string, string>): string {
  const all = Object.values(causes).join(' | ');

  if (/no ai provider/i.test(all)) {
    return 'No AI key is set on this deployment. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY and redeploy.';
  }
  if (/\b404\b|not_found|model.*(not found|does not exist)|unknown model/i.test(all)) {
    return 'The key works but cannot reach the configured model — the usual cause is an account without access to that model. Set ANTHROPIC_MODEL (or OPENAI_MODEL / GEMINI_MODEL) to a model your account can use, and redeploy.';
  }
  if (/\b401\b|\b403\b|invalid.*api key|authentication|unauthor/i.test(all)) {
    return 'A provider rejected the key itself. Re-copy the key into the environment variable — a truncated paste looks exactly like this — and redeploy.';
  }
  if (/\b429\b|rate.?limit|quota|credit balance|billing/i.test(all)) {
    return 'The provider accepted the key but refused on quota or billing. Top up or raise the limit on that account; the other providers in the chain will be tried meanwhile.';
  }
  if (/image|vision|media type|unsupported/i.test(all)) {
    return 'The provider rejected the image itself, which usually means the configured model has no vision support. Point the model variable at a vision-capable model and redeploy.';
  }
  if (/timeout|abort|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(all)) {
    return 'The call never completed — a network or timeout failure rather than a refusal. Retry; if it persists, raise AI_REQUEST_TIMEOUT_MS.';
  }
  return `No provider completed the call. Exact replies: ${all}`;
}
