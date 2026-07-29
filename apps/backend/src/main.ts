import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BRAND } from '@jessmove/shared';
import { AppModule } from './app.module';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request body available on req.rawBody.
  // The Stripe webhook signature is computed over the exact bytes Stripe
  // sent, so a parsed-and-reserialised body would never verify.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });
  configureApp(app);
  app.enableShutdownHooks();

  const prefix = process.env.API_PREFIX ?? 'api';

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`${BRAND.platform} API listening on :${port}/${prefix}`);
}

void bootstrap();
