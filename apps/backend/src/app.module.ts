import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AcuModule } from './acu/acu.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { BlogModule } from './blog/blog.module';
import { BodyModule } from './body/body.module';
import { CommsModule } from './comms/comms.module';
import { ContextModule } from './context/context.module';
import { DbModule } from './db/db.module';
import { FoodlensModule } from './foodlens/foodlens.module';
import { GrowthModule } from './growth/growth.module';
import { WearablesModule } from './wearables/wearables.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MovementsModule } from './movements/movements.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { PushModule } from './push/push.module';
import { StripeModule } from './stripe/stripe.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    AccountsModule,
    AcuModule,
    AiModule,
    AuthModule,
    BlogModule,
    BodyModule,
    CommsModule,
    ContextModule,
    DbModule,
    FoodlensModule,
    GrowthModule,
    WearablesModule,
    MailModule,
    MovementsModule,
    PrescriptionsModule,
    PushModule,
    StripeModule,
    HealthModule,
  ],
})
export class AppModule {}
