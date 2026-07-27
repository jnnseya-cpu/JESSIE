import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { ContextModule } from './context/context.module';
import { HealthModule } from './health/health.module';
import { MovementsModule } from './movements/movements.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    AiModule,
    ContextModule,
    MovementsModule,
    PrescriptionsModule,
    HealthModule,
  ],
})
export class AppModule {}
