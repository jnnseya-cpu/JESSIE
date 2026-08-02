import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { AnalyzeDto, ReadBarcodeDto } from './foodlens.dto';
import { basketFrom, type BasketProduct } from './basket.logic';
import { FoodlensService } from './foodlens.service';

@Controller('foodlens')
export class FoodlensController {
  constructor(
    private readonly foodlens: FoodlensService,
    private readonly auth: AuthService,
  ) {}

  /** Whose allowance pays, when there is a session to charge. */
  private billTo(req: Request): string | undefined {
    const token = tokenFrom(req);
    return (token ? this.auth.verify(token)?.uid : undefined) ?? undefined;
  }

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

  /** The supermarket case: one code in, the packet's own label out. */
  @Get('barcode/:code')
  scan(@Param('code') code: string): Promise<Record<string, unknown>> {
    return this.foodlens.scan(code);
  }

  /** Read a barcode off a photograph, for devices that will not stream. */
  @Post('barcode/read')
  readBarcode(@Req() req: Request, @Body() body: ReadBarcodeDto): Promise<Record<string, unknown>> {
    return this.foodlens.readBarcode(body.mimeType, body.dataBase64, this.billTo(req));
  }

  /** The trolley, added up: totals, days of food, and what to swap. */
  @Post('basket')
  basket(@Body() body: { products?: BasketProduct[] }) {
    return basketFrom(body?.products ?? []);
  }

  @Post('analyze')
  analyze(@Req() req: Request, @Body() body: AnalyzeDto): Promise<Record<string, unknown>> {
    return this.foodlens.analyze({ ...body, billTo: this.billTo(req) });
  }
}
