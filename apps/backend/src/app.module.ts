import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcuModule } from './acu/acu.module';
import { AiModule } from './ai/ai.module';
import { BlogModule } from './blog/blog.module';
import { BodyModule } from './body/body.module';
import { CommsModule } from './comms/comms.module';
import { ContextModule } from './context/context.module';
import { GrowthModule } from './growth/growth.module';
import { HealthModule } from './health/health.module';
import { MovementsModule } from './movements/movements.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    AcuModule,
    AiModule,
    BlogModule,
    BodyModule,
    CommsModule,
    ContextModule,
    GrowthModule,
    MovementsModule,
    PrescriptionsModule,
    HealthModule,
  ],
})
export class AppModule {}
