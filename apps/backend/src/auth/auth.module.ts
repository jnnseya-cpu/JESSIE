import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module';
import { MailModule } from '../mail/mail.module';
import { PushModule } from '../push/push.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './auth.guard';
import { UserStore } from './user-store';

@Module({
  imports: [ConfigModule, AccountsModule, MailModule, PushModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserStore,
    // Global: every request gets its session resolved; @Protected routes
    // are enforced when AUTH_ENFORCE is on.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  /*
   * `AbuseService` was registered here and injected by nothing.
   *
   * It metered a small free allowance for strangers using the paid AI
   * surfaces. Two later decisions took its job: the product stopped
   * serving anonymous analysis at all (FoodLens reaches the gateway with
   * no payer and says what an account would give), and the credential
   * doors moved to `assertHuman`, which counts attempts per address in
   * `door_attempts` and so survives a restart and spans instances —
   * which an in-memory map on serverless never did.
   *
   * Left in place it was worse than absent: a reader of this module
   * would conclude the platform had a rate limiter it was not calling.
   */
  exports: [AuthService, UserStore],
})
export class AuthModule {}
