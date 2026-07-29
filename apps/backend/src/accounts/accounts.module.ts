import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [AccountsController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class AccountsModule {}
