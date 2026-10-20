import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { FoodlensController } from './foodlens.controller';
import { FoodlensService } from './foodlens.service';
import { BarcodeService } from './barcode.service';
import { FoodLogService } from './food-log.service';
import { FoodConstraintsService } from './constraints.service';
import { BandModule } from '../body/band.module';

@Module({
  // BandModule so a scanned meal can be coloured against the member's
  // stored energy band. It is a module of its own precisely so this import
  // does not make BodyModule and FoodlensModule circular.
  imports: [AuthModule, AiModule, BandModule],
  controllers: [FoodlensController],
  providers: [FoodlensService, BarcodeService, FoodLogService, FoodConstraintsService],
  exports: [FoodLogService],
})
export class FoodlensModule {}
