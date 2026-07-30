import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { SESSION_TTL_SECONDS } from './token';
import { tokenFrom } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string): void {
    const domain = process.env.COOKIE_DOMAIN; // .jessmove.com in production
    res.cookie('jm_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain,
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: '/',
    });
  }

  /** Whether auth is configured, which user store is live, and enforcement. */
  @Get('status')
  status() {
    return this.auth.status();
  }

  @Post('register')
  async register(@Body() body: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body);
    this.setCookie(res, result.token);
    return {
      userId: result.userId,
      kind: result.kind,
      pendingGuardian: result.pendingGuardian,
      note: result.pendingGuardian
        ? 'The account activates when the guardian confirms. Until then it is visible only to itself.'
        : undefined,
    };
  }

  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password);
    this.setCookie(res, result.token);
    return { userId: result.userId, kind: result.kind };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.cookie('jm_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN,
      maxAge: 0,
      path: '/',
    });
    return { loggedOut: true };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return this.auth.me(session);
  }
}
