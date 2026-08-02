import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CallbackDto, ConnectDto, IngestDto, RevokeDto, ScopesDto } from './wearables.dto';
import { WearablesService } from './wearables.service';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';

@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  @Get('providers')
  providers(): Record<string, unknown> {
    return this.wearables.providers();
  }

  @Post('connect')
  connect(@Body() body: ConnectDto): Record<string, unknown> {
    return this.wearables.connect(body.userId, body.provider, body.redirectUri);
  }

  @Post('callback')
  callback(@Body() body: CallbackDto): Promise<Record<string, unknown>> {
    return this.wearables.callback(body.userId, body.provider, body.code, body.redirectUri);
  }

  @Post('ingest')
  ingest(@Body() body: IngestDto): Record<string, unknown> {
    return this.wearables.ingest(body.userId, body.provider, body.age, body.samples);
  }

  @Post('scopes')
  scopes(@Body() body: ScopesDto): Record<string, unknown> {
    return this.wearables.narrowScopes(body.userId, body.provider, body.scopes);
  }

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
