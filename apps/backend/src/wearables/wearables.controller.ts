import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CallbackDto, ConnectDto, IngestDto, RevokeDto, ScopesDto } from './wearables.dto';
import { WearablesService } from './wearables.service';
import { SelfOnly } from '../auth/auth.guard';

/**
 * Wearable connections and the readings they produce.
 *
 * Every route that names a user is `@SelfOnly('userId')`, and the reason is
 * worth recording because for a while only the read was.
 *
 * `status/:userId` carried the guard; `connect`, `callback`, `ingest`,
 * `scopes` and `revoke` did not, and each of them takes the user from the
 * request body. Reading somebody else's device status was refused while
 * *writing* to their account was not — so an unauthenticated caller could
 * push fabricated step and heart-rate readings into another member's
 * account, narrow the scopes they had agreed to, or disconnect their watch
 * entirely. The readings feed the dashboard and the insight engine, which
 * means the injected numbers come back to that member as their own history.
 *
 * The guard reads the parameter from the body as well as the path, so the
 * same decorator covers both shapes. Platform staff still pass, which is
 * what keeps support able to act on a member's behalf.
 */
@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  /** The catalogue of supported providers. Carries nobody's data. */
  @Get('providers')
  providers(): Record<string, unknown> {
    return this.wearables.providers();
  }

  @SelfOnly('userId')
  @Post('connect')
  connect(@Body() body: ConnectDto): Record<string, unknown> {
    return this.wearables.connect(body.userId, body.provider, body.redirectUri);
  }

  @SelfOnly('userId')
  @Post('callback')
  callback(@Body() body: CallbackDto): Promise<Record<string, unknown>> {
    return this.wearables.callback(body.userId, body.provider, body.code, body.redirectUri);
  }

  @SelfOnly('userId')
  @Post('ingest')
  ingest(@Body() body: IngestDto): Record<string, unknown> {
    return this.wearables.ingest(body.userId, body.provider, body.age, body.samples);
  }

  @SelfOnly('userId')
  @Post('scopes')
  scopes(@Body() body: ScopesDto): Record<string, unknown> {
    return this.wearables.narrowScopes(body.userId, body.provider, body.scopes);
  }

  @SelfOnly('userId')
  @Post('revoke')
  revoke(@Body() body: RevokeDto): Record<string, unknown> {
    return this.wearables.revoke(body.userId, body.provider);
  }

  @SelfOnly('userId')
  @Get('status/:userId')
  status(@Param('userId') userId: string): Record<string, unknown> {
    return this.wearables.status(userId);
  }
}
