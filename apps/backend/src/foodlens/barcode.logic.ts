/**
 * Turning an open-database product record into the facts the platform
 * will show. Kept free of decorators so the tests can exercise it
 * directly — the interesting failures are all in this translation, not
 * in the network call around it.
 */

export interface LabelFacts {
  barcode: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  per100g: {
    fatG?: number;
    saturatesG?: number;
    sugarsG?: number;
    saltG?: number;
    proteinG?: number;
    carbohydrateG?: number;
    fibreG?: number;
  };
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fibrePer100g: number | null;
  /** UK declarable allergens the label states are present. */
  allergensPresent: string[];
  /** True when the label lists its allergens, which is what allows "absent". */
  declaresFullList: boolean;
  ingredients: string | null;
  source: 'open_food_facts';
}

const ALLERGEN_MAP: Record<string, string> = {
  gluten: 'cereals containing gluten',
  'cereals-containing-gluten': 'cereals containing gluten',
  milk: 'milk',
  eggs: 'eggs',
  egg: 'eggs',
  fish: 'fish',
  crustaceans: 'crustaceans',
  molluscs: 'molluscs',
  peanuts: 'peanuts',
  nuts: 'tree nuts',
  'tree-nuts': 'tree nuts',
  soybeans: 'soybeans',
  soya: 'soybeans',
  celery: 'celery',
  mustard: 'mustard',
  'sesame-seeds': 'sesame',
  sesame: 'sesame',
  lupin: 'lupin',
  sulphur: 'sulphur dioxide and sulphites',
  'sulphur-dioxide-and-sulphites': 'sulphur dioxide and sulphites',
};

/** Pure so the mapping is testable without a network. */
export function toLabelFacts(code: string, product: Record<string, unknown>): LabelFacts {
  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  /**
   * One decimal place, because that is what a label prints and what a
   * person can read. Open Food Facts stores some figures as a division
   * that never terminates — 11.6883116883117g of fat is arithmetic
   * leaking through a nutrition panel, not a measurement.
   */
  const num = (key: string): number | undefined => {
    const value = n[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.round(value * 10) / 10;
  };

  const tags = Array.isArray(product.allergens_tags) ? (product.allergens_tags as string[]) : [];
  const allergensPresent = [
    ...new Set(
      tags
        .map((t) => t.replace(/^[a-z]{2}:/, '').toLowerCase())
        .map((t) => ALLERGEN_MAP[t])
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const per100g: LabelFacts['per100g'] = {};
  const fat = num('fat_100g');
  const sat = num('saturated-fat_100g');
  const sugars = num('sugars_100g');
  const salt = num('salt_100g');
  if (fat !== undefined) per100g.fatG = fat;
  if (sat !== undefined) per100g.saturatesG = sat;
  if (sugars !== undefined) per100g.sugarsG = sugars;
  if (salt !== undefined) per100g.saltG = salt;
  /*
   * Carried through into the same shape as the front-of-pack four, so the
   * ledger scales all seven the same way. The label is the only place a
   * real protein figure comes from; a photograph can only estimate it.
   */
  const protein = num('proteins_100g');
  const carbs = num('carbohydrates_100g');
  const fibre = num('fiber_100g');
  if (protein !== undefined) per100g.proteinG = protein;
  if (carbs !== undefined) per100g.carbohydrateG = carbs;
  if (fibre !== undefined) per100g.fibreG = fibre;

  return {
    barcode: code,
    name: String(product.product_name ?? '').trim() || 'Unnamed product',
    brand: product.brands ? String(product.brands).split(',')[0]!.trim() : null,
    quantity: product.quantity ? String(product.quantity) : null,
    per100g,
    // Energy is read as a whole number: nobody needs a tenth of a calorie.
    kcalPer100g: n['energy-kcal_100g'] != null && Number.isFinite(n['energy-kcal_100g'])
      ? Math.round(n['energy-kcal_100g'] as number)
      : null,
    proteinPer100g: num('proteins_100g') ?? null,
    carbsPer100g: num('carbohydrates_100g') ?? null,
    fibrePer100g: num('fiber_100g') ?? null,
    allergensPresent,
    // A tagged allergen list means the label was read in full, which is
    // the only thing that ever permits the word "absent".
    declaresFullList: tags.length > 0,
    ingredients: product.ingredients_text ? String(product.ingredients_text).slice(0, 600) : null,
    source: 'open_food_facts',
  };
}
