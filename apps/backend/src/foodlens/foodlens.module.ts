import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { FoodlensController } from './foodlens.controller';
import { FoodlensService } from './foodlens.service';
import { BarcodeService } from './barcode.service';
import { FoodLogService } from './food-log.service';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [FoodlensController],
  providers: [FoodlensService, BarcodeService, FoodLogService],
  exports: [FoodLogService],
})
export class FoodlensModule {}
