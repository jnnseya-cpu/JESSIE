import { Module } from '@nestjs/common';
import { BodyController } from './body.controller';
import { BodyService } from './body.service';

@Module({
  controllers: [BodyController],
  providers: [BodyService],
  exports: [BodyService],
})
export class BodyModule {}
