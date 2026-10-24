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
import { AnalyzeDto, BasketDto, LogEntryDto, ReadBarcodeDto } from './foodlens.dto';
import { basketFrom, packGrams, type BasketProduct } from './basket.logic';
import { FoodlensService } from './foodlens.service';
import { FoodLogService } from './food-log.service';
import { RETENTION_DAYS, WINDOW_DAYS, entryFromProduct, type LogWindow } from './food-log.logic';

import {
  SWAP_CONSTRAINTS,
  SWAP_LEVELS,
  permittedSwapLevels,
  selectSwaps,
} from '@jessmove/foodlens';
import { dayStanding } from '@jessmove/body-command';
import { BandStoreService } from '../body/band-store.service';
import { FoodConstraintsService } from './constraints.service';
import { FoodConstraintsDto } from './foodlens.dto';

@Controller('foodlens')
export class FoodlensController {
  constructor(
    private readonly foodlens: FoodlensService,
    private readonly foodLog: FoodLogService,
    private readonly auth: AuthService,
    private readonly bands: BandStoreService,
    private readonly constraints: FoodConstraintsService,
  ) {}

  /** Whose ledger a scan lands in. Undefined for somebody with no account. */
  private who(req: Request): string | undefined {
    const token = tokenFrom(req);
    return (token ? this.auth.verify(token)?.uid : undefined) ?? undefined;
  }

