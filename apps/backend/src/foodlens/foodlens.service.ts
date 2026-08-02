import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  CAPTURE_CHECKS,
  CAPTURE_HINTS,
  NEVER_CLAIM,
  PORTION_REFERENCES,
  PROCESSING_STAGES,
  UK_ALLERGENS,
  type Allergen,
  type EvidenceSource,
} from '@jessmove/foodlens';
import { AiGatewayError } from '@jessmove/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { BarcodeService, type LabelFacts } from './barcode.service';
import { adviseOnVisionFailure } from './vision-advice.logic';
import { parseVisionJson } from './vision-parse.logic';
import { sniffImage, stripImageMetadata } from '../storage/image-bytes';
import {
  VISION_PROMPT,
  VISION_SCHEMA,
  analyse,
  type AnalysisFacts,
  type DetectedFood,
} from './foodlens.logic';

export interface AnalyzeRequest {
  age: number;
  mimeType?: string;
  dataBase64?: string;
  photos?: { mimeType: string; dataBase64: string }[];
  barcode?: string;
  userConfirmedKcal?: number;
  declaredItems?: DetectedFood[];
  declaredKcal?: number;
  per100g?: { fatG: number; saturatesG: number; sugarsG: number; saltG: number };
  grams?: { proteinG: number; carbohydrateG: number; fatG: number };
  allergenSource?: EvidenceSource;
  allergensPresent?: Allergen[];
  allergensFullList?: boolean;
}

/**
 * LENS — the live FoodLens pipeline behind POST /foodlens/analyze.
 *
 * With an AI key configured, the photograph goes through the gateway
 * (EXIF-stripped first — the same byte-level strip the profile pipeline
 * uses) and the vision model returns detected items under a strict JSON
 * contract. Without a key, the endpoint still answers honestly from the
 * caller's declared facts and says `mode: "sandbox"` — the engine's
 * refusal rules, ranges and under-18 gates apply identically in both
 * modes, because they live in the deterministic layer, not the model.
 */
@Injectable()
export class FoodlensService {
  private readonly logger = new Logger(FoodlensService.name);

  constructor(
    private readonly gateway: AiGatewayService,
    private readonly barcodes: BarcodeService,
  ) {}

  /** The packet's own label, for the scanner. */
  async scan(barcode: string): Promise<Record<string, unknown>> {
    const label = await this.barcodes.lookup(barcode);
    if (!label) {
      return {
        found: false,
        barcode,
        note: 'That barcode is not in the open label database. Photograph the packet instead and the analysis carries on from there.',
      };
    }
    return { found: true, ...label };
  }

  policy(): Record<string, unknown> {
    return {
      neverClaimed: NEVER_CLAIM,
      allergens: UK_ALLERGENS,
      captureChecks: CAPTURE_CHECKS.map((c) => ({ check: c, hint: CAPTURE_HINTS[c] })),
      portionReferences: PORTION_REFERENCES,
      processingStages: PROCESSING_STAGES,
      underEighteen: 'No calorie, weight or BMI framing, in any mode, under any consent setting.',
    };
  }

