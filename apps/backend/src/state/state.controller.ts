import { Body, Controller, Delete, Get, Param, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { StateService } from './state.service';
import {
  AUTOSAVE,
  NEVER_AUTOSAVED_FIELDS,
  retryDelayMs,
} from '@jessmove/shared';
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
      /*
       * The three rules a client needs to behave correctly, and which the
       * note below has always described in prose while the values sat
       * unpublished. A client that cannot read them has to reimplement
       * them, which is how a field that must never autosave ends up
       * autosaving in one place.
       */
      neverAutosaved: NEVER_AUTOSAVED_FIELDS,
      retryDelaysMs: [0, 1, 2, 3, 4].map((attempt) => retryDelayMs(attempt)),
      warnOnLeaveAfterMs: AUTOSAVE.debounceMs,
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
