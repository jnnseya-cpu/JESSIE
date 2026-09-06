import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ContextModule } from '../context/context.module';
import { PrescriptionsController } from './prescriptions.controller';
import { PrescriptionsService } from './prescriptions.service';

@Module({
  imports: [ContextModule, ActivityModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
