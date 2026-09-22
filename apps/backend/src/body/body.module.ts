import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { BodyController } from './body.controller';
import { BodyService } from './body.service';

@Module({
  // ActivityModule for the reading history the trajectory is computed
  // from; AuthModule because `@SelfOnly` on that route needs a session to
  // compare the path parameter against.
  imports: [ActivityModule, AuthModule],
  controllers: [BodyController],
  providers: [BodyService],
  exports: [BodyService],
})
export class BodyModule {}
