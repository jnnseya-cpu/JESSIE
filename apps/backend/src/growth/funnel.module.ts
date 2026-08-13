import { Global, Module } from '@nestjs/common';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';

/**
 * Global, because the step that matters is recorded where an account is
 * created — inside the auth module, which the growth module already
 * imports. Making the funnel available everywhere is how that happens
 * without a circular import, and it means a step added later at any
 * surface does not need a module rewired to be counted.
 */
@Global()
@Module({
  controllers: [FunnelController],
  providers: [FunnelService],
  exports: [FunnelService],
})
export class FunnelModule {}
