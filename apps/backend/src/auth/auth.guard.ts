import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { SessionPayload } from './token';

/**
 * Session extraction and route protection.
 *
 * The token arrives as the `jm_session` cookie (the site) or an
 * `Authorization: Bearer` header (curl, tests, future native apps). Both
 * verify identically.
 *
 * `@Protected()` routes require a session ONLY while AUTH_ENFORCE=true.
 * Off, the guard resolves a session when one is present and lets the
 * request through when none is — which keeps the pilot's /try and /console
 * usable before accounts exist. /auth/status reports the mode, loudly.
 */

export const PROTECTED_KEY = 'jm:protected';
export const Protected = () => SetMetadata(PROTECTED_KEY, true);

export const ADMIN_KEY = 'jm:admin';
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

export function tokenFrom(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'jm_session') return decodeURIComponent(rest.join('='));
  }
  return null;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { session?: SessionPayload }>();

    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (session) req.session = session;

    const needsAuth = this.reflector.getAllAndOverride<boolean>(PROTECTED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const needsAdmin = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const selfParam = this.reflector.getAllAndOverride<string>(SELF_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // One person's records, asked for by that person — or by staff.
    if (selfParam) {
      if (!session) {
        throw new UnauthorizedException('this endpoint needs a signed-in session');
      }
      if (session.kind !== 'platform_staff') {
        const params = req.params as Record<string, string | undefined>;
        const asked = params?.[selfParam] ?? (req.body as Record<string, unknown> | undefined)?.[selfParam];
        if (typeof asked === 'string' && asked !== session.uid) {
          throw new ForbiddenException('that is somebody else’s account');
        }
      }
      return true;
    }

    if (!needsAuth && !needsAdmin) return true;

    // Administration is never relaxed.
    //
    // AUTH_ENFORCE exists so the pilot's demo surfaces stay usable before
    // everyone has an account. It must never have applied to @AdminOnly:
    // with enforcement off, any unauthenticated request could mint
    // allowance, read the member directory or push notifications to
    // anybody. A convenience switch that also unlocks the money is not a
    // convenience switch.
    if (needsAdmin) {
      if (!session) {
        throw new UnauthorizedException('this endpoint needs a signed-in administrator');
      }
      if (session.kind !== 'platform_staff') {
        throw new UnauthorizedException('this endpoint needs a platform administrator');
      }
      return true;
    }

    if (!this.auth.enforcing()) return true;

    if (!session) {
      throw new UnauthorizedException('this endpoint needs a signed-in session');
    }
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPayload | null => {
    const req = context.switchToHttp().getRequest<Request & { session?: SessionPayload }>();
    return req.session ?? null;
  },
);

/**
 * The route reads or writes one person's records, and that person must be
 * the one asking.
 *
 * `@AdminOnly` covers the platform's own doors. This covers the other
 * shape, which is more common and was wide open before a public launch:
 * `/acu/balance/:userId`, `/wearables/status/:userId`,
 * `/accounts/profiles/:userId` and their siblings all took an id from the
 * URL and answered with that account's data, to anybody who asked. A
 * member id is not a secret — it appears in the member's own responses —
 * so the only thing standing between one member and another's records was
 * that nobody had tried.
 *
 * Staff pass, because support has to be able to look. Everybody else must
 * be asking about themselves.
 */
export const SELF_ONLY_KEY = 'jm:self-only';

/** @param param the route parameter carrying the account id. */
export const SelfOnly = (param = 'userId') => SetMetadata(SELF_ONLY_KEY, param);
