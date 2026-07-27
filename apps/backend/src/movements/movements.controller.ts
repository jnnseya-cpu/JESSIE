import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  AGE_MODES,
  DELIVERY_TIER_DEFINITIONS,
  MOVEMENT_VARIANTS,
  VARIANT_LABELS,
  type Movement,
} from '@movequest/shared';
import { MovementsService } from './movements.service';

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

  @Post(':id/publish')
  publish(@Param('id') id: string) {
    return this.movements.publish(id);
  }
}
