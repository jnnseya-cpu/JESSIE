/**
 * Turning an open-database product record into the facts the platform
 * will show. Kept free of decorators so the tests can exercise it
 * directly — the interesting failures are all in this translation, not
 * in the network call around it.
 */

import {
  nutriScore,
  oilFruitVegPercent,
  reconcile,
  shelfReading,
  type NutriCategory,
  type NutriReconciliation,
  type NutriResult,
  type ShelfReading,
} from '@jessmove/foodlens';

/**
 * Which scoring table this product belongs on.
 *
 * The single most consequential line in this file. A sugary drink scored
 * on the food table comes out two grades better than it is, because the
 * drinks table starts penalising sugar at 1.5 g where the food table
 * waits until 4.5 g. Getting this wrong does not produce an error, it
 * produces a flattering letter on exactly the products that need an
 * honest one.
 *
 * Read from the record's own category tags, in order of specificity:
 * water before drinks, because water is the only drink that can be an A;
 * cheese and added fats before general food, because each has its own
 * rule. Anything unrecognised falls to `food`, which is the strictest
 * table a mistake can land on for a drink and the correct one otherwise.
 */
export function categoryFor(tags: readonly string[], name: string): NutriCategory {
  const flat = tags.map((t) => t.replace(/^[a-z]{2}:/, '').toLowerCase());
  const hay = `${flat.join(' ')} ${name.toLowerCase()}`;

  /*
   * Water is read from the category tags alone, never from the product
   * name, and the exact tag is required rather than the word.
   *
   * The first version of this matched the name, and graded "Chickpeas in
   * water" as water — an A, by definition, on a tin of pulses. "Tuna in
   * spring water" and "Peaches in water" would have gone the same way.
   * A packing medium in a product name is not the product, and `water`
   * is the one category that short-circuits the whole algorithm, so it
   * is the one that must be hardest to enter by accident.
   */
  const isWater = flat.some((t) =>
    /^(waters|mineral-waters|spring-waters|natural-mineral-waters)$/.test(t),
  );
  if (isWater) {
    /*
     * A flavoured or sweetened water is still a drink, and must land on
     * the drinks table rather than falling through to food. Falling
     * through was the same flattering-grade bug in a second costume: the
     * food table does not start penalising sugar until 4.5 g, where the
     * drinks table starts at 1.5 g.
     */
    return /flavoured|sweetened|juice/.test(hay) ? 'beverage' : 'water';
  }
  if (/\bcheeses?\b/.test(hay)) return 'cheese';
  if (/\b(olive|sunflower|rapeseed|vegetable|groundnut)-?oils?\b|\bfats?\b|\bbutters?\b|margarine/.test(hay)) {
    return 'fat';
  }
  if (/beverage|drink|juice|soda|squash|cordial|nectar|smoothie|\bteas?\b|\bcoffees?\b/.test(hay)) {
    return 'beverage';
  }
  return 'food';
}

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

  /* ── The four readings ── */

  /** Which table the Nutri-Score was computed on. */
  nutriCategory: NutriCategory;
  /** Computed here from the panel. Null when the panel is incomplete. */
  nutriScore: NutriResult | null;
  /** This computation against the database's published grade. */
  nutriAgreement: NutriReconciliation;
  /** Processing, additives and origin — what Nutri-Score cannot see. */
  shelf: ShelfReading;
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

  const name = String(product.product_name ?? '').trim() || 'Unnamed product';
  const categoryTags = Array.isArray(product.categories_tags)
    ? (product.categories_tags as string[])
    : [];
  const category = categoryFor(categoryTags, name);

  /*
   * The fruit and vegetable percentage.
   *
   * Open Food Facts publishes a measured figure where a manufacturer
   * declared one and an estimate derived from the ingredients list
   * otherwise. The measured one is preferred; neither is invented, and
   * an absent figure scores zero rather than being guessed at, which is
   * the official fallback and the pessimistic direction.
   */
  const declaredFruitVeg =
    num('fruits-vegetables-nuts_100g') ??
    num('fruits-vegetables-nuts-estimate_100g') ??
    num('fruits-vegetables-nuts-estimate-from-ingredients_100g') ??
    null;

  /*
   * Olive, rapeseed and walnut oils are credited in full on the fruit
   * and vegetable line by the official algorithm. Applied only to the
   * added-fats category, so a biscuit that happens to list rapeseed oil
   * among its ingredients gains nothing.
   */
  const fruitVeg =
    category === 'fat' ? oilFruitVegPercent(name, declaredFruitVeg) : declaredFruitVeg;

  const computed = nutriScore({
    category,
    energyKj: num('energy-kj_100g') ?? null,
    energyKcal:
      n['energy-kcal_100g'] != null && Number.isFinite(n['energy-kcal_100g'])
        ? (n['energy-kcal_100g'] as number)
        : null,
    sugarsG: sugars ?? null,
    saturatesG: sat ?? null,
    fatG: fat ?? null,
    saltG: salt ?? null,
    fibreG: fibre ?? null,
    proteinG: protein ?? null,
    fruitVegPercent: fruitVeg,
  });

  return {
    barcode: code,
    name,
    nutriCategory: category,
    nutriScore: computed,
    nutriAgreement: reconcile(
      computed?.grade ?? null,
      typeof product.nutriscore_grade === 'string' ? product.nutriscore_grade : null,
    ),
    shelf: shelfReading({
      novaGroup: typeof product.nova_group === 'number' ? product.nova_group : null,
      additiveTags: Array.isArray(product.additives_tags)
        ? (product.additives_tags as string[])
        : null,
      origins: product.origins,
      manufacturingPlaces: product.manufacturing_places,
      countries: product.countries,
    }),
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
