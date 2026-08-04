import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { GrowthController } from './growth.controller';
import { GrowthEngineController } from './growth-engine.controller';
import { GrowthEngineService } from './growth-engine.service';
import { GrowthResultsService } from './growth-results.service';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [GrowthController, GrowthEngineController],
  providers: [GrowthEngineService, GrowthResultsService],
  exports: [GrowthEngineService, GrowthResultsService],
})
export class GrowthModule {}
