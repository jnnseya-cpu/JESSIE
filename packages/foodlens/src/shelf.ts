/**
 * The other three questions a packet answers.
 *
 * Nutri-Score reads the nutrition panel and nothing else. It is explicit
 * about that, and the things it cannot see are not minor: how far the
 * food has been from food, what has been put into it, and where it came
 * from. A scanner that reports only the letter has told a shopper about
 * one quarter of the packet in their hand.
 *
 * So four readings, kept apart on purpose.
 *
 * They are **never combined into one number**. `NEVER_CLAIM` forbids a
 * single composite health score and the reason is not squeamishness: a
 * blended figure lets a good score on one axis cancel a bad one on
 * another, and the four axes here are not commensurable. A tin of
 * chickpeas from Italy with no additives and an unremarkable Nutri-Score
 * is a different proposition from a sweetener-heavy drink that scores B,
 * and a single number would rank them and be wrong.
 *
 * Four readings also fail more honestly. Each can be absent on its own —
 * plenty of records carry a nutrition panel and no origin — and an axis
 * that says "not declared" is useful, where a composite quietly scoring
 * it as average is not.
 */

/* ------------------------------------------------------------------ *
 * 2 · Processing — how far from food
 * ------------------------------------------------------------------ */

/**
 * NOVA, the classification Nutri-Score does not make.
 *
 * Four groups, by what has been done to the food rather than by what is
 * in it. It is the axis that separates a tin of tomatoes from a tomato
 * sauce with modified starch and flavouring, both of which can carry the
 * same letter.
 *
 * It is a classification, not a ranking, and group 4 is not a verdict on
 * a meal. Bread is group 4. So is baby formula. The useful question is
 * never "is this a 4" but "how much of the basket is", which is why the
 * basket view totals it.
 */
export const NOVA_GROUPS = [1, 2, 3, 4] as const;
export type NovaGroup = (typeof NOVA_GROUPS)[number];

export interface NovaDefinition {
  readonly group: NovaGroup;
  readonly label: string;
  readonly what: string;
  readonly examples: string;
}

export const NOVA_DEFINITIONS: Readonly<Record<NovaGroup, NovaDefinition>> = {
  1: {
    group: 1,
    label: 'Unprocessed or minimally processed',
    what: 'The food, and at most something done to keep it — drying, chilling, freezing, pasteurising.',
    examples: 'Fresh fruit, plain frozen peas, dried pulses, milk, eggs, plain rice.',
  },
  2: {
    group: 2,
    label: 'Processed culinary ingredient',
    what: 'Extracted from a food to cook with, rather than eaten on its own.',
    examples: 'Oil, butter, sugar, salt, vinegar.',
  },
  3: {
    group: 3,
    label: 'Processed food',
    what: 'A group 1 food with a group 2 ingredient added — usually salt, sugar or oil — and little else.',
    examples: 'Tinned pulses in water and salt, cheese, bacon, bread made of flour, water, yeast and salt.',
  },
  4: {
    group: 4,
    label: 'Ultra-processed',
    what: 'Made largely from substances extracted from foods, with ingredients a domestic kitchen does not hold — isolates, modified starches, colours, flavourings, emulsifiers.',
    examples: 'Soft drinks, most packaged snacks, reconstituted meat products, many breakfast cereals, most supermarket bread.',
  },
};

export interface ProcessingReading {
  readonly group: NovaGroup | null;
  readonly label: string;
  readonly what: string;
  readonly says: string;
  readonly source: 'open_food_facts' | 'not_declared';
}

export function processingReading(novaGroup: number | null | undefined): ProcessingReading {
  const group = NOVA_GROUPS.find((g) => g === novaGroup) ?? null;
  if (!group) {
    return {
      group: null,
      label: 'Not classified',
      what: 'This record carries no processing classification.',
      says: 'Unknown, which is not the same as unprocessed — nobody has classified this product yet.',
      source: 'not_declared',
    };
  }
  const definition = NOVA_DEFINITIONS[group];
  return {
    group,
    label: definition.label,
    what: definition.what,
    says:
      group === 4
        ? 'Ultra-processed. That is a statement about how it was made, not a verdict on eating it — bread and infant formula are both group 4. It is worth watching across a whole basket rather than one item.'
        : `Group ${group} of 4: ${definition.label.toLowerCase()}.`,
    source: 'open_food_facts',
  };
}

/* ------------------------------------------------------------------ *
 * 3 · Additives — what has been put in
 * ------------------------------------------------------------------ */

