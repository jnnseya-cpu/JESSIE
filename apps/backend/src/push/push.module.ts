import { Module } from '@nestjs/common';
import { NativePushService } from './native-push.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  controllers: [PushController],
  providers: [PushService, NativePushService],
  // `PushService` stays the only export. Every caller — the scheduler,
  // account deletion, the admin test — goes through one door, and the
  // fan-out across web and native happens behind it rather than at each
  // call site, where one of them would eventually forget a transport.
  exports: [PushService],
})
export class PushModule {}
