/**
 * Reading a model's JSON answer without trusting its packaging.
 *
 * A model asked for JSON very often returns JSON *inside* a markdown
 * fence, or with a sentence of preamble, or with extra keys it invented.
 * A bare `JSON.parse` throws on all three, and the caller then reports
 * "the vision model was unavailable" — which is both wrong and
 * unfixable, because the model was there and answering.
 *
 * So: strip the packaging, take the first balanced object, and check the
 * fields we actually need are present and the right type. Anything else
 * is reported as a parse failure with the reason, never as an outage.
 */

export interface DetectedFood {
  name: string;
  /** Null when the model did not state one. Never a made-up middle value. */
  confidencePct: number | null;
}

export type Per100g = { fatG: number; saturatesG: number; sugarsG: number; saltG: number };

export interface VisionPayload {
  items: DetectedFood[];
  likelyKcal: number | null;
  portionCertainty: number;
  preparationCertainty: number;
  per100g?: Partial<Per100g>;
  grams?: { proteinG: number; carbohydrateG: number; fatG: number };
  plateGrams?: number;
  /** Set when the model says the photograph cannot be read as a meal. */
  unusable?: string;
}

export interface ParseOutcome {
  ok: boolean;
  value?: VisionPayload;
  why?: string;
}

/** Removes markdown fences and any prose either side of the object. */
export function extractJsonObject(text: string): string | null {
  const withoutFence = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const candidate = withoutFence.startsWith('{') ? withoutFence : null;
  if (candidate) return candidate;

  // Prose before or after: take the first balanced {...}, respecting
  // braces inside strings so a food called "rice { }" cannot truncate it.
  const start = withoutFence.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < withoutFence.length; i += 1) {
    const ch = withoutFence[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return withoutFence.slice(start, i + 1);
    }
  }
  return null;
}

const USABLE_KEY = /^(image)?(is)?usable$/i;
const REASON_KEY = /(reason|issue|why|note|explanation|message)/i;

/**
 * Finds "this photograph is not a meal" however the model spelled it,
 * flat or one level of nesting deep, and returns the reason it gave.
 */
export function findUnusable(raw: Record<string, unknown>): string | undefined {
  const scopes: Record<string, unknown>[] = [raw];
  for (const value of Object.values(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scopes.push(value as Record<string, unknown>);
    }
  }

  for (const scope of scopes) {
    const usableKey = Object.keys(scope).find((k) => USABLE_KEY.test(k));
    if (!usableKey || scope[usableKey] !== false) continue;

    const reasonKey = Object.keys(scope).find(
      (k) => REASON_KEY.test(k) && typeof scope[k] === 'string',
    );
    const reason = reasonKey ? String(scope[reasonKey]) : undefined;
    return reason && reason.trim().length > 0
      ? reason.trim()
      : 'The photograph could not be read as a meal.';
  }
  return undefined;
}

/**
 * The food list, wherever the model put it: `items`, `foods`,
 * `detectedItems`, or the same nested one level down. An array whose
 * entries carry a `name` is the food list whatever it is called.
 */
export function findItems(raw: Record<string, unknown>): unknown[] {
  const looksLikeFood = (value: unknown): value is unknown[] =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) => entry !== null && typeof entry === 'object' && 'name' in (entry as object),
    );

  if (looksLikeFood(raw.items)) return raw.items;

  for (const value of Object.values(raw)) {
    if (looksLikeFood(value)) return value;
  }
  for (const value of Object.values(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        if (looksLikeFood(nested)) return nested;
      }
    }
  }
  return [];
}

/** Energy, wherever it landed: likelyKcal, kcal, calories, or nested. */
export function findKcal(raw: Record<string, unknown>): number | null {
  const KEY = /^(likely)?(kcal|calories|energykcal|estimatedkcal)$/i;
  const scopes: Record<string, unknown>[] = [raw];
  for (const value of Object.values(raw)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scopes.push(value as Record<string, unknown>);
    }
  }
  for (const scope of scopes) {
    for (const [key, value] of Object.entries(scope)) {
      if (KEY.test(key.replace(/[_\s-]/g, '')) && typeof value === 'number' && Number.isFinite(value)) {
        return Math.min(Math.max(value, 0), 6000);
      }
    }
  }
  return null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(n, min), max);
}

export function parseVisionJson(text: string): ParseOutcome {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, why: 'the model returned no JSON object at all' };

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, why: `the JSON did not parse: ${(error as Error).message}` };
  }

  // A model that judges the photo unreadable is answering correctly, not
  // failing. It will not agree with itself about the key name, though —
  // imageUsable / usable / isUsable, flat or nested one level down — so
  // look for the judgement rather than a particular spelling.
  const unusable = findUnusable(raw);

  const rawItems = findItems(raw);
  const items: DetectedFood[] = rawItems
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .filter((i) => typeof i.name === 'string' && i.name.trim().length > 0)
    .map((i) => ({
      name: String(i.name).slice(0, 80),
      // A model that did not say how sure it is has not said 50%.
      confidencePct:
        typeof i.confidencePct === 'number' && Number.isFinite(i.confidencePct)
          ? Math.min(100, Math.max(0, i.confidencePct))
          : null,
    }));

  if (items.length === 0 && !unusable) {
    return { ok: false, why: 'the model named no foods and gave no reason' };
  }

  const kcal = findKcal(raw);

  // Front-of-pack bands are a claim about a food. A missing figure must
  // never become 0g, because 0g bands as LOW and the panel then states
  // something nobody measured — the exact failure this module exists to
  // prevent. All four must be real numbers or there is no panel.
  const per100gRaw = raw.per100g as Record<string, unknown> | undefined;
  const per100gValues =
    per100gRaw && typeof per100gRaw === 'object'
      ? (['fatG', 'saturatesG', 'sugarsG', 'saltG'] as const).map((k) => per100gRaw[k])
      : [];
  // Keep every figure the model actually stated and nothing else. A
  // missing nutrient stays missing: 0g bands as LOW, which would state
  // something nobody measured.
  const kept: Record<string, number> = {};
  if (per100gRaw && typeof per100gRaw === 'object') {
    for (const key of ['fatG', 'saturatesG', 'sugarsG', 'saltG'] as const) {
      const value = per100gRaw[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        kept[key] = Math.min(100, Math.max(0, value));
      }
    }
  }
  const per100g = Object.keys(kept).length > 0 ? (kept as Partial<Per100g>) : undefined;

  const gramsRaw = raw.grams as Record<string, unknown> | undefined;
  const grams =
    gramsRaw && typeof gramsRaw === 'object'
      ? {
          proteinG: clamp(gramsRaw.proteinG, 0, 500, 0),
          carbohydrateG: clamp(gramsRaw.carbohydrateG, 0, 800, 0),
          fatG: clamp(gramsRaw.fatG, 0, 400, 0),
        }
      : undefined;

  const plateGrams =
    typeof raw.plateGrams === 'number' && Number.isFinite(raw.plateGrams) && raw.plateGrams > 0
      ? Math.min(5000, raw.plateGrams)
      : undefined;

  return {
    ok: true,
    value: {
      items,
      likelyKcal: kcal,
      portionCertainty: clamp(raw.portionCertainty, 0, 1, 0.3),
      preparationCertainty: clamp(raw.preparationCertainty, 0, 1, 0.3),
      ...(per100g ? { per100g } : {}),
      ...(plateGrams ? { plateGrams } : {}),
      ...(grams && grams.proteinG + grams.carbohydrateG + grams.fatG > 0 ? { grams } : {}),
      ...(unusable ? { unusable } : {}),
    },
  };
}
