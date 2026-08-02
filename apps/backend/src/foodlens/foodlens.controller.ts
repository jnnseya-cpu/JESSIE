import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { AnalyzeDto, LogEntryDto, ReadBarcodeDto } from './foodlens.dto';
import { basketFrom, packGrams, type BasketProduct } from './basket.logic';
import { FoodlensService } from './foodlens.service';
import { FoodLogService } from './food-log.service';
import { RETENTION_DAYS, WINDOW_DAYS, entryFromProduct, type LogWindow } from './food-log.logic';

@Controller('foodlens')
export class FoodlensController {
  constructor(
    private readonly foodlens: FoodlensService,
    private readonly foodLog: FoodLogService,
    private readonly auth: AuthService,
  ) {}

  /** Whose allowance pays, and whose ledger this lands in. */
  private who(req: Request): string | undefined {
    const token = tokenFrom(req);
    return (token ? this.auth.verify(token)?.uid : undefined) ?? undefined;
  }

  private requireWho(req: Request): string {
    const uid = this.who(req);
    if (!uid) throw new UnauthorizedException('no valid session');
    return uid;
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

  /** The windows on offer, and how long anything is kept at all. */
  @Get('log/policy')
  logPolicy() {
    return {
      windows: Object.entries(WINDOW_DAYS).map(([key, days]) => ({ key, days })),
      retentionDays: RETENTION_DAYS,
      autosaves: true,
      note:
        'Every scan is kept without you saving it, for three years, and you can clear the lot in one action. It is a record of what you scanned, never a claim about everything you ate.',
    };
  }

  /**
   * The ledger: everything scanned, added up, across a week, a month, a
   * year, or the whole three years that are kept.
   */
  @Get('log')
  async log(@Req() req: Request, @Query('window') window?: string) {
    const uid = this.requireWho(req);
    const chosen: LogWindow =
      window === 'week' || window === 'month' || window === 'year' || window === 'all'
        ? window
        : 'month';
    // Opportunistic, because a serverless deployment has no scheduler and
    // a cron nobody runs is a promise nobody keeps.
    void this.foodLog.prune();
    return this.foodLog.summary(uid, chosen);
  }

  /** Everything, gone. No soft delete, no grace period, no copy kept. */
  @Delete('log')
  clearLog(@Req() req: Request) {
    return this.foodLog.clear(this.requireWho(req));
  }

  /**
   * Adds a scanned product to the ledger with the pack size the member
   * actually bought — what the scanner list sends when a trolley is
   * confirmed, since a barcode on its own does not know the size.
   */
  @Post('log')
  async addToLog(@Req() req: Request, @Body() body: LogEntryDto) {
    const uid = this.requireWho(req);
    const entry = entryFromProduct({
      id: 'pending',
      name: body.name,
      barcode: body.barcode ?? null,
      grams: body.grams ?? packGrams(body.quantity ?? null),
      kcalPer100g: body.kcalPer100g ?? null,
      per100g: body.per100g ?? null,
    });
    const saved = await this.foodLog.record(uid, {
      kind: 'barcode',
      name: entry.name,
      barcode: entry.barcode,
      grams: entry.grams,
      kcal: entry.kcal,
      fatG: entry.fatG,
      saturatesG: entry.saturatesG,
      sugarsG: entry.sugarsG,
      saltG: entry.saltG,
      basis: 'label',
    });
    return {
      saved: saved !== null,
      entry: saved,
      note:
        saved === null
          ? 'Nothing to add up — that product had no readable pack size, or no figures on its label.'
          : 'Added to your ledger.',
    };
  }

  /** The supermarket case: one code in, the packet's own label out. */
  @Get('barcode/:code')
  async scan(@Req() req: Request, @Param('code') code: string): Promise<Record<string, unknown>> {
    const result = await this.foodlens.scan(code);

    // Recorded only when the label carries a pack size of its own. A code
    // lookup does not know what was bought; the scanner list adds the rest
    // with the quantity in the member's hand.
    const uid = this.who(req);
    if (uid && result.found) {
      const grams = packGrams((result.quantity as string | null) ?? null);
      if (grams) {
        const entry = entryFromProduct({
          id: 'pending',
          name: String(result.name ?? 'Scanned product'),
          barcode: String(result.barcode ?? code),
          grams,
          kcalPer100g: (result.kcalPer100g as number | null) ?? null,
          per100g: (result.per100g as BasketProduct['per100g']) ?? null,
        });
        void this.foodLog.record(uid, {
          kind: 'barcode',
          name: entry.name,
          barcode: entry.barcode,
          grams: entry.grams,
          kcal: entry.kcal,
          fatG: entry.fatG,
          saturatesG: entry.saturatesG,
          sugarsG: entry.sugarsG,
          saltG: entry.saltG,
          basis: 'label',
        });
      }
    }
    return result;
  }

  /** Read a barcode off a photograph, for devices that will not stream. */
  @Post('barcode/read')
  readBarcode(@Req() req: Request, @Body() body: ReadBarcodeDto): Promise<Record<string, unknown>> {
    return this.foodlens.readBarcode(body.mimeType, body.dataBase64, this.who(req));
  }

  /** The trolley, added up: totals, days of food, and what to swap. */
  @Post('basket')
  basket(@Body() body: { products?: BasketProduct[] }) {
    return basketFrom(body?.products ?? []);
  }

  @Post('analyze')
  async analyze(@Req() req: Request, @Body() body: AnalyzeDto): Promise<Record<string, unknown>> {
    const uid = this.who(req);
    const result = await this.foodlens.analyze({ ...body, billTo: uid });

    // A meal joins the ledger by itself — no save button, and nothing for
    // the member to remember. Only figures that were actually produced go
    // in; an analysis with nothing to total is dropped rather than stored
    // as a row of nulls.
    if (uid) {
      const energy = result.energy as { likely?: number; withheld?: boolean } | undefined;
      const rows = (result.frontOfPack as { nutrient: string; grams: number | null }[] | null) ?? [];
      const plateGrams = (result.plateGrams as number | undefined) ?? null;
      // Front-of-pack is per 100g; the ledger holds what was on the plate.
      const scale = plateGrams && plateGrams > 0 ? plateGrams / 100 : null;
      const onThePlate = (nutrient: string): number | null => {
        const row = rows.find((r) => r.nutrient === nutrient);
        // An unmeasured nutrient joins the ledger as nothing, never as zero.
        return row?.grams != null && scale ? Math.round(row.grams * scale * 10) / 10 : null;
      };
      const items = (result.items as { name: string }[] | undefined) ?? [];

      void this.foodLog.record(uid, {
        kind: body.mimeType ? 'photo' : 'declared',
        name: items.map((i) => i.name).slice(0, 3).join(', ') || 'Meal',
        barcode: body.barcode ?? null,
        grams: plateGrams,
        kcal: energy?.withheld ? null : (energy?.likely ?? null),
        fatG: onThePlate('fat'),
        saturatesG: onThePlate('saturates'),
        sugarsG: onThePlate('sugars'),
        saltG: onThePlate('salt'),
        basis: 'estimate',
      });
    }

    return result;
  }
}