  /**
   * A one-request answer to "why did the photo not get analysed".
   * Sends a 1×1 PNG through the same path a meal takes and returns what
   * each provider said — model name included, because a model the key
   * cannot reach is the most common cause by far.
   */
  async probeVision(): Promise<Record<string, unknown>> {
    // A real, minimal PNG. The point is the round trip, not the pixels.
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const started = Date.now();
    try {
      const completion = await this.gateway.complete({
        agent: 'LENS',
        messages: [
          { role: 'system', content: VISION_PROMPT },
          { role: 'user', content: 'Analyse this meal photograph.' },
        ],
        images: [{ mediaType: 'image/png', dataBase64: onePixelPng.toString('base64') }],
        jsonSchema: VISION_SCHEMA as unknown as Record<string, unknown>,
      });

      const parsed = parseVisionJson(completion.text);
      const fenced = /```/.test(completion.text);

      return {
        ok: true,
        provider: completion.provider,
        model: completion.model,
        ...(completion.fellBackFrom?.length ? { fellBackFrom: completion.fellBackFrom } : {}),
        readable: parsed.ok,
        wrappedInMarkdown: fenced,
        // The probe image is a single pixel, so "no food here" is the
        // correct answer and proves the whole path works.
        sawNoFood: Boolean(parsed.value?.unusable),
        ms: Date.now() - started,
        advice: parsed.ok
          ? `Vision works end to end${fenced ? ' (the model fences its JSON; the parser handles that)' : ''}. Photograph a real meal and it will be analysed.`
          : `The model answered but the reply could not be read: ${parsed.why}. First 200 characters: ${completion.text.slice(0, 200)}`,
      };
    } catch (error) {
      // A gateway that never reached a provider carries its reason in the
      // message, not in causes — advice must see both or it misreads an
      // unconfigured deployment as an unknown failure.
      const reported = error instanceof AiGatewayError ? error.causes : {};
      const causes = Object.keys(reported).length
        ? reported
        : { gateway: (error as Error).message };
      return {
        ok: false,
        ms: Date.now() - started,
        attempted: error instanceof AiGatewayError ? error.attempted : [],
        causes,
        advice: adviseOnVisionFailure(causes),
      };
    }
  }

  /**
   * The second pass. Given the foods already identified, ask for typical
   * per-100g composition in plain words — a much easier question than
   * reading a photograph, and one a text model answers reliably. The
   * result is still an estimate and is labelled as one downstream.
   */
  private async estimatePer100g(
    names: string[],
  ): Promise<{ fatG: number; saturatesG: number; sugarsG: number; saltG: number } | null> {
    try {
      const completion = await this.gateway.complete({
        agent: 'LENS',
        maxTokens: 200,
        messages: [
          {
            role: 'system',
            content:
              'You give typical nutrition composition for a dish. Answer with a single raw ' +
              'JSON object, no markdown fence, no commentary: ' +
              '{"fatG":number,"saturatesG":number,"sugarsG":number,"saltG":number} — all per ' +
              '100g of the dish as served. Use published composition tables for the closest ' +
              'match. Never return all zeros.',
          },
          { role: 'user', content: `Per 100g composition of: ${names.join(', ')}.` },
        ],
      });

      const parsed = parseVisionJson(
        // The shared parser wants a food list; give it one so the same
        // fence-stripping and clamping applies to this reply too.
        completion.text.replace(/^\s*\{/, '{"items":[{"name":"x","confidencePct":1}],'),
      );
      const per100g = parsed.value?.per100g;
      if (!per100g) return null;
      const complete =
        typeof per100g.fatG === 'number' &&
        typeof per100g.saturatesG === 'number' &&
        typeof per100g.sugarsG === 'number' &&
        typeof per100g.saltG === 'number';
      return complete ? (per100g as { fatG: number; saturatesG: number; sugarsG: number; saltG: number }) : null;
    } catch (error) {
      this.logger.warn(`per100g second pass failed: ${(error as Error).message}`);
      return null;
    }
  }

  async analyze(request: AnalyzeRequest): Promise<Record<string, unknown>> {
    interface VisionResult {
      items: DetectedFood[];
      likelyKcal: number;
      portionCertainty: number;
      preparationCertainty: number;
      per100g?: Partial<{ fatG: number; saturatesG: number; sugarsG: number; saltG: number }>;
      grams?: AnalyzeRequest['grams'];
      plateGrams?: number;
    }
    let vision: VisionResult | null = null;
    let mode: 'live' | 'sandbox' = 'sandbox';
    let visionNote: string | null = null;

    // One photograph or several of the same meal. Every one is sniffed
    // by its bytes and stripped of EXIF before it goes anywhere.
    const supplied = [
      ...(request.dataBase64 ? [{ mimeType: request.mimeType, dataBase64: request.dataBase64 }] : []),
      ...(request.photos ?? []),
    ].slice(0, 3);

    if (supplied.length > 0) {
      const prepared: { mediaType: string; dataBase64: string }[] = [];
      for (const photo of supplied) {
        const bytes = Buffer.from(photo.dataBase64, 'base64');
        if (bytes.length === 0) throw new BadRequestException('The image is empty.');
        const sniffed = sniffImage(bytes);
        if (!sniffed.format) {
          throw new BadRequestException('Those bytes are not a JPEG, PNG or WebP photograph.');
        }
        if (photo.mimeType && photo.mimeType !== `image/${sniffed.format}`) {
          throw new BadRequestException(
            `Declared ${photo.mimeType} but the bytes are image/${sniffed.format} — refused as a disguised file.`,
          );
        }
        prepared.push({
          mediaType: `image/${sniffed.format}`,
          dataBase64: stripImageMetadata(bytes).toString('base64'),
        });
      }

      const angles =
        prepared.length > 1
          ? `There are ${prepared.length} photographs of the same meal from different angles. ` +
            'Use them together: the extra angles resolve depth, so portionCertainty should be ' +
            'meaningfully higher than it would be from one photograph.'
          : 'There is one photograph, so portionCertainty must stay low unless a reference object is visible.';

      try {
        const completion = await this.gateway.complete({
          agent: 'LENS',
          messages: [
            { role: 'system', content: VISION_PROMPT },
            {
              role: 'user',
              content:
                `Analyse this meal. ${angles}` +
                (request.barcode ? ` The packet barcode is ${request.barcode}.` : ''),
            },
          ],
          images: prepared,
          jsonSchema: VISION_SCHEMA as unknown as Record<string, unknown>,
        });
        // Models wrap JSON in a markdown fence far more often than not,
        // and a bare JSON.parse turns that into a phantom outage.
        const parsed = parseVisionJson(completion.text);
        if (parsed.ok && parsed.value) {
          if (parsed.value.unusable) {
            visionNote = parsed.value.unusable;
            mode = 'live';
          } else {
            vision = parsed.value as VisionResult;
            mode = 'live';
          }
        } else {
          visionNote = 'The photograph could not be read this time. Declared facts only.';
          this.logger.warn(`vision parse failed: ${parsed.why ?? 'unknown'}`);
        }
      } catch (err) {
        visionNote =
          err instanceof Error && err.message.includes('No AI provider')
            ? 'No AI provider is configured, so the photograph was not analysed. Declared facts only.'
            : 'The vision model was unavailable for this call. Declared facts only.';
        this.logger.warn(`vision unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // A model asked for per-100g figures in a schema will still sometimes
    // omit them — only some providers enforce a schema at all — and the
    // front-of-pack panel then silently vanishes. Rather than let that
    // happen, ask again in plain words for the one thing that is missing.
    if (vision && !vision.per100g && vision.items.length > 0) {
      vision.per100g = (await this.estimatePer100g(vision.items.map((i) => i.name))) ?? undefined;
    }

    // A scanned label outranks everything a photograph can offer, so it
    // is fetched first and the analysis is built on top of it.
    let label: LabelFacts | null = null;
    if (request.barcode) label = await this.barcodes.lookup(request.barcode);

    const source = label
      ? ('barcode_verified_product' as const)
      : this.bestSource(request, vision !== null);
    const facts: AnalysisFacts = {
      age: request.age,
      items: vision?.items ?? request.declaredItems ?? [],
      likelyKcal:
        request.userConfirmedKcal ?? request.declaredKcal ?? vision?.likelyKcal ?? null,
      source,
      per100g: request.per100g ?? label?.per100g ?? vision?.per100g,
      plateGrams: vision?.plateGrams,
      grams: request.grams ?? vision?.grams,
      portionCertainty: vision?.portionCertainty ?? (request.userConfirmedKcal ? 1 : 0.35),
      preparationCertainty: vision?.preparationCertainty ?? (request.barcode ? 0.9 : 0.3),
      allergenEvidence: label
        ? {
            source: 'verified_manufacturer_label' as const,
            declaresPresent: label.allergensPresent as never,
            declaresFullList: label.declaresFullList,
          }
        : request.allergenSource
        ? {
            source: request.allergenSource,
            declaresPresent: request.allergensPresent,
            declaresFullList: request.allergensFullList,
          }
        : undefined,
    };

    return {
      mode,
      ...(visionNote ? { note: visionNote } : {}),
      ...(label ? { label: { name: label.name, brand: label.brand, quantity: label.quantity, ingredients: label.ingredients } } : {}),
      ...analyse(facts),
    };
  }

  /** §16 data priority — a user correction outranks everything. */
  private bestSource(request: AnalyzeRequest, hasVision: boolean): EvidenceSource {
    if (request.userConfirmedKcal != null) return 'user_confirmed_quantity';
    if (request.barcode) return 'barcode_verified_product';
    if (request.declaredKcal != null) return 'trusted_composition_database';
    if (hasVision) return 'ai_visual_estimate';
    return 'general_recipe_probability';
  }
}
