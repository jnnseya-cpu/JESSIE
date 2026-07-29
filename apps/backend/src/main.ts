import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BRAND } from '@jessmove/shared';
import { AppModule } from './app.module';
import { SignatureInterceptor } from './common/signature.interceptor';

async function bootstrap(): Promise<void> {
  // rawBody keeps the untouched request body available on req.rawBody.
  // The Stripe webhook signature is computed over the exact bytes Stripe
  // sent, so a parsed-and-reserialised body would never verify.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  const prefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(prefix);

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

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`${BRAND.platform} API listening on :${port}/${prefix}`);
}

void bootstrap();
