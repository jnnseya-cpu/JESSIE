import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { FoodlensModule } from '../foodlens/foodlens.module';
import { AssuranceController } from './assurance.controller';
import { ConditionsService } from './conditions.service';
import { FallsController, FallsService } from './falls.controller';
import { HealthInsightController } from './health-insight.controller';

@Module({
  imports: [AuthModule, ActivityModule, FoodlensModule],
  controllers: [HealthInsightController, FallsController, AssuranceController],
  providers: [ConditionsService, FallsService],
})
export class HealthInsightModule {}
