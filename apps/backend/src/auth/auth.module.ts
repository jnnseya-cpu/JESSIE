import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './auth.guard';
import { UserStore } from './user-store';

@Module({
  imports: [ConfigModule, AccountsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserStore,
    // Global: every request gets its session resolved; @Protected routes
    // are enforced when AUTH_ENFORCE is on.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, UserStore],
})
export class AuthModule {}
