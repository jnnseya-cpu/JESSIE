import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AGE_MODE_DEFINITIONS,
  EVALUATED_SAFETY_RULES,
  MAX_WEEKLY_ESCALATION,
  SNAP_DURATION_SECONDS,
  defaultsToChairSupport,
  isDecisionFresh,
  nextDose,
  sparksFor,
  standingRequiresClearance,
  type AgeMode,
  type ContextDecision,
  type MovementCategory,
  type MovementVariant,
} from '@jessmove/shared';
import { ContextService, type ContextSignals } from '../context/context.service';
import { guideFor } from './guide.logic';

export interface PrescriptionRequest {
  userId: string;
  mode: AgeMode;
  availableSeconds: number;
  maxRpe?: number;
  excludeCategories?: MovementCategory[];
  signals: ContextSignals;
  /** Variants the capability profile permits. Never widened by this service. */
  permittedVariants: MovementVariant[];
  capabilityNormaliser: number;
}

export interface Prescription {
  prescriptionId: string;
  movement: {
    id: string;
    name: string;
    category: MovementCategory;
    variant: MovementVariant;
  };
  /** The coaching. A member reads this, not the telemetry. */
  guide: {
    what: string;
    steps: string[];
    feel: string;
    stopIf: string;
  };
  dose: { durationSeconds: number; rounds: number; tempo: 'slow' | 'steady' };
  expectedRpe: number;
  why: string;
  safety: {
    verdict: 'allow' | 'substitute' | 'block';
    substitutedFrom: string | null;
    rulesEvaluated: number;
    reasonCode?: string;
  };
  sparksEstimate: number;
  expiresAt: string;
  contextDecisionId: string;
  model: { ranker: string; bandit: string };
}

export interface PrescriptionHold {
  held: true;
  reason: string;
  blocks: string[];
  retryAfterSeconds: number;
  contextDecisionId: string;
}

/**
 * RX — Movement Prescription Agent, with the SAFE guardrail inline. §9.2.
 *
 * The core call: POST /prescriptions:next. §21.2.
 * A blocked prescription is never a hard error — it returns a safe
 * alternative, or an explicit hold.
 */
@Injectable()
export class PrescriptionsService {
  private readonly logger = new Logger(PrescriptionsService.name);

  constructor(private readonly context: ContextService) {}

  next(request: PrescriptionRequest): Prescription | PrescriptionHold {
    const decision: ContextDecision = this.context.evaluate(request.signals);

    /*
     * A decision older than its own TTL must not deliver.
     *
     * `isDecisionFresh` said so in a comment and was called by nothing.
     * It has not bitten yet only because the decision is evaluated on the
     * line above — but the type is a record with an `evaluatedAt` and a
     * `ttlSeconds` precisely so it can be stored, queued or replayed, and
     * the first caller to do any of those would have delivered a nudge
     * based on where somebody was twenty minutes ago. That is Law 2
     * failing in the one way it cannot detect: the context looked movable,
     * and it was, earlier.
     */
    if (!isDecisionFresh(decision)) {
      return {
        held: true,
        reason: 'The context read is older than it is allowed to be.',
        blocks: decision.blocks,
        retryAfterSeconds: 0,
        contextDecisionId: decision.id,
      };
    }

    // Law 2 — no empty nudges. If the user cannot move, stay silent.
    if (decision.verdict !== 'movable') {
      return {
        held: true,
        reason:
          decision.verdict === 'blocked'
            ? 'The user cannot move right now.'
            : 'Not enough context to know whether the user can move.',
        blocks: decision.blocks,
        retryAfterSeconds: 900,
        contextDecisionId: decision.id,
      };
    }

    const modeDef = AGE_MODE_DEFINITIONS[request.mode];
    const variant = this.selectVariant(request);

    if (!variant) {
      // Never substitute an unsafe variant. Log the library gap instead.
      this.logger.warn(
        `library_gap: no permitted variant for user ${request.userId} in mode ${request.mode}`,
      );
      return {
        held: true,
        reason: 'No variant in the library is safe for this capability profile.',
        blocks: ['library_gap'],
        retryAfterSeconds: 3600,
        contextDecisionId: decision.id,
      };
    }

    const category = this.selectCategory(request);
    const durationSeconds = this.calibrateDose(request, modeDef.durationRange);
    const expectedRpe = Math.min(request.maxRpe ?? 4, 4);

    return {
      prescriptionId: `rx_${randomUUID().slice(0, 8)}`,
      movement: {
        id: `mv_${category}_${variant}`,
        name: this.nameFor(category, variant),
        category,
        variant,
      },
      guide: guideFor(category, variant),
      dose: { durationSeconds, rounds: durationSeconds > 180 ? 2 : 1, tempo: 'slow' },
      expectedRpe,
      why: this.explain(decision, durationSeconds),
      safety: { verdict: 'allow', substitutedFrom: null, rulesEvaluated: EVALUATED_SAFETY_RULES.length },
      sparksEstimate: sparksFor({
        durationSeconds,
        rpe: expectedRpe,
        capabilityNormaliser: request.capabilityNormaliser,
        category,
        integrityConfidence: 1,
      }),
      expiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
      contextDecisionId: decision.id,
      model: { ranker: 'rx-ranker-v4.2', bandit: 'nudge-ts-v2.1' },
    };
  }

