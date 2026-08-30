import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  AGE_MODES,
  DELIVERY_TIER_DEFINITIONS,
  MOVEMENT_VARIANTS,
  SUPPORT_LADDER,
  VARIANT_LABELS,
  isDownwardSubstitution,
  type Movement,
} from '@jessmove/shared';
import { MovementsService } from './movements.service';
import { AdminOnly } from '../auth/auth.guard';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  list() {
    return this.movements.list();
  }

  /** The publishing contract, exposed so Studio authors can see the gate. */
  @Get('gate')
  gate() {
    return {
      /*
       * A substitution may only ever move down the support ladder.
       * `isDownwardSubstitution` is the rule and it was published nowhere,
       * so a client offering a swap had to infer the direction from the
       * ladder order. Publishing the legal moves means it cannot guess
       * wrong and offer somebody a harder variant as a "substitution".
       */
      legalSubstitutions: SUPPORT_LADDER.flatMap((from) =>
        SUPPORT_LADDER.filter((to) => isDownwardSubstitution(from, to)).map(
          (to) => `${from} -> ${to}`,
        ),
      ),

      requiredVariants: MOVEMENT_VARIANTS.map((v) => ({
        key: v,
        label: VARIANT_LABELS[v],
      })),
      requiredAgeModes: AGE_MODES,
      deliveryTiers: DELIVERY_TIER_DEFINITIONS,
      rule:
        'A movement cannot reach `published` without all five variants, a cue set for every ' +
        'age mode, and a passed contraindication screening. There is no override.',
    };
  }

  @AdminOnly()
  @Post()
  upsert(@Body() movement: Movement) {
    return this.movements.upsert(movement);
  }

  @Post(':id/check')
  check(@Param('id') id: string) {
    const movement = this.movements.get(id);
    if (!movement) return { found: false };
    return { found: true, failures: this.movements.checkGate(movement) };
  }

  @AdminOnly()
  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.movements.publish(id);
  }
}
