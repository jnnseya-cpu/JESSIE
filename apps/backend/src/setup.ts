import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllowanceFilter } from './common/allowance.filter';
import { InstructionFilter } from './common/instruction.filter';
import { SignatureInterceptor } from './common/signature.interceptor';

/** The slice of the response the header middleware writes to. */
interface ResponseLike {
  setHeader: (name: string, value: string) => void;
  removeHeader?: (name: string) => void;
}

/**
 * Everything that makes the app the JESS MOVE API, independent of how it
 * is served.
 *
 * `main.ts` is the only entry point — locally it listens on :4000, and on
 * Vercel the platform's NestJS support finds `src/main.ts`, builds it, and
 * runs the same listening server as a function. One entry point, one
 * configuration, nothing to drift.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Uploads arrive as base64 inside JSON; the 12mb ceiling covers the 10MB
  // cover-image limit plus base64's one-third overhead. Registered through
  // Nest so req.rawBody keeps working — the Stripe webhook depends on it.
  const express = app as NestExpressApplication;
  if (typeof express.useBodyParser === 'function') {
    express.useBodyParser('json', { limit: '15mb' });
    express.useBodyParser('urlencoded', { extended: true, limit: '15mb' });
  }

  /**
   * Security headers, and the removal of one that should never have been
   * sent.
   *
   * The site sets these in `apps/frontend/vercel.json`. The API set none
   * of them, and answered every request with `X-Powered-By: Express` —
   * so the one host that returns members' data, moves money and takes the
   * Stripe webhook was also the one host announcing its framework and
   * omitting every hardening header the site had.
   *
   * Written by hand rather than by adding Helmet. This is nine header
   * assignments; a dependency for nine header assignments is a dependency
   * to audit, patch and explain forever.
   *
   * `frame-ancestors 'none'` and a `default-src 'none'` CSP are safe here
   * in a way they would not be on the site: this host serves JSON. There
   * is nothing to frame and nothing to load.
   */
  const server = app as unknown as {
    use: (fn: (req: unknown, res: ResponseLike, next: () => void) => void) => void;
    getHttpAdapter?: () => { getInstance?: () => { disable?: (s: string) => void } };
  };

  server.getHttpAdapter?.()?.getInstance?.()?.disable?.('x-powered-by');

  server.use((_req: unknown, res: ResponseLike, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    // Two years, matching the site. An API reached over plain HTTP once is
    // an API whose session cookie has been read once.
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    res.removeHeader?.('X-Powered-By');
    next();
  });

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new SignatureInterceptor());

  // An empty allowance is a 402 with an explanation, never a 500 that
  // tells the client to retry something that will never succeed. Text
  // written as an instruction to the system is a 400 that says how to
  // rephrase, never a stack trace and never a lesson in what got close.
  app.useGlobalFilters(new AllowanceFilter(), new InstructionFilter());

  /**
   * Who may call this API from a browser.
   *
   * CORS_ORIGINS is the answer when it is set. When it is not, the default
   * used to be localhost alone — which on a real deployment means the live
   * site cannot call its own API and every signed-in screen is broken,
   * with a console error nobody outside the browser ever sees. So the
   * platform's own origins are always allowed, and local development is
   * kept for the times somebody is doing exactly that.
   */
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const always = [
    'https://www.jessmove.com',
    'https://jessmove.com',
    'http://localhost:3000',
    'http://localhost:3100',
  ];
  const origins = [...new Set([...configured, ...always])];

  app.enableCors({
    // A preview deployment gets its own generated hostname, so the site's
    // own subdomains are matched rather than listed.
    origin: (origin: string | undefined, done: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return done(null, true); // curl, health checks, native apps
      const allowed =
        origins.includes(origin) || /^https:\/\/[a-z0-9-]+\.jessmove\.com$/i.test(origin);
      done(null, allowed);
    },
    credentials: true,
  });

  return app;
}
