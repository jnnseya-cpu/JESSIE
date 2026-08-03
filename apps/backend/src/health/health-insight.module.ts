import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { FoodlensModule } from '../foodlens/foodlens.module';
import { ConditionsService } from './conditions.service';
import { HealthInsightController } from './health-insight.controller';

@Module({
  imports: [AuthModule, ActivityModule, FoodlensModule],
  controllers: [HealthInsightController],
  providers: [ConditionsService],
})
export class HealthInsightModule {}
