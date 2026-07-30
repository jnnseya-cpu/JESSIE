import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { ProfilesService } from './profiles.service';
import { StorageService } from '../storage/storage.service';

@Module({
  controllers: [AccountsController],
  providers: [ProfilesService, StorageService],
  exports: [ProfilesService, StorageService],
})
export class AccountsModule {}
