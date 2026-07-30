import { Body, Controller, Get, Post } from '@nestjs/common';
import { AnalyzeDto } from './foodlens.dto';
import { FoodlensService } from './foodlens.service';

@Controller('foodlens')
export class FoodlensController {
  constructor(private readonly foodlens: FoodlensService) {}

  @Get('policy')
  policy(): Record<string, unknown> {
    return this.foodlens.policy();
  }

  @Post('analyze')
  analyze(@Body() body: AnalyzeDto): Promise<Record<string, unknown>> {
    return this.foodlens.analyze(body);
  }
}
