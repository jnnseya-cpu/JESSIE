import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
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

  /**
   * The guardian's confirmation click — a plain HTML page, because the
   * person opening it is a parent on their phone, not an API client.
   */
  @Get('guardian/confirm')
  @Header('content-type', 'text/html; charset=utf-8')
  async guardianConfirm(@Query('token') token?: string): Promise<string> {
    const page = (title: string, body: string) =>
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${title} — JESS MOVE</title></head>` +
      `<body style="font-family:system-ui,sans-serif;background:#0b2540;color:#f4faf9;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">` +
      `<div><h1 style="margin:0 0 12px">${title}</h1><p style="max-width:44ch;line-height:1.6">${body}</p>` +
      `<p><a href="https://www.jessmove.com" style="color:#2dd4bf">jessmove.com</a></p></div></body></html>`;

    const result = token ? await this.auth.confirmGuardian(token) : null;
    if (!result) {
      return page(
        'This link is not valid',
        'It may have expired (links work for 7 days) or been used with a different account. ' +
          'Ask for a fresh request from the account page.',
      );
    }
    return page(
      'Thank you — confirmed',
      `You are now the confirmed guardian for ${result.minorName}. Their JESS MOVE account is active, ` +
        'with every under-18 protection on: no calorie, weight or appearance framing, ever.',
    );
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