/**
 * E numbers, in English.
 *
 * An ingredients list saying "E471, E330, E202" tells a shopper nothing,
 * which is the problem this solves. Every entry names what the substance
 * does, because "emulsifier" is the answer to the question somebody is
 * actually asking in an aisle.
 *
 * Deliberately **not** a safety ranking. Every additive here is approved
 * for use, and this platform is not a regulator: inventing a traffic
 * light for additives would be exactly the composite verdict that is
 * forbidden, dressed as a service. Where a substance carries a specific
 * regulatory note — the six colours requiring a hyperactivity warning in
 * the UK, for instance — that note is the regulator's own words and is
 * marked as such.
 */
export interface AdditiveFact {
  readonly code: string;
  readonly name: string;
  readonly role: string;
  /** A regulator's own note, where one exists. Never this platform's opinion. */
  readonly regulatoryNote?: string;
}

/**
 * The six colours requiring a specific warning in the UK and EU.
 *
 * Retained EU Regulation 1333/2008 requires the words "may have an
 * adverse effect on activity and attention in children" on the label of
 * any food containing these. It is the one additive note that is a legal
 * requirement rather than an opinion, which is why it is quoted rather
 * than paraphrased.
 */
const SOUTHAMPTON_WARNING =
  'Label must carry: "may have an adverse effect on activity and attention in children" (retained Regulation 1333/2008).';

export const ADDITIVE_FACTS: Readonly<Record<string, AdditiveFact>> = {
  e102: { code: 'E102', name: 'Tartrazine', role: 'Yellow colour', regulatoryNote: SOUTHAMPTON_WARNING },
  e104: { code: 'E104', name: 'Quinoline yellow', role: 'Yellow colour', regulatoryNote: SOUTHAMPTON_WARNING },
  e110: { code: 'E110', name: 'Sunset yellow FCF', role: 'Orange colour', regulatoryNote: SOUTHAMPTON_WARNING },
  e122: { code: 'E122', name: 'Carmoisine', role: 'Red colour', regulatoryNote: SOUTHAMPTON_WARNING },
  e124: { code: 'E124', name: 'Ponceau 4R', role: 'Red colour', regulatoryNote: SOUTHAMPTON_WARNING },
  e129: { code: 'E129', name: 'Allura red AC', role: 'Red colour', regulatoryNote: SOUTHAMPTON_WARNING },

  e100: { code: 'E100', name: 'Curcumin', role: 'Yellow colour, from turmeric' },
  e120: { code: 'E120', name: 'Cochineal / carmine', role: 'Red colour, from insects — relevant if you avoid animal products' },
  e150a: { code: 'E150a', name: 'Plain caramel', role: 'Brown colour' },
  e150d: { code: 'E150d', name: 'Sulphite ammonia caramel', role: 'Brown colour, common in colas' },
  e160a: { code: 'E160a', name: 'Carotenes', role: 'Orange colour' },
  e160c: { code: 'E160c', name: 'Paprika extract', role: 'Orange-red colour' },
  e171: { code: 'E171', name: 'Titanium dioxide', role: 'White colour', regulatoryNote: 'No longer authorised as a food additive in the EU (Regulation 2022/63). Still permitted in Great Britain at the time of writing.' },

  e200: { code: 'E200', name: 'Sorbic acid', role: 'Preservative, against moulds and yeasts' },
  e202: { code: 'E202', name: 'Potassium sorbate', role: 'Preservative, against moulds and yeasts' },
  e211: { code: 'E211', name: 'Sodium benzoate', role: 'Preservative' },
  e220: { code: 'E220', name: 'Sulphur dioxide', role: 'Preservative', regulatoryNote: 'A declarable allergen above 10 mg/kg — it must appear in the ingredients list.' },
  e223: { code: 'E223', name: 'Sodium metabisulphite', role: 'Preservative', regulatoryNote: 'A declarable allergen above 10 mg/kg.' },
  e250: { code: 'E250', name: 'Sodium nitrite', role: 'Curing salt, in bacon and ham — colour and botulism control' },
  e251: { code: 'E251', name: 'Sodium nitrate', role: 'Curing salt, in cured meats' },

  e300: { code: 'E300', name: 'Ascorbic acid', role: 'Antioxidant — vitamin C' },
  e322: { code: 'E322', name: 'Lecithins', role: 'Emulsifier, keeps fat and water mixed' },
  e330: { code: 'E330', name: 'Citric acid', role: 'Acidity regulator and preservative' },
  e331: { code: 'E331', name: 'Sodium citrates', role: 'Acidity regulator' },
  e338: { code: 'E338', name: 'Phosphoric acid', role: 'Acidity regulator, common in colas' },
  e392: { code: 'E392', name: 'Rosemary extract', role: 'Antioxidant' },

  e407: { code: 'E407', name: 'Carrageenan', role: 'Thickener, from seaweed' },
  e410: { code: 'E410', name: 'Locust bean gum', role: 'Thickener' },
  e412: { code: 'E412', name: 'Guar gum', role: 'Thickener' },
  e414: { code: 'E414', name: 'Acacia gum', role: 'Thickener and stabiliser' },
  e415: { code: 'E415', name: 'Xanthan gum', role: 'Thickener' },
  e440: { code: 'E440', name: 'Pectins', role: 'Gelling agent, from fruit' },
  e450: { code: 'E450', name: 'Diphosphates', role: 'Raising agent and stabiliser' },
  e466: { code: 'E466', name: 'Carboxymethylcellulose', role: 'Thickener' },
  e471: { code: 'E471', name: 'Mono- and diglycerides of fatty acids', role: 'Emulsifier — the most common additive in packaged bread and spreads' },
  e472e: { code: 'E472e', name: 'DATEM', role: 'Emulsifier, in bread' },
  e476: { code: 'E476', name: 'Polyglycerol polyricinoleate', role: 'Emulsifier, in chocolate' },
  e481: { code: 'E481', name: 'Sodium stearoyl-2-lactylate', role: 'Emulsifier, in bread' },

  e500: { code: 'E500', name: 'Sodium carbonates', role: 'Raising agent — bicarbonate of soda' },
  e503: { code: 'E503', name: 'Ammonium carbonates', role: 'Raising agent' },
  e621: { code: 'E621', name: 'Monosodium glutamate', role: 'Flavour enhancer' },

  e950: { code: 'E950', name: 'Acesulfame K', role: 'Sweetener, no energy' },
  e951: { code: 'E951', name: 'Aspartame', role: 'Sweetener, no energy', regulatoryNote: 'Label must carry "contains a source of phenylalanine" — relevant to anyone with PKU.' },
  e952: { code: 'E952', name: 'Cyclamate', role: 'Sweetener, no energy' },
  e954: { code: 'E954', name: 'Saccharin', role: 'Sweetener, no energy' },
  e955: { code: 'E955', name: 'Sucralose', role: 'Sweetener, no energy' },
  e960: { code: 'E960', name: 'Steviol glycosides', role: 'Sweetener from stevia, no energy' },
  e965: { code: 'E965', name: 'Maltitol', role: 'Sugar alcohol', regulatoryNote: 'Above 10%, the label must warn that excessive consumption may have a laxative effect.' },
  e967: { code: 'E967', name: 'Xylitol', role: 'Sugar alcohol' },
  e968: { code: 'E968', name: 'Erythritol', role: 'Sugar alcohol' },
};

