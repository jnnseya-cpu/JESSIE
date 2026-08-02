/**
 * The trolley, added up.
 *
 * Scanning one product tells you about that product. Scanning a shop
 * tells you about the week — which is the thing nobody can work out in
 * an aisle, because it needs the pack size, the per-100g figures and
 * some arithmetic across a dozen items.
 *
 * Everything here is a fact about the basket, not a verdict on the
 * shopper. A flag names the nutrient, the amount, and which items carry
 * most of it, so it can be acted on by swapping one thing — never by
 * feeling bad.
 */

/** UK adult reference intakes, per day. The published figures. */
export const REFERENCE_INTAKE = {
  energyKcal: 2000,
  fatG: 70,
  saturatesG: 20,
  sugarsG: 90,
  saltG: 6,
} as const;

export interface BasketProduct {
  barcode: string;
  name: string;
  quantity?: string | null;
  kcalPer100g?: number | null;
  per100g?: { fatG?: number; saturatesG?: number; sugarsG?: number; saltG?: number };
}

export interface NutrientTotal {
  key: 'energyKcal' | 'fatG' | 'saturatesG' | 'sugarsG' | 'saltG';
  label: string;
  total: number;
  /** How many adult-days of the reference intake this basket carries. */
  days: number;
  /** The items carrying most of it, largest first. */
  topContributors: { name: string; amount: number }[];
}

export interface BasketFlag {
  nutrient: string;
  says: string;
  action: string;
}

export interface Basket {
  products: number;
  weighed: number;
  totals: NutrientTotal[];
  flags: BasketFlag[];
  note: string;
}

/**
 * Pack size to grams. Labels write it a dozen ways — "385g", "1.5 l",
 * "4 x 125 g", "500ml" — and a size we cannot read is left out of the
 * total rather than guessed at, which is why `weighed` is reported.
 */
export function packGrams(quantity: string | null | undefined): number | null {
  if (!quantity) return null;
  const text = quantity.toLowerCase().replace(/,/g, '.');

  // "4 x 125 g" — a multipack is its count times its unit.
  const multi = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)/.exec(text);
  if (multi) {
    const each = toGrams(Number(multi[2]), multi[3]!);
    return each === null ? null : Math.round(Number(multi[1]) * each);
  }

  const single = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|cl)/.exec(text);
  if (!single) return null;
  const grams = toGrams(Number(single[1]), single[2]!);
  return grams === null ? null : Math.round(grams);
}

/** Millilitres are treated as grams: water's density, and close enough
 *  for everything a supermarket sells by volume. */
function toGrams(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  switch (unit) {
    case 'kg':
      return value * 1000;
    case 'g':
      return value;
    case 'l':
      return value * 1000;
    case 'cl':
      return value * 10;
    case 'ml':
      return value;
    default:
      return null;
  }
}

const NUTRIENTS = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'saturatesG', label: 'Saturates', unit: 'g' },
  { key: 'sugarsG', label: 'Sugars', unit: 'g' },
  { key: 'saltG', label: 'Salt', unit: 'g' },
] as const;

export function basketFrom(products: BasketProduct[]): Basket {
  const contributions = new Map<string, { name: string; amount: number }[]>();
  const totals = new Map<string, number>();
  let weighed = 0;

  for (const product of products) {
    const grams = packGrams(product.quantity);
    if (grams === null) continue;
    weighed += 1;
    const packs = grams / 100;

    for (const nutrient of NUTRIENTS) {
      const per100 =
        nutrient.key === 'energyKcal'
          ? product.kcalPer100g
          : product.per100g?.[nutrient.key as 'fatG' | 'saturatesG' | 'sugarsG' | 'saltG'];
      if (typeof per100 !== 'number') continue;

      const amount = per100 * packs;
      totals.set(nutrient.key, (totals.get(nutrient.key) ?? 0) + amount);
      const list = contributions.get(nutrient.key) ?? [];
      list.push({ name: product.name, amount: Math.round(amount * 10) / 10 });
      contributions.set(nutrient.key, list);
    }
  }

  const built: NutrientTotal[] = NUTRIENTS.map((nutrient) => {
    const total = totals.get(nutrient.key) ?? 0;
    const reference = REFERENCE_INTAKE[nutrient.key];
    return {
      key: nutrient.key,
      label: nutrient.label,
      total: nutrient.key === 'energyKcal' ? Math.round(total) : Math.round(total * 10) / 10,
      days: Math.round((total / reference) * 10) / 10,
      topContributors: (contributions.get(nutrient.key) ?? [])
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3),
    };
  }).filter((t) => t.total > 0);

  const unweighed = products.length - weighed;
  const energyDays = built.find((t) => t.key === 'energyKcal')?.days ?? 0;
  const notes = [
    unweighed === 0
      ? 'Totals are for the whole packs, against UK adult reference intakes.'
      : `${unweighed} item${unweighed === 1 ? '' : 's'} had no readable pack size and ${unweighed === 1 ? 'is' : 'are'} left out rather than guessed at.`,
  ];
  if (weighed > 0 && energyDays < MIN_BASKET_DAYS) {
    notes.push('Too little here to read as a shop yet — keep scanning and the balance appears.');
  }

  return {
    products: products.length,
    weighed,
    totals: built,
    flags: flagsFor(built),
    note: notes.join(' '),
  };
}

/**
 * A basket has to be a shop before it can be read as one. Below a day of
 * food the "days of X against days of food" comparison is arithmetic on
 * almost nothing — half a kilo of apples is six days of sugars against a
 * tenth of a day of food, and flagging fruit is exactly the sort of
 * nonsense that makes people stop trusting a scanner.
 */
export const MIN_BASKET_DAYS = 1;

/**
 * A flag fires when one nutrient dominates the basket relative to the
 * others — a week of shopping carrying a fortnight of salt. The
 * comparison is the basket against itself, so a big shop for a family
 * is not scolded for being big.
 */
export function flagsFor(totals: NutrientTotal[]): BasketFlag[] {
  const energy = totals.find((t) => t.key === 'energyKcal');
  const flags: BasketFlag[] = [];
  if (!energy || energy.days < MIN_BASKET_DAYS) return flags;

  for (const total of totals) {
    if (total.key === 'energyKcal') continue;
    // A nutrient nobody has actually bought much of is not worth naming,
    // however lopsided the ratio looks.
    if (total.days < MIN_BASKET_DAYS) continue;
    // Out of step with the food itself: this basket carries far more of
    // this nutrient than it does of the energy it came with.
    const ratio = total.days / energy.days;
    if (ratio < 1.35) continue;

    const worst = total.topContributors[0];
    flags.push({
      nutrient: total.label.toLowerCase(),
      says: `This basket carries ${total.days} days of ${total.label.toLowerCase()} against ${energy.days} days of food.`,
      action: worst
        ? `${worst.name} carries the most of it. Swapping that one item changes the shape of the week.`
        : 'One swap usually changes the shape of the week.',
    });
  }

  return flags;
}
