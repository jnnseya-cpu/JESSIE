import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DbModule } from '../db/db.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AiModule, DbModule],
  controllers: [HealthController],
})
export class HealthModule {}
