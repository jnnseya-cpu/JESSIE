import type { AgeMode } from './age-modes';
import type { DeliveryTier } from './delivery';
import type { Environment, MovementVariant } from './movements';

export { SNAP_DURATION_SECONDS } from './movements';

/**
 * The Snap — the atomic unit of the system. §0.
 * A 90-to-300-second movement prescription, delivered into a verified gap
 * in a real human's real day, matched to their real body, in their real
 * environment, at a difficulty they can actually complete.
 */

export const SNAP_OUTCOMES = [
  'completed',
  'partial',
  'abandoned',
  'dismissed',
  'snoozed',
  'expired',
  'unsafe_stop',
  'flagged_faked',
] as const;
export type SnapOutcome = (typeof SNAP_OUTCOMES)[number];

/** How a completion was verified. §7.2. */
export const VERIFICATION_METHODS = [
  'wearable_delta',
  'motion_signature',
  'self_attest',
  'reply_confirm',
  'voice_note',
  'proxy_attestation',
  'camera_pose',
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export interface Snap {
  id: string;
  userId: string;
  movementId: string;
  variantId: string;
  variant: MovementVariant;
  ageMode: AgeMode;
  tier: DeliveryTier;
  environment: Environment;
  durationTargetSeconds: number;
  /** Required and non-null. A Snap cannot be delivered without a context decision. */
  contextDecisionId: string;
  scheduledFor: string;
  deliveredAt?: string;
  respondedAt?: string;
  outcome?: SnapOutcome;
  verification?: VerificationMethod;
  /** Computed on completion. See effort.ts. */
  effortScore?: number;
  /** True when a carer or coordinator completed on the user's behalf. */
  proxy: boolean;
  feedback?: SnapFeedback;
}

export interface SnapFeedback {
  /** 1 = far too easy, 5 = far too hard. Drives the ≤7%/week escalation. */
  ease: 1 | 2 | 3 | 4 | 5;
  wantedMore: boolean;
  /** Free text is disabled for minors; structured prompts only. */
  note?: string;
}

/**
 * Outcomes that count as engagement for the Completion Graph but must never
 * reduce a score, break a Chain, or trigger a guilt-framed message.
 */
export const NON_PENALISING_OUTCOMES: readonly SnapOutcome[] = [
  'dismissed',
  'snoozed',
  'expired',
  'unsafe_stop',
];

export function isPenalising(outcome: SnapOutcome): boolean {
  return !NON_PENALISING_OUTCOMES.includes(outcome);
}

/**
 * Law 1 — Just Enough.
 * The system never prescribes the optimal dose. It prescribes the largest
 * dose the user will actually complete, then escalates by ≤7% per week.
 */
export const MAX_WEEKLY_ESCALATION = 0.07;

export function nextDose(currentSeconds: number, weeks = 1): number {
  const escalated = currentSeconds * Math.pow(1 + MAX_WEEKLY_ESCALATION, weeks);
  return Math.min(Math.round(escalated), 300);
}

/**
 * Completion rate is the north-star metric — not minutes moved.
 */
export function completionRate(snaps: readonly Snap[]): number {
  const delivered = snaps.filter((s) => s.deliveredAt && s.outcome);
  if (delivered.length === 0) return 0;
  const completed = delivered.filter(
    (s) => s.outcome === 'completed' || s.outcome === 'partial',
  );
  return completed.length / delivered.length;
}

/**
 * The safety rules the prescription path evaluates on every single call —
 * enumerated so the number the product quotes ("14 safety rules
 * evaluated") is the length of this list rather than a figure that can
 * drift from the code. Rules 1–8 are the hard blocks in the context
 * evaluation; 9–14 are applied by the prescription service itself.
 */
export const EVALUATED_SAFETY_RULES = [
  { id: 'driving_or_cycling', rule: 'Never prompt someone who is driving or cycling.' },
  { id: 'on_call', rule: 'Never prompt during a call.' },
  { id: 'in_lesson', rule: 'Never prompt a pupil during a lesson.' },
  { id: 'clinically_flagged_rest', rule: 'Never prompt during clinically flagged rest.' },
  { id: 'sleep_window', rule: 'Never prompt between 22:00 and 06:00.' },
  { id: 'quiet_hours', rule: 'Never prompt inside the user’s own quiet hours.' },
  { id: 'daily_cap', rule: 'Never exceed the mode’s daily cap.' },
  { id: 'cooldown_interval', rule: 'Never re-prompt inside the minimum interval.' },
  { id: 'consent_basis', rule: 'No consented signal, no prompt — defer, never guess.' },
  { id: 'permitted_variants_only', rule: 'Only variants the capability profile permits; never widened.' },
  { id: 'no_uninvited_progression', rule: 'Never promote to a harder variant to drive progression.' },
  { id: 'rpe_ceiling', rule: 'Prescribed effort never exceeds RPE 4.' },
  { id: 'duration_range', rule: '90–300 seconds, inside the mode’s range, escalating ≤7% a week.' },
  { id: 'expiry', rule: 'Every prescription expires, so a stale prompt cannot fire.' },
] as const;
