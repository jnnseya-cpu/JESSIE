import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcuModule } from '../acu/acu.module';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';

@Module({
  imports: [ConfigModule, AcuModule],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
