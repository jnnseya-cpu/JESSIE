import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { MovaController } from './mova.controller';
import { MovaService } from './mova.service';

@Module({
  imports: [AiModule],
  controllers: [MovaController],
  providers: [MovaService],
})
export class MovaModule {}