export interface AdditiveReading {
  readonly count: number;
  readonly known: readonly AdditiveFact[];
  readonly unrecognised: readonly string[];
  /** Additives whose label carries a legally required warning. */
  readonly withRegulatoryNote: readonly AdditiveFact[];
  readonly sweeteners: readonly AdditiveFact[];
  readonly says: string;
  readonly source: 'open_food_facts' | 'not_declared';
}

/**
 * Read the additive tags on a record.
 *
 * Unrecognised codes are listed rather than dropped. A scanner that
 * silently shows four of a product's nine additives has told a more
 * confident lie than one that says it does not recognise five.
 */
export function additiveReading(tags: readonly string[] | null | undefined): AdditiveReading {
  if (!tags) {
    return {
      count: 0,
      known: [],
      unrecognised: [],
      withRegulatoryNote: [],
      sweeteners: [],
      says: 'No additive list on this record — not declared, rather than none.',
      source: 'not_declared',
    };
  }

  const codes = [
    ...new Set(
      tags
        .map((t) => t.replace(/^[a-z]{2}:/, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
        .filter(Boolean),
    ),
  ];
  const known: AdditiveFact[] = [];
  const unrecognised: string[] = [];
  for (const code of codes) {
    const fact = ADDITIVE_FACTS[code];
    if (fact) known.push(fact);
    else unrecognised.push(code.toUpperCase());
  }

  const withRegulatoryNote = known.filter((a) => a.regulatoryNote);
  const sweeteners = known.filter((a) => /sweetener|sugar alcohol/i.test(a.role));

  let says: string;
  if (codes.length === 0) {
    says = 'No additives declared on this record.';
  } else if (withRegulatoryNote.length > 0) {
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}, ` +
      `${withRegulatoryNote.length} of which carr${withRegulatoryNote.length === 1 ? 'ies' : 'y'} ` +
      'a warning the label is legally required to print. Each is named below.';
  } else {
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}, all approved for use. ` +
      'Named below with what each one does — none of this is a safety ranking.';
  }

  return {
    count: codes.length,
    known,
    unrecognised,
    withRegulatoryNote,
    sweeteners,
    says,
    source: 'open_food_facts',
  };
}

/* ------------------------------------------------------------------ *
 * 4 · Origin — where it came from
 * ------------------------------------------------------------------ */

/**
 * Where the food is from, and the distinction nobody makes.
 *
 * "Origin" on a packet can mean three different things and they are
 * routinely conflated: where the ingredients were grown, where the
 * product was manufactured, and which markets it is sold in. A jar
 * labelled as a product of Italy may hold tomatoes grown elsewhere, and
 * this is legal.
 *
 * So the three are reported separately and never merged into a single
 * "from" line. Where only the sold-in list exists, that is said plainly,
 * because a list of markets is not a provenance and presenting it as one
 * is the most common way this field misleads.
 */
export interface OriginReading {
  /** Where the ingredients come from, as declared. */
  readonly ingredientOrigins: readonly string[];
  /** Where it was made or packed. */
  readonly manufacturingPlaces: readonly string[];
  /** Markets the record lists it as sold in. Not a provenance. */
  readonly soldIn: readonly string[];
  readonly says: string;
  readonly source: 'open_food_facts' | 'not_declared';
}

const clean = (value: unknown): string[] =>
  typeof value === 'string'
    ? [
        ...new Set(
          value
            .split(',')
            .map((s) => s.replace(/^[a-z]{2}:/, '').trim())
            .filter((s) => s.length > 0 && s.length <= 60)
            .map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
        ),
      ]
    : Array.isArray(value)
      ? [
          ...new Set(
            (value as unknown[])
              .filter((v): v is string => typeof v === 'string')
              .map((s) => s.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim())
              .filter((s) => s.length > 0 && s.length <= 60)
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
          ),
        ]
      : [];

export function originReading(input: {
  origins?: unknown;
  manufacturingPlaces?: unknown;
  countries?: unknown;
}): OriginReading {
  const ingredientOrigins = clean(input.origins);
  const manufacturingPlaces = clean(input.manufacturingPlaces);
  const soldIn = clean(input.countries);

  if (ingredientOrigins.length === 0 && manufacturingPlaces.length === 0) {
    return {
      ingredientOrigins,
      manufacturingPlaces,
      soldIn,
      says:
        soldIn.length > 0
          ? `No origin declared. The record lists where it is sold (${soldIn.slice(0, 3).join(', ')}), which is not the same thing and does not tell you where the food came from.`
          : 'No origin declared on this record.',
      source: soldIn.length > 0 ? 'open_food_facts' : 'not_declared',
    };
  }

  const parts: string[] = [];
  if (ingredientOrigins.length > 0) {
    parts.push(`Ingredients declared from ${ingredientOrigins.join(', ')}.`);
  }
  if (manufacturingPlaces.length > 0) {
    parts.push(`Made or packed in ${manufacturingPlaces.join(', ')}.`);
  }
  if (ingredientOrigins.length === 0 && manufacturingPlaces.length > 0) {
    parts.push('Where the ingredients were grown is not declared — made in is not grown in.');
  }
  return {
    ingredientOrigins,
    manufacturingPlaces,
    soldIn,
    says: parts.join(' '),
    source: 'open_food_facts',
  };
}

/* ------------------------------------------------------------------ *
 * The four, kept apart
 * ------------------------------------------------------------------ */

export interface ShelfReadingInput {
  readonly novaGroup?: number | null;
  readonly additiveTags?: readonly string[] | null;
  readonly origins?: unknown;
  readonly manufacturingPlaces?: unknown;
  readonly countries?: unknown;
}

export interface ShelfReading {
  readonly processing: ProcessingReading;
  readonly additives: AdditiveReading;
  readonly origin: OriginReading;
  /**
   * How much of the packet this scan could actually read, 0–4 axes.
   *
   * Reported because a product with three "not declared" readings looks
   * identical to a clean one if you only read the letter, and the
   * difference between "nothing to flag" and "nothing recorded" is the
   * whole of the value here.
   */
  readonly axesRead: number;
  readonly says: string;
}

export function shelfReading(input: ShelfReadingInput): ShelfReading {
  const processing = processingReading(input.novaGroup);
  const additives = additiveReading(input.additiveTags ?? null);
  const origin = originReading(input);

  const axesRead = [
    processing.source !== 'not_declared',
    additives.source !== 'not_declared',
    origin.source !== 'not_declared',
  ].filter(Boolean).length;

  return {
    processing,
    additives,
    origin,
    axesRead,
    says:
      axesRead === 0
        ? 'This record carries a nutrition panel and nothing else — no processing group, no additive list, no origin.'
        : `${axesRead} of 3 beyond the nutrition panel were declared on this record.`,
  };
}
