import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Express } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './setup';

/**
 * The Vercel entry point.
 *
 * The whole NestJS API runs as one serverless function: bootstrapped once
 * per instance, cached, and handed each request as a plain Express app.
 * `app.init()` rather than `app.listen()` — Vercel owns the socket.
 *
 * Two things to know about this deployment shape, stated here because they
 * are properties of serverless rather than bugs:
 *
 * 1. **Memory does not persist.** Instances are created and recycled by
 *    Vercel, so the in-memory stores (demo accounts, wallets, the webhook
 *    dedupe set) reset whenever an instance does, and two concurrent
 *    instances do not share them. The fix is the database layer — Neon
 *    connects fine from Vercel — and until then this is a pilot
 *    deployment, not a production one.
 *
 * 2. **`NODEJS_HELPERS=0` must be set** on the Vercel project. Vercel's
 *    Node helpers pre-read the request body, which consumes the stream
 *    before body-parser sees it — and the Stripe webhook verifies its
 *    signature against the raw bytes. With helpers disabled the stream
 *    arrives intact and `rawBody` works exactly as it does everywhere
 *    else. If the webhook returns "raw request body is unavailable",
 *    this variable is the cause.
 */

let cached: Promise<Express> | null = null;

async function bootstrap(): Promise<Express> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true, bodyParser: false });
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Express;
}

export function createServer(): Promise<Express> {
  cached ??= bootstrap();
  return cached;
}
