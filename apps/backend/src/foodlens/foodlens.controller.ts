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

  /**
   * Sends a tiny generated image to the vision model and reports what
   * every provider actually said. "The model was unavailable" is the
   * right answer for a member and useless for fixing it; this names the
   * refusal, per provider, from the deployment serving the request.
   */
  @Get('probe')
  probe(): Promise<Record<string, unknown>> {
    return this.foodlens.probeVision();
  }

  @Post('analyze')
  analyze(@Body() body: AnalyzeDto): Promise<Record<string, unknown>> {
    return this.foodlens.analyze(body);
  }
}
