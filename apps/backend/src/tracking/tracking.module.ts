import { Global, Module } from '@nestjs/common';
import { ConversionsService } from './conversions.service';

/**
 * Global so that the two places a conversion actually happens — creating an
 * account, and a paid invoice — can record one without either of them
 * importing a tracking module and acquiring an opinion about advertising.
 */
@Global()
@Module({
  providers: [ConversionsService],
  exports: [ConversionsService],
})
export class TrackingModule {}
