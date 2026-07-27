/**
 * §9 — The Agent Registry. Twenty-six agents.
 *
 * Orchestration is LangGraph state machines over a NestJS agent runtime.
 * Every agent is a typed node with a declared input contract, output
 * contract, tool allow-list, permission scope, cost ceiling (in ACU),
 * timeout, fallback path and escalation route.
 *
 * No agent may call a tool outside its allow-list — enforced at the
 * runtime, not by prompt.
 */

export const AGENT_CODES = [
  'ONB',
  'SIA',
  'CTX',
  'RX',
  'SAFE',
  'ADA',
  'JESS',
  'HAB',
  'NUDGE',
  'GAM',
  'CREW',
  'FUSE',
  'INS',
  'CLIN',
  'GUARD',
  'WORK',
  'STUDIO',
  'LOC',
  'GROW',
  'PRICE',
  'PAY',
  'FRAUD',
  'COMP',
  'SRE',
  'GOV',
  'STEW',
] as const;
export type AgentCode = (typeof AGENT_CODES)[number];

/**
 * §9 — Model routing policy. Timing decisions are a contextual bandit,
 * not an LLM. This is deliberate and must not be "upgraded".
 */
export const MODEL_CLASSES = [
  'on_device_slm',
  'mid_tier_llm',
  'frontier_llm',
  'embedding',
  'contextual_bandit',
  'deterministic_rules',
] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];

export interface AgentDefinition {
  code: AgentCode;
  name: string;
  trigger: string;
  output: string;
  /** Where this agent escalates. `null` means it is a terminal node. */
  escalatesTo: AgentCode | 'human' | null;
  modelClass: ModelClass;
  /** Cost ceiling per invocation, in Adaptive Coaching Units. */
  acuCeiling: number;
  timeoutMs: number;
  /** Tools this agent may call. Enforced by the runtime. */
  toolAllowList: readonly string[];
}