  /**
   * Whose allowance pays.
   *
   * The same session that owns the ledger, and nobody else — there is no
   * anonymous analysis any more. The only free AI on the platform is the
   * free tier on an account, so a visitor reaches the gateway with no
   * payer and is told what an account would give them rather than being
   * quietly served at somebody else's expense.
   */
  private payer(req: Request): string | undefined {
    return this.who(req);
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
  /**
   * Which suggestions this member may be shown, and why.
   *
   * The ten constraints have been on the FoodLens page since it was
   * written and honoured by nothing — a claim with no implementation.
   * This is the implementation: declared, never inferred, and the ladder
   * narrows when nothing has been declared rather than guessing.
   */
  @Get('swaps/policy')
  swapPolicy(@Query('cuisine') cuisine?: string, @Query('excludes') excludes?: string) {
    const constraints = {
      declared: SWAP_CONSTRAINTS,
      excludes: (excludes ?? '').split(',').map((e) => e.trim()).filter(Boolean),
      cuisine: cuisine?.trim() || undefined,
    };
    const levels = permittedSwapLevels(constraints);
    return {
      constraints: SWAP_CONSTRAINTS,
      permittedLevels: levels,
      /*
       * Run against the ladder itself so the answer is the real one
       * rather than a description of it.
       */
      example: selectSwaps(
        SWAP_LEVELS.map((l) => ({
          level: l.level,
          action: l.example,
          expectedEffect: 'Directional only.',
          respects: [],
        })),
        constraints,
      ),
      note:
        'Declared by you, never inferred. Working out somebody’s cuisine from their shopping is ' +
        'inferring ethnicity without asking, so this stays something you tell us.',
    };
  }

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
    /*
     * Spread, not hand-copied.
     *
     * This used to list every field by name, and adding protein to the
     * ledger promptly proved why that is a trap: two of the three write
     * sites silently kept writing the old five, the row went in with a
     * null protein figure, and nothing failed — the ledger just quietly
     * had no protein in it. `id` and `at` are the record's to set, so they
     * are the only two dropped.
     */
    const { id: _id, at: _at, ...fields } = entry;
    const saved = await this.foodLog.record(uid, fields);
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
        const { id: _id, at: _at, ...fields } = entry;
        void this.foodLog.record(uid, fields);
      }
    }
    return result;
  }

  /** Read a barcode off a photograph, for devices that will not stream. */
  @Post('barcode/read')
  readBarcode(@Req() req: Request, @Body() body: ReadBarcodeDto): Promise<Record<string, unknown>> {
    const uid = this.who(req);
    return this.foodlens.readBarcode(body.mimeType, body.dataBase64, uid);
  }

  /**
   * The trolley, added up: totals, days of food, and what to swap.
   *
   * `BasketDto` rather than an inline type. An inline
   * `{ products?: BasketProduct[] }` is erased at compile time, so the
   * global ValidationPipe had nothing to check and a string arrived
   * where an array belonged — see the note on `BasketProductDto`.
   */
  @Post('basket')
  basket(@Body() body: BasketDto) {
    return basketFrom((body?.products ?? []) as BasketProduct[]);
  }

  @Post('analyze')
  async analyze(@Req() req: Request, @Body() body: AnalyzeDto): Promise<Record<string, unknown>> {
    const uid = this.who(req);
    const result = await this.foodlens.analyze({ ...body, billTo: this.payer(req) });

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
      /*
       * Null under 18, because `plateMacros` is null under 18 — the ledger
       * inherits the charter rule rather than restating it, so there is
       * one place the rule can be got wrong instead of two.
       */
      const macros = result.plateMacros as { proteinG: number; carbohydrateG: number } | null;

      /*
       * Awaited, where it used to be fire-and-forget.
       *
       * The day's colour is read from the ledger immediately below, so an
       * unawaited write is a race the member loses: scan a meal, and the
       * running total it is measured against does not include the meal
       * just scanned. A fresh member saw `0 kcal` after photographing
       * 1,100 — the one reading guaranteed to look broken.
       *
       * `record` is still best-effort internally: it swallows its own
       * failures and returns null rather than throwing, so awaiting costs
       * one INSERT of latency and cannot fail the analysis.
       */
      await this.foodLog.record(uid, {
        kind: body.mimeType ? 'photo' : 'declared',
        name: items.map((i) => i.name).slice(0, 3).join(', ') || 'Meal',
        barcode: body.barcode ?? null,
        grams: plateGrams,
        kcal: energy?.withheld ? null : (energy?.likely ?? null),
        fatG: onThePlate('fat'),
        saturatesG: onThePlate('saturates'),
        sugarsG: onThePlate('sugars'),
        saltG: onThePlate('salt'),
        proteinG: macros?.proteinG ?? null,
        carbohydrateG: macros?.carbohydrateG ?? null,
        // FoodLens does not estimate fibre from a photograph, and a guess
        // here would be worse than the gap. Barcodes carry a real figure.
        fibreG: null,
        basis: 'estimate',
      });
    }

    /*
     * The two things this endpoint was asked for and did not do.
     *
     * The colour of the day, and suggestions that respect what the member
     * eats. Both existed — `dayStanding` and `selectSwaps` — and neither
     * was within reach of a photograph: the colour was computed only on
     * the account page, and the swap filter was called only by a policy
     * endpoint returning a worked example.
     *
     * Added after the ledger write, deliberately, so the running total
     * includes the meal just scanned. Asking "where does this leave my
     * day" before recording the meal answers about a different day.
     */
    return { ...result, ...(uid ? await this.afterScan(uid, result) : {}) };
  }

  /**
   * Where this meal leaves the day, and what might be done differently.
   *
   * Best-effort throughout: a member waiting on a photograph must not get
   * an error because a band could not be read. A missing colour is a
   * missing colour, not a failed scan.
   */
  private async afterScan(
    uid: string,
    result: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};

    try {
      /*
       * The day's running total comes from the ledger, never from summing
       * what the client has seen. The colour is the day's and never a
       * plate's — one meal judged against a daily figure is unremarkable
       * at noon and the whole budget at nine, and only the running total
       * knows which.
       */
      const log = await this.foodLog.summary(uid, 'week');
      const today = new Date().toISOString().slice(0, 10);
      const kcalToday = log.series.find((d) => d.day === today)?.kcal ?? 0;
      out.today = { kcal: Math.round(kcalToday) };

      const band = await this.bands.get(uid);
      if (band) {
        const standing = dayStanding({
          band: {
            eligible: true,
            floorKcal: band.floorKcal,
            ceilingKcal: band.ceilingKcal,
            observedKcalPerDay: band.observedKcalPerDay,
            recordedDays: band.recordedDays,
            reviewAfterDays: band.reviewAfterDays,
            impliedRateKgWeek: { atCeiling: 0, atFloor: 0 },
            says: '',
          },
          kcalSoFar: kcalToday,
          // Before the evening a low day is an unfinished one, not a
          // failed one. 20:00 is the same threshold the account page uses.
          dayComplete: new Date().getHours() >= 20,
        });
        out.today = {
          kcal: Math.round(kcalToday),
          floorKcal: band.floorKcal,
          ceilingKcal: band.ceilingKcal,
          standing: standing.standing,
          colour: standing.colour,
          emphasis: standing.emphasis,
          says: standing.says,
        };
      }
    } catch {
      /* a colour is worth having and never worth failing a scan for */
    }

    try {
      /*
       * The ladder `swapLadderFor` already produced, filtered by what the
       * member has told us about their food.
       *
       * Not a second generator. The analysis has keyed a five-rung ladder
       * off the real figures since FoodLens was written, and the UI renders
       * that array — what was missing was the filter, because
       * `selectSwaps` had never been given a member's constraints.
       *
       * `swaps` stays an array of the same shape for exactly that reason:
       * the display is not the thing that was broken.
       */
      const ladder =
        (result.swaps as { level: number; action: string; effect: string; keeps: string }[] | undefined) ??
        [];

      const declared = await this.constraints.get(uid);
      const selection = selectSwaps(
        ladder.map((s) => ({
          level: s.level as 1 | 2 | 3 | 4 | 5,
          action: s.action,
          expectedEffect: s.effect,
          respects: SWAP_CONSTRAINTS,
        })),
        declared,
      );

      const kept = new Set(selection.offered.map((s) => s.action));
      out.swaps = ladder.filter((s) => kept.has(s.action));
      out.swapPolicy = {
        withheld: selection.withheld,
        says: selection.says,
        /* So thin suggestions read as "we do not know enough yet" rather
         * than as the product having little to say. */
        levelsOpen: permittedSwapLevels(declared),
        cuisine: declared.cuisine ?? null,
        excludesApplied: declared.excludes.length,
      };
    } catch {
      /* same again: the filter is an addition, not the analysis */
    }

    return out;
  }

  /**
   * What the member eats, declared by them and never inferred.
   *
   * Guessing a cuisine from a shopping pattern is inferring ethnicity
   * without asking. `excludes` is the safety half — an allergen or a
   * religious restriction — and is absolute at every rung of the ladder.
   */
  @Get('constraints')
  async readConstraints(@Req() req: Request) {
    const uid = this.who(req);
    if (!uid) throw new UnauthorizedException('Sign in to see what you have told us about food.');
    return { constraints: await this.constraints.get(uid), options: SWAP_CONSTRAINTS };
  }

  @Post('constraints')
  async writeConstraints(@Req() req: Request, @Body() body: FoodConstraintsDto) {
    const uid = this.who(req);
    if (!uid) throw new UnauthorizedException('Sign in to tell us about your food.');
    const saved = await this.constraints.put(uid, {
      declared: (body.declared ?? []) as never,
      excludes: body.excludes ?? [],
      ...(body.cuisine ? { cuisine: body.cuisine } : {}),
    });
    return { constraints: saved, levelsOpen: permittedSwapLevels(saved) };
  }
}
