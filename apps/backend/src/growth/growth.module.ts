import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';

@Module({ controllers: [GrowthController] })
export class GrowthModule {}
