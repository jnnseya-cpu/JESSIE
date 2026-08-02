import { Body, Controller, Delete, Get, Param, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { StateService } from './state.service';
import { AUTOSAVE } from '@jessmove/shared';
import { STATE_KEYS } from './state.logic';

@Controller('state')
export class StateController {
  constructor(
    private readonly state: StateService,
    private readonly auth: AuthService,
  ) {}

  /** What the client may save, and how often it should. */
  @Get('policy')
  policy() {
    return {
      keys: STATE_KEYS,
      debounceMs: AUTOSAVE.debounceMs,
      maxIntervalMs: AUTOSAVE.maxIntervalMs,
      note: 'Consent, date of birth and anything clinical are never saved automatically.',
    };
  }

  @Get()
  async all(@Req() req: Request) {
    return this.state.all(this.session(req).uid);
  }

  @Put(':key')
  async save(@Req() req: Request, @Param('key') key: string, @Body() body: { value: unknown }) {
    return this.state.save(this.session(req).uid, key, body?.value);
  }

  @Delete(':key')
  async clear(@Req() req: Request, @Param('key') key: string) {
    return this.state.clear(this.session(req).uid, key);
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }
}
