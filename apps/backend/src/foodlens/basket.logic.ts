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

import {
  REFERENCE_INTAKE,
  type AdditiveFact,
  type NutriGrade,
  type NovaGroup,
  type NutriCategory,
  NOVA_DEFINITIONS,
  NUTRI_CATEGORY_LABELS,
  mayCompare,
} from '@jessmove/foodlens';

/** UK adult reference intakes, per day. One copy, in the shared package. */
export { REFERENCE_INTAKE };

export interface BasketProduct {
  barcode: string;
  name: string;
  quantity?: string | null;
  kcalPer100g?: number | null;
  per100g?: { fatG?: number; saturatesG?: number; sugarsG?: number; saltG?: number };
  /* ── The four readings, carried per item so the shop can be read ── */
  nutriGrade?: NutriGrade | null;
  /** Which scoring table the grade is on. Letters only rank within one. */
  nutriCategory?: NutriCategory | null;
  novaGroup?: NovaGroup | null;
  additives?: readonly AdditiveFact[] | null;
  origins?: readonly string[] | null;
}

/**
 * The shape of the shop, across the four axes.
 *
 * This is the view that justifies scanning a whole trolley rather than
 * one packet. A single group 4 product is not a finding — bread is group
 * 4. Nine of eleven items being group 4 is a finding, and it is not one
 * anybody can reach by reading labels one at a time in an aisle.
 *
 * Each axis is counted and reported on its own. They are never combined
 * into a basket score: `NEVER_CLAIM` forbids a composite, and a shop is
 * exactly where a composite would do most damage — one tidy number is
 * the thing a person would try to optimise, and three of these four axes
 * are not meant to be optimised at all.
 */
export interface BasketShape {
  /**
   * Letters tallied **within** a scoring table, never across them.
   *
   * A flat count of "three As" across a drink, a cheese and an oil reads
   * as a ranking and is not one: the three letters were produced by
   * three different tables. `mayCompare` refuses that, so the tally is
   * grouped by table and each group says what it is comparing.
   */
  grades: { category: NutriCategory; categoryLabel: string; comparable: string; counts: { grade: NutriGrade; items: number }[] }[];
  /** Count of items in each processing group, and the share that is group 4. */
  processing: { group: NovaGroup; label: string; items: number }[];
  ultraProcessedShare: number | null;
  /** The additives appearing most often across the shop. */
  commonAdditives: { code: string; name: string; role: string; items: number }[];
  /** Additives whose label carries a legally required warning, and where. */
  warned: { code: string; name: string; note: string; items: string[] }[];
  /** Declared origins, most frequent first. */
  origins: { place: string; items: number }[];
  /** How many items carried a reading on each axis. */
  read: { graded: number; classified: number; additivesListed: number; originDeclared: number };
  says: string;
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
  shape: BasketShape;
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


/**
 * Read the shape of a shop.
 *
 * Counts only. No averaging of grades into a basket letter, and no
 * scoring of the processing mix — both would be the composite verdict
 * `NEVER_CLAIM` forbids, and both would be worse here than on a single
 * product, because a basket number is the thing somebody would try to
 * improve by swapping a label rather than a food.
 */
export function shapeOf(products: readonly BasketProduct[]): BasketShape {
  const gradesByCategory = new Map<NutriCategory, Map<NutriGrade, number>>();
  const novaCounts = new Map<NovaGroup, number>();
  const additiveCounts = new Map<string, { fact: AdditiveFact; items: number }>();
  const warnedItems = new Map<string, { fact: AdditiveFact; items: string[] }>();
  const originCounts = new Map<string, number>();
  let graded = 0;
  let classified = 0;
  let additivesListed = 0;
  let originDeclared = 0;

  for (const product of products) {
    if (product.nutriGrade) {
      graded += 1;
      // Tallied inside its own table. A letter from the drinks table and
      // a letter from the food table are not the same letter.
      const category = product.nutriCategory ?? 'food';
      const within = gradesByCategory.get(category) ?? new Map<NutriGrade, number>();
      within.set(product.nutriGrade, (within.get(product.nutriGrade) ?? 0) + 1);
      gradesByCategory.set(category, within);
    }
    if (product.novaGroup) {
      classified += 1;
      novaCounts.set(product.novaGroup, (novaCounts.get(product.novaGroup) ?? 0) + 1);
    }
    if (product.additives) {
      additivesListed += 1;
      for (const additive of product.additives) {
        const seen = additiveCounts.get(additive.code);
        additiveCounts.set(additive.code, {
          fact: additive,
          items: (seen?.items ?? 0) + 1,
        });
        if (additive.regulatoryNote) {
          const warned = warnedItems.get(additive.code) ?? { fact: additive, items: [] };
          warned.items.push(product.name);
          warnedItems.set(additive.code, warned);
        }
      }
    }
    if (product.origins && product.origins.length > 0) {
      originDeclared += 1;
      for (const place of product.origins) {
        originCounts.set(place, (originCounts.get(place) ?? 0) + 1);
      }
    }
  }

  const ultra = novaCounts.get(4) ?? 0;
  const ultraProcessedShare =
    classified > 0 ? Math.round((ultra / classified) * 100) : null;

  const processing = [...novaCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([group, items]) => ({
      group,
      label: NOVA_DEFINITIONS[group].label,
      items,
    }));

  const warned = [...warnedItems.values()].map((w) => ({
    code: w.fact.code,
    name: w.fact.name,
    note: w.fact.regulatoryNote!,
    items: w.items,
  }));

  /*
   * The sentence is about the shop, and it leads with whichever axis has
   * something to say. A warned additive outranks everything because it
   * is the only one carrying a legal requirement; after that, the
   * processing share, because it is the finding a person cannot reach by
   * reading one label.
   */
  let says: string;
  if (products.length === 0) {
    says = 'Nothing scanned yet.';
  } else if (warned.length > 0) {
    const count = warned.reduce((n, w) => n + w.items.length, 0);
    says =
      `${count} item${count === 1 ? '' : 's'} in this shop carr${count === 1 ? 'ies' : 'y'} ` +
      'a colour the label must warn about for children. Named below.';
  } else if (ultraProcessedShare !== null && ultraProcessedShare >= 60 && classified >= 4) {
    says =
      `${ultraProcessedShare}% of the classified items are ultra-processed. ` +
      'That is a statement about how this shop was made rather than about any ' +
      'one product — worth a look across the trolley, not a reason to put ' +
      'anything back.';
  } else if (graded === 0 && classified === 0) {
    says = 'None of these items carried a grade or a processing group on its record.';
  } else {
    says = `${graded} of ${products.length} items carried a Nutri-Score, ${classified} a processing group.`;
  }

  return {
    grades: [...gradesByCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, counts]) => ({
        category,
        categoryLabel: NUTRI_CATEGORY_LABELS[category],
        // The rule stated by the function that enforces it, so the UI
        // does not have to restate it and cannot restate it differently.
        comparable: mayCompare(category, category).why,
        counts: (['A', 'B', 'C', 'D', 'E'] as NutriGrade[])
          .map((grade) => ({ grade, items: counts.get(grade) ?? 0 }))
          .filter((g) => g.items > 0),
      })),
    processing,
    ultraProcessedShare,
    commonAdditives: [...additiveCounts.values()]
      .sort((a, b) => b.items - a.items)
      .slice(0, 5)
      .map((a) => ({ code: a.fact.code, name: a.fact.name, role: a.fact.role, items: a.items })),
    warned,
    origins: [...originCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([place, items]) => ({ place, items })),
    read: { graded, classified, additivesListed, originDeclared },
    says,
  };
}

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
    shape: shapeOf(products),
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
