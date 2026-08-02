import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignatureInterceptor } from './common/signature.interceptor';

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

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new SignatureInterceptor());

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
