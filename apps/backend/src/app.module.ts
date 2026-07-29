import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AcuModule } from './acu/acu.module';
import { AiModule } from './ai/ai.module';
import { BlogModule } from './blog/blog.module';
import { BodyModule } from './body/body.module';
import { CommsModule } from './comms/comms.module';
import { ContextModule } from './context/context.module';
import { GrowthModule } from './growth/growth.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MovementsModule } from './movements/movements.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    AccountsModule,
    AcuModule,
    AiModule,
    BlogModule,
    BodyModule,
    CommsModule,
    ContextModule,
    GrowthModule,
    MailModule,
    MovementsModule,
    PrescriptionsModule,
    StripeModule,
    HealthModule,
  ],
})
export class AppModule {}
