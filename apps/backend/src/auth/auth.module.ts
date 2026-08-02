import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { AuthController } from './auth.controller';
import { AbuseService } from './abuse.service';
import { AuthService } from './auth.service';
import { SessionGuard } from './auth.guard';
import { UserStore } from './user-store';

@Module({
  imports: [ConfigModule, AccountsModule, MailModule, PushModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AbuseService,
    UserStore,
    // Global: every request gets its session resolved; @Protected routes
    // are enforced when AUTH_ENFORCE is on.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, AbuseService, UserStore],
})
export class AuthModule {}