  /**
   * Never promotes the user to a harder variant to drive progression.
   * Variant change is user-initiated or clinician-initiated only.
   */
  private selectVariant(request: PrescriptionRequest): MovementVariant | null {
    /*
     * `defaultsToChairSupport` rather than `mode === 'independence' ||
     * mode === 'vitality'`, which is what this line used to say.
     *
     * Those are the same condition today, and that is the problem: the
     * rule lived in two places, and only one of them was the one anybody
     * would edit. `age-modes.ts` is where a later-life mode gets defined,
     * so adding one there would have left this service still ordering
     * standing work ahead of chair support for it — a physical safety
     * rule quietly not applying to the newest group it was written for.
     */
    const order: MovementVariant[] = defaultsToChairSupport(request.mode)
      ? ['chair_supported', 'seated', 'bed_recliner', 'adaptive_single_limb', 'standing']
      : ['seated', 'standing', 'chair_supported', 'adaptive_single_limb', 'bed_recliner'];

    /*
     * Standing is opt-up in vitality mode, never opt-out.
     *
     * Ordering it last was not the same rule: if standing were the only
     * permitted variant it would still have been selected, which is
     * exactly the case the clearance requirement exists for. Now it is
     * only reachable in that mode when the capability profile has been
     * widened deliberately — `permittedVariants` is set by profiling and
     * by clinicians, never by this service.
     */
    const allowed = standingRequiresClearance(request.mode)
      ? order.filter((v) => v !== 'standing' || request.permittedVariants.includes('standing'))
      : order;

    return allowed.find((v) => request.permittedVariants.includes(v)) ?? null;
  }

  private selectCategory(request: PrescriptionRequest): MovementCategory {
    const excluded = new Set(request.excludeCategories ?? []);
    // Silver and Centennial bias to the falls-prevention stack. §6.4.
    const preference: MovementCategory[] =
      request.mode === 'independence' || request.mode === 'vitality'
        ? ['balance', 'strength', 'mobility', 'breath']
        : ['mobility', 'posture', 'breath', 'strength'];

    return preference.find((c) => !excluded.has(c)) ?? 'breath';
  }

  /**
   * Law 1 — Just Enough. Calibrate to the largest dose the user will
   * actually complete, escalating by no more than 7% per week.
   */
  private calibrateDose(
    request: PrescriptionRequest,
    range: readonly [number, number],
  ): number {
    const ceiling = Math.min(
      request.availableSeconds,
      range[1],
      SNAP_DURATION_SECONDS.max,
    );
    const floor = Math.max(range[0], SNAP_DURATION_SECONDS.min);
    /*
     * `nextDose` rather than `floor * (1 + MAX_WEEKLY_ESCALATION)` spelled
     * out here. Same arithmetic, and Law 1 is written down in one place —
     * escalate by no more than seven percent a week, and never past the
     * five-minute ceiling. A second copy of an escalation rule is a second
     * place for it to creep.
     */
    return Math.max(floor, Math.min(ceiling, nextDose(floor)));
  }

  private nameFor(category: MovementCategory, variant: MovementVariant): string {
    const titles: Partial<Record<MovementCategory, string>> = {
      mobility: 'Thoracic Opener',
      balance: 'Steady Hold',
      strength: 'Press and Hold',
      posture: 'Shoulder Reset',
      breath: 'Extended Exhale',
    };
    const base = titles[category] ?? 'Movement Snap';
    return variant === 'seated' ? `Desk ${base}` : base;
  }

  private explain(decision: ContextDecision, durationSeconds: number): string {
    const discreet =
      decision.privacyClass === 'alone'
        ? 'You have the space to move freely.'
        : 'This one is silent and needs no space.';
    return `You have a real gap right now, and it is ${Math.round(durationSeconds / 60)} minutes long. ${discreet}`;
  }
}