export const AGENT_REGISTRY: Readonly<Record<AgentCode, AgentDefinition>> = {
  ONB: { code: 'ONB', name: 'Onboarding', trigger: 'signup', output: 'Movement Vector v0, tier assignment, consent ledger', escalatesTo: 'COMP', modelClass: 'mid_tier_llm', acuCeiling: 8, timeoutMs: 20000, toolAllowList: ['profile.write', 'consent.write', 'screening.evaluate'] },
  SIA: { code: 'SIA', name: 'Schedule Intelligence', trigger: 'calendar delta, 05:00 daily', output: 'Ranked gap list with availability score', escalatesTo: 'CTX', modelClass: 'deterministic_rules', acuCeiling: 2, timeoutMs: 10000, toolAllowList: ['calendar.read_structural', 'rota.read', 'history.read'] },
  CTX: { code: 'CTX', name: 'Context Sensing', trigger: 'pre-nudge, 15-min tick', output: 'Environment class, movability verdict', escalatesTo: 'RX', modelClass: 'on_device_slm', acuCeiling: 1, timeoutMs: 3000, toolAllowList: ['motion.read', 'device_state.read', 'location_class.read'] },
  RX: { code: 'RX', name: 'Movement Prescription', trigger: 'gap confirmed', output: 'Snap candidate, variant and dose', escalatesTo: 'SAFE', modelClass: 'mid_tier_llm', acuCeiling: 6, timeoutMs: 15000, toolAllowList: ['library.search', 'vector.query', 'history.read'] },
  SAFE: { code: 'SAFE', name: 'Safety Guardrail', trigger: 'every prescription', output: 'Allow, substitute or block, with reason', escalatesTo: 'CLIN', modelClass: 'deterministic_rules', acuCeiling: 0, timeoutMs: 2000, toolAllowList: ['contraindication.match', 'safety_decisions.write'] },
  ADA: { code: 'ADA', name: 'Adaptive & Equivalence', trigger: 'profile change, every prescription', output: 'Variant map, equivalence multiplier', escalatesTo: 'RX', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 3000, toolAllowList: ['capability.read', 'equivalence.compute'] },
  JESS: { code: 'JESS', name: 'Coach Persona', trigger: 'user interaction', output: 'Age-calibrated dialogue and framing', escalatesTo: 'GUARD', modelClass: 'mid_tier_llm', acuCeiling: 4, timeoutMs: 12000, toolAllowList: ['copy.lint', 'persona.read'] },
  HAB: { code: 'HAB', name: 'Habit Formation', trigger: 'daily, post-session', output: 'Cue-routine-reward plan, anchor selection', escalatesTo: 'NUDGE', modelClass: 'mid_tier_llm', acuCeiling: 3, timeoutMs: 10000, toolAllowList: ['history.read', 'anchor.select'] },
  NUDGE: { code: 'NUDGE', name: 'Timing Bandit', trigger: 'continuous', output: 'Send or hold decision, and channel', escalatesTo: null, modelClass: 'contextual_bandit', acuCeiling: 0, timeoutMs: 1500, toolAllowList: ['bandit.sample', 'notification.send'] },
  GAM: { code: 'GAM', name: 'Gamification', trigger: 'session events', output: 'Sparks, Chain state, badge, quest', escalatesTo: 'GOV', modelClass: 'deterministic_rules', acuCeiling: 0, timeoutMs: 3000, toolAllowList: ['sparks.award', 'chain.update', 'quest.assign'] },
  CREW: { code: 'CREW', name: 'Crew & Social', trigger: 'crew events', output: 'Team state, matchmaking, league table', escalatesTo: 'GUARD', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 5000, toolAllowList: ['crew.read', 'crew.write', 'league.compute'] },
  FUSE: { code: 'FUSE', name: 'Wearable Fusion', trigger: 'webhook or poll', output: 'Normalised biometric timeline with provenance', escalatesTo: 'INS', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 20000, toolAllowList: ['health.read', 'provenance.write'] },
  INS: { code: 'INS', name: 'Progress & Insight', trigger: 'weekly, on demand', output: 'Insight cards, trend narrative, PROM prompts', escalatesTo: 'CLIN', modelClass: 'mid_tier_llm', acuCeiling: 5, timeoutMs: 20000, toolAllowList: ['history.read', 'prom.prompt'] },
  CLIN: { code: 'CLIN', name: 'Clinical Escalation', trigger: 'red-flag pattern', output: 'Escalation packet and user-facing safe message', escalatesTo: 'human', modelClass: 'frontier_llm', acuCeiling: 20, timeoutMs: 45000, toolAllowList: ['pattern.detect', 'escalation.write'] },
  GUARD: { code: 'GUARD', name: 'Safeguarding', trigger: 'any UGC, any minor interaction', output: 'Block, flag or notify the designated safeguarding lead', escalatesTo: 'human', modelClass: 'mid_tier_llm', acuCeiling: 4, timeoutMs: 8000, toolAllowList: ['ugc.scan', 'safeguarding.flag'] },
  WORK: { code: 'WORK', name: 'Workforce Analytics', trigger: 'nightly', output: 'k-anonymous cohort metrics, ROI model', escalatesTo: 'COMP', modelClass: 'deterministic_rules', acuCeiling: 3, timeoutMs: 60000, toolAllowList: ['cohort.query', 'kanon.enforce'] },
  STUDIO: { code: 'STUDIO', name: 'Content Studio', trigger: 'authoring', output: 'Draft movement, metadata and five variants', escalatesTo: 'human', modelClass: 'frontier_llm', acuCeiling: 25, timeoutMs: 90000, toolAllowList: ['library.draft', 'variant.generate'] },
  LOC: { code: 'LOC', name: 'Localisation & Register', trigger: 'pre-publish, pre-send', output: 'Locale, Easy Read and BSL mapping, plus copy lint', escalatesTo: null, modelClass: 'mid_tier_llm', acuCeiling: 2, timeoutMs: 10000, toolAllowList: ['copy.lint', 'locale.map'] },
  GROW: { code: 'GROW', name: 'Growth & Lifecycle', trigger: 'lifecycle events', output: 'Activation, winback or referral play', escalatesTo: 'PRICE', modelClass: 'mid_tier_llm', acuCeiling: 3, timeoutMs: 10000, toolAllowList: ['lifecycle.read', 'campaign.propose'] },
  PRICE: { code: 'PRICE', name: 'Pricing & Monetisation', trigger: 'weekly, on signal', output: 'Plan or offer recommendation', escalatesTo: 'human', modelClass: 'mid_tier_llm', acuCeiling: 3, timeoutMs: 10000, toolAllowList: ['pricing.read', 'offer.propose'] },
  PAY: { code: 'PAY', name: 'Payments & Wallet', trigger: 'transaction events', output: 'Charge, split, settle, reward payout', escalatesTo: 'FRAUD', modelClass: 'deterministic_rules', acuCeiling: 0, timeoutMs: 15000, toolAllowList: ['payment.charge', 'wallet.write', 'settlement.run'] },
  FRAUD: { code: 'FRAUD', name: 'Integrity & Fraud', trigger: 'activity and payment events', output: 'Risk score, cheat verdict', escalatesTo: 'human', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 8000, toolAllowList: ['attestation.verify', 'signature.score', 'collusion.graph'] },
  COMP: { code: 'COMP', name: 'Compliance & Privacy', trigger: 'continuous', output: 'DPIA deltas, retention actions, DSAR fulfilment', escalatesTo: 'human', modelClass: 'deterministic_rules', acuCeiling: 2, timeoutMs: 30000, toolAllowList: ['consent.read', 'retention.apply', 'dsar.fulfil'] },
  SRE: { code: 'SRE', name: 'Reliability & Auto-Repair', trigger: 'telemetry', output: 'Heal, roll back, scale or page', escalatesTo: 'human', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 15000, toolAllowList: ['telemetry.read', 'deploy.rollback', 'oncall.page'] },
  GOV: { code: 'GOV', name: 'AI Governance', trigger: 'every agent action', output: 'Policy verdict, model-card enforcement, dark-pattern veto', escalatesTo: 'human', modelClass: 'deterministic_rules', acuCeiling: 0, timeoutMs: 2000, toolAllowList: ['policy.evaluate', 'charter.assert'] },
  STEW: { code: 'STEW', name: 'Data Steward', trigger: 'continuous', output: 'Lineage, quality, minimisation, deletion cascade', escalatesTo: 'COMP', modelClass: 'deterministic_rules', acuCeiling: 1, timeoutMs: 30000, toolAllowList: ['lineage.write', 'deletion.cascade'] },
};

/** Runtime guard: an agent may never call a tool outside its allow-list. */
export function isToolPermitted(code: AgentCode, tool: string): boolean {
  return AGENT_REGISTRY[code].toolAllowList.includes(tool);
}
