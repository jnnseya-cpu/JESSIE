import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { PushModule } from '../push/push.module';
import { NudgeController } from './nudge.controller';
import { NudgeService } from './nudge.service';

@Module({
  imports: [ActivityModule, AuthModule, PrescriptionsModule, PushModule],
  controllers: [NudgeController],
  providers: [NudgeService],
  exports: [NudgeService],
})
export class NudgeModule {}
