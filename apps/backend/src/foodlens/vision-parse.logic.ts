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
  confidencePct: number;
}

export interface VisionPayload {
  items: DetectedFood[];
  likelyKcal: number | null;
  portionCertainty: number;
  preparationCertainty: number;
  per100g?: { fatG: number; saturatesG: number; sugarsG: number; saltG: number };
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
  // failing — an empty plate of items with a stated reason.
  const unusable =
    raw.imageUsable === false
      ? String(raw.imageIssue ?? 'The photograph could not be read as a meal.')
      : undefined;

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: DetectedFood[] = rawItems
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .filter((i) => typeof i.name === 'string' && i.name.trim().length > 0)
    .map((i) => ({
      name: String(i.name).slice(0, 80),
      confidencePct: clamp(i.confidencePct, 0, 100, 50),
    }));

  if (items.length === 0 && !unusable) {
    return { ok: false, why: 'the model named no foods and gave no reason' };
  }

  const kcal =
    typeof raw.likelyKcal === 'number' && Number.isFinite(raw.likelyKcal)
      ? clamp(raw.likelyKcal, 0, 6000, 0)
      : null;

  const per100gRaw = raw.per100g as Record<string, unknown> | undefined;
  const per100g =
    per100gRaw && typeof per100gRaw === 'object'
      ? {
          fatG: clamp(per100gRaw.fatG, 0, 100, 0),
          saturatesG: clamp(per100gRaw.saturatesG, 0, 100, 0),
          sugarsG: clamp(per100gRaw.sugarsG, 0, 100, 0),
          saltG: clamp(per100gRaw.saltG, 0, 100, 0),
        }
      : undefined;

  return {
    ok: true,
    value: {
      items,
      likelyKcal: kcal,
      portionCertainty: clamp(raw.portionCertainty, 0, 1, 0.3),
      preparationCertainty: clamp(raw.preparationCertainty, 0, 1, 0.3),
      ...(per100g ? { per100g } : {}),
      ...(unusable ? { unusable } : {}),
    },
  };
}
