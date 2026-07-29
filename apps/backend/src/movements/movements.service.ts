import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AGE_MODES,
  MOVEMENT_VARIANTS,
  VARIANT_LABELS,
  evaluatePublishGate,
  type Movement,
  type PublishGateFailure,
} from '@jessmove/shared';

/**
 * Library service. Enforces the five-variant publishing gate. §11.
 *
 * The gate is enforced in the API, not by process discipline. There is
 * no override flag and no admin bypass — a partial movement stays in
 * `draft` indefinitely.
 */
@Injectable()
export class MovementsService {
  private readonly movements = new Map<string, Movement>();

  list(): Movement[] {
    return [...this.movements.values()];
  }

  get(id: string): Movement | undefined {
    return this.movements.get(id);
  }

  upsert(movement: Movement): Movement {
    this.movements.set(movement.id, movement);
    return movement;
  }

  /** Dry-run the gate without attempting to publish. */
  checkGate(movement: Movement): PublishGateFailure[] {
    return evaluatePublishGate(movement, AGE_MODES);
  }

  publish(id: string): Movement {
    const movement = this.movements.get(id);
    if (!movement) {
      throw new BadRequestException(`Movement ${id} not found.`);
    }

    const failures = this.checkGate(movement);
    if (failures.length > 0) {
      throw new BadRequestException({
        code: 'publish_gate_failed',
        message:
          'A movement cannot be published until all five variants exist, each with a cue set ' +
          'for every age mode and a passed safety screening.',
        requiredVariants: MOVEMENT_VARIANTS.map((v) => VARIANT_LABELS[v]),
        failures,
      });
    }

    const published: Movement = {
      ...movement,
      state: 'published',
      updatedAt: new Date().toISOString(),
    };
    this.movements.set(id, published);
    return published;
  }

  /**
   * §23 — the global movement kill-switch. Any adverse event freezes the
   * implicated movement across the estate within 15 minutes.
   */
  retire(id: string, reason: string): Movement {
    const movement = this.movements.get(id);
    if (!movement) {
      throw new BadRequestException(`Movement ${id} not found.`);
    }
    const retired: Movement = {
      ...movement,
      state: 'retired',
      updatedAt: new Date().toISOString(),
    };
    this.movements.set(id, retired);
    return { ...retired, title: `${retired.title} (retired: ${reason})` };
  }
}
