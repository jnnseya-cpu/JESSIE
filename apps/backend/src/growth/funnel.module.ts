import { Global, Module } from '@nestjs/common';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';
import { ReferrersController } from './referrers.controller';
import { ReferrersService } from './referrers.service';

/**
 * Global, because the step that matters is recorded where an account is
 * created — inside the auth module, which the growth module already
 * imports. Making the funnel available everywhere is how that happens
 * without a circular import, and it means a step added later at any
 * surface does not need a module rewired to be counted.
 */
@Global()
@Module({
  controllers: [FunnelController, ReferrersController],
  providers: [FunnelService, ReferrersService],
  exports: [FunnelService, ReferrersService],
})
export class FunnelModule {}
