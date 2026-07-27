import { Module } from '@nestjs/common';
import { AcuController } from './acu.controller';
import { WalletService } from './wallet.service';

@Module({
  controllers: [AcuController],
  providers: [WalletService],
  exports: [WalletService],
})
export class AcuModule {}
