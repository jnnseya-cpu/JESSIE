import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SignatureInterceptor } from './common/signature.interceptor';

/**
 * Everything that makes the app the JESS MOVE API, independent of how it
 * is served.
 *
 * Two entry points call this: `main.ts` (a long-running server — local,
 * Docker, a VPS) and `serverless.ts` (one Vercel function). Splitting the
 * configuration out is what stops the two from drifting: a pipe added in
 * one place used to be a pipe silently missing from the other.
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

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  return app;
}
