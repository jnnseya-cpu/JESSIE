import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DeleteAccountDto, ForgotDto, LoginDto, MediaUploadDto, RegisterDto, ResetDto, UpdateNameDto } from './auth.dto';
import { AdminOnly } from './auth.guard';
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

  /** Admin: find an account by name, email or exact id. */
  @AdminOnly()
  @Get('admin/users')
  async adminUsers(@Req() req: Request, @Query('q') q?: string) {
    this.session(req);
    if (!q || q.trim().length < 2) return { users: [] };
    return { users: await this.auth.searchUsers(q) };
  }

  /** Whether auth is configured, which user store is live, and enforcement. */
  @Get('status')
  status() {
    return this.auth.status();
  }

  /** The dated, signed form token both doors require. */
  @Get('challenge')
  challenge() {
    return this.auth.issueChallenge();
  }

  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.assertHuman(body.challenge, req.ip ?? 'unknown', 'register');
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
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.assertHuman(body.challenge, req.ip ?? 'unknown', 'login');
    const result = await this.auth.login(body.email, body.password);
    this.setCookie(res, result.token);
    return { userId: result.userId, kind: result.kind };
  }

  @Post('forgot')
  async forgot(@Body() body: ForgotDto, @Req() req: Request) {
    this.auth.assertHuman(body.challenge, req.ip ?? 'unknown', 'forgot');
    return this.auth.forgotPassword(body.email);
  }

  @Post('reset')
  async reset(@Body() body: ResetDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.resetPassword(body.token, body.password);
    this.setCookie(res, result.token);
    return { reset: true, userId: result.userId };
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
    return this.auth.me(this.session(req));
  }

  @Patch('me')
  async updateMe(@Req() req: Request, @Body() body: UpdateNameDto) {
    return this.auth.updateName(this.session(req), body.displayName);
  }

  @Post('me/media')
  async media(@Req() req: Request, @Body() body: MediaUploadDto) {
    return this.auth.attachMedia(this.session(req), body.slot, body.mimeType, body.dataBase64);
  }

  /** The danger zone. Deletes the account and ends the session. */
  @Post('me/delete')
  async deleteMe(
    @Req() req: Request,
    @Body() body: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.deleteAccount(this.session(req), body.password);
    res.clearCookie('jm_session', { domain: process.env.COOKIE_DOMAIN, path: '/' });
    return result;
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }
}
