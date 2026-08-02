import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { MovaController } from './mova.controller';
import { MovaService } from './mova.service';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [MovaController],
  providers: [MovaService],
})
export class MovaModule {}
