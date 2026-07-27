import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  VOLUME_GOVERNANCE,
  type ContextDecision,
  type Environment,
  type HardBlock,
  type LocationClass,
  type MotionState,
  type PrivacyClass,
  type SignalClass,
} from '@movequest/shared';

export interface ContextSignals {
  userId: string;
  motionState: MotionState;
  locationClass: LocationClass;
  onCall: boolean;
  doNotDisturb: boolean;
  inLesson?: boolean;
  clinicallyFlaggedRest?: boolean;
  localHour: number;
  quietHours?: [number, number];
  snapsDeliveredToday: number;
  dailyCap: number;
  minutesSinceLastNudge: number;
  /** Which signal classes the user has consented to. */
  consentedSignals: SignalClass[];
}

/**
 * CTX — Context Sensing Agent. §9.2.
 *
 * Law 2: the system would rather stay silent than be ignored.
 * This service never guesses. If it has no positive availability signal
 * it defers; it does not fall back to a fixed timer.
 */
@Injectable()
export class ContextService {
  evaluate(signals: ContextSignals): ContextDecision {
    const blocks: HardBlock[] = [];

    if (signals.motionState === 'driving' || signals.motionState === 'cycling') {
      blocks.push('driving');
    }
    if (signals.onCall) blocks.push('on_call');
    if (signals.inLesson) blocks.push('in_lesson');
    if (signals.clinicallyFlaggedRest) blocks.push('clinically_flagged_rest');
    if (this.isSleepWindow(signals.localHour)) blocks.push('sleep_window');
    if (this.isQuietHours(signals.localHour, signals.quietHours)) {
      blocks.push('quiet_hours');
    }
    if (signals.snapsDeliveredToday >= signals.dailyCap) {
      blocks.push('daily_cap_reached');
    }
    if (signals.minutesSinceLastNudge < VOLUME_GOVERNANCE.minIntervalMinutes) {
      blocks.push('cooldown_active');
    }

    const basis = this.basisFrom(signals);

    // No positive availability signal and no declared schedule: defer.
    // A fixed-timer fallback is not permitted.
    if (basis.length === 0) {
      return this.decision(signals.userId, {
        verdict: 'defer',
        confidence: 0,
        environmentClass: 'home',
        privacyClass: 'alone',
        blocks: [],
        basis: ['declared_schedule'],
      });
    }

    if (blocks.length > 0) {
      return this.decision(signals.userId, {
        verdict: 'blocked',
        confidence: 0.95,
        environmentClass: this.environmentFor(signals),
        privacyClass: this.privacyFor(signals),
        blocks,
        basis,
      });
    }

    return this.decision(signals.userId, {
      verdict: 'movable',
      confidence: this.confidenceFrom(basis),
      environmentClass: this.environmentFor(signals),
      privacyClass: this.privacyFor(signals),
      blocks: [],
      basis,
    });
  }

  private decision(
    userId: string,
    partial: Omit<ContextDecision, 'id' | 'userId' | 'evaluatedAt' | 'ttlSeconds'>,
  ): ContextDecision {
    return {
      id: randomUUID(),
      userId,
      evaluatedAt: new Date().toISOString(),
      ttlSeconds: 900,
      ...partial,
    };
  }

  private basisFrom(signals: ContextSignals): SignalClass[] {
    return signals.consentedSignals.filter((s) => s !== 'ambient_audio');
  }

  private confidenceFrom(basis: SignalClass[]): number {
    // Confidence rises with the number of independent signal classes.
    return Math.min(0.4 + basis.length * 0.12, 0.98);
  }

  private isSleepWindow(hour: number): boolean {
    return hour >= 22 || hour < 6;
  }

  private isQuietHours(hour: number, quiet?: [number, number]): boolean {
    if (!quiet) return false;
    const [from, to] = quiet;
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  }

  private environmentFor(signals: ContextSignals): Environment {
    switch (signals.locationClass) {
      case 'office':
        return 'open_office';
      case 'transit':
        return 'transit';
      case 'clinical':
        return 'care_setting';
      case 'school':
        return 'classroom';
      case 'outdoor':
        return 'outdoors';
      case 'home':
        return 'home';
      default:
        return 'desk';
    }
  }

  /**
   * Determines whether MOVA offers a star jump or a discreet ankle circle.
   */
  private privacyFor(signals: ContextSignals): PrivacyClass {
    switch (signals.locationClass) {
      case 'home':
        return 'alone';
      case 'office':
      case 'school':
      case 'clinical':
        return 'semi_public';
      case 'transit':
      case 'outdoor':
        return 'public';
      default:
        return 'semi_public';
    }
  }
}
