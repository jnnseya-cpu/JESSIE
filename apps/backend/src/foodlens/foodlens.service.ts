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

  constructor(private readonly gateway: AiGatewayService) {}

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

  async analyze(request: AnalyzeRequest): Promise<Record<string, unknown>> {
    interface VisionResult {
      items: DetectedFood[];
      likelyKcal: number;
      portionCertainty: number;
      preparationCertainty: number;
      per100g?: AnalyzeRequest['per100g'];
    }
    let vision: VisionResult | null = null;
    let mode: 'live' | 'sandbox' = 'sandbox';
    let visionNote: string | null = null;

    if (request.dataBase64) {
      const bytes = Buffer.from(request.dataBase64, 'base64');
      if (bytes.length === 0) throw new BadRequestException('The image is empty.');
      const sniffed = sniffImage(bytes);
      if (!sniffed.format) {
        throw new BadRequestException('Those bytes are not a JPEG, PNG or WebP photograph.');
      }
      if (request.mimeType && request.mimeType !== `image/${sniffed.format}`) {
        throw new BadRequestException(
          `Declared ${request.mimeType} but the bytes are image/${sniffed.format} — refused as a disguised file.`,
        );
      }

      // GPS and EXIF are stripped before the pixels go anywhere near a model.
      const clean = stripImageMetadata(bytes);

      try {
        const completion = await this.gateway.complete({
          agent: 'LENS',
          messages: [
            { role: 'system', content: VISION_PROMPT },
            { role: 'user', content: 'Analyse this meal photograph.' },
          ],
          images: [{ mediaType: `image/${sniffed.format}`, dataBase64: clean.toString('base64') }],
          jsonSchema: VISION_SCHEMA as unknown as Record<string, unknown>,
        });
        // Models wrap JSON in a markdown fence far more often than not,
        // and a bare JSON.parse turns that into a phantom outage.
        const parsed = parseVisionJson(completion.text);
        if (parsed.ok && parsed.value) {
          if (parsed.value.unusable) {
            // The model read the photo and says it is not a meal. That is
            // an answer, not a failure, and the member deserves the words.
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
        // No provider or provider refusal: the deterministic layer still
        // answers — it just says so.
        visionNote =
          err instanceof Error && err.message.includes('No AI provider')
            ? 'No AI provider is configured, so the photograph was not analysed. Declared facts only.'
            : 'The vision model was unavailable for this call. Declared facts only.';
        this.logger.warn(`vision unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const source = this.bestSource(request, vision !== null);
    const facts: AnalysisFacts = {
      age: request.age,
      items: vision?.items ?? request.declaredItems ?? [],
      likelyKcal:
        request.userConfirmedKcal ?? request.declaredKcal ?? vision?.likelyKcal ?? null,
      source,
      per100g: request.per100g ?? vision?.per100g,
      grams: request.grams,
      portionCertainty: vision?.portionCertainty ?? (request.userConfirmedKcal ? 1 : 0.35),
      preparationCertainty: vision?.preparationCertainty ?? (request.barcode ? 0.9 : 0.3),
      allergenEvidence: request.allergenSource
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
