import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FoodlensController } from './foodlens.controller';
import { FoodlensService } from './foodlens.service';

@Module({
  imports: [AiModule],
  controllers: [FoodlensController],
  providers: [FoodlensService],
})
export class FoodlensModule {}
