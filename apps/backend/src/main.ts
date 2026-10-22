import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BRAND } from '@jessmove/shared';
import { AppModule } from './app.module';
import { configureApp } from './setup';
import { runtimeReport } from './health/runtime.logic';

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request body available on req.rawBody.
  // The Stripe webhook signature is computed over the exact bytes Stripe
  // sent, so a parsed-and-reserialised body would never verify.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true, bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();

  const prefix = process.env.API_PREFIX ?? 'api';

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`${BRAND.platform} API listening on :${port}/${prefix}`);

  /*
   * The runtime, named in full, here and not on the public endpoint.
   *
   * `/api/health` publishes the verdict without the version, because a
   * precise patch number on an unauthenticated endpoint tells somebody
   * probing for the October 2026 code-execution fault whether this host
   * is worth their time. The owner reads the log; a stranger does not.
   */
  const runtime = runtimeReport(process.version);
  if (runtime.patched) {
    logger.log(`Node ${runtime.version} — carries the October 2026 security fixes.`);
  } else {
    logger.warn(`Node ${runtime.version}: ${runtime.says}`);
  }
}

void bootstrap();
