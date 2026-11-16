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
  /** A named body's published classification. Never this platform's view. */
  readonly concern?: AdditiveConcern;
}

/**
 * A published classification by a named scientific body.
 *
 * This is the one part of the module that could do real harm by being
 * careless, so the shape forces the care.
 *
 * **Hazard is not risk.** It is the most misread distinction in this
 * field and the reason `meansNot` is a required field rather than a
 * footnote. IARC classifies whether a substance *can* cause cancer under
 * some conditions, at any dose — not whether it does at the amount in a
 * tin. Group 1 contains processed meat and sunlight alongside asbestos.
 * Reporting "aspartame: possibly carcinogenic" and stopping there would
 * be true, useless and frightening, and this platform serves ten-year-olds
 * and people with health anxiety.
 *
 * So every entry must name the body, the exact classification, the year,
 * what it means, what it does not mean, and where the substance stands
 * with the regulator today — because "classified 2B" and "still
 * authorised with an unchanged acceptable daily intake" are both true
 * and only the pair is honest.
 *
 * Nothing here is aggregated, scored, or turned into a traffic light. A
 * ranking of additives by danger would be this platform substituting its
 * own judgement for a regulator's, which is the thing it must not do.
 */
export interface AdditiveConcern {
  /** The body that published it. */
  readonly body: 'IARC' | 'EFSA' | 'JECFA' | 'FSA';
  /** Their words for the classification, not a paraphrase. */
  readonly classification: string;
  readonly year: number;
  /** What the classification means. */
  readonly means: string;
  /** What it does not mean. Required, because this is where it misleads. */
  readonly meansNot: string;
  /** Where it stands with the regulator today. */
  readonly status: string;
  /**
   * Whether it is authorised as a food additive in the UK today.
   *
   * A fact, not a judgement, and it exists because the summary line used
   * to assert "all approved for use here" without checking — which was
   * false on an imported loaf containing potassium bromate, flatly
   * contradicting the entry three lines below it. A sentence that
   * reassures and a sentence that corrects it are worse together than
   * either alone.
   */
  readonly authorisedHere: boolean;
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
  e171: {
    code: 'E171',
    name: 'Titanium dioxide',
    role: 'White colour',
    regulatoryNote:
      'No longer authorised as a food additive in the EU (Regulation 2022/63). Still permitted in Great Britain at the time of writing.',
    concern: {
      body: 'EFSA',
      classification: 'No longer considered safe as a food additive',
      year: 2021,
      means:
        'EFSA could not rule out genotoxicity — damage to genetic material — and so could not set a safe daily intake. That is why the EU withdrew authorisation.',
      meansNot:
        'Not a finding that it causes cancer. EFSA said the evidence was insufficient to establish safety, which is a different statement from establishing harm.',
      status:
        'Banned as a food additive in the EU since August 2022. Still permitted in Great Britain at the time of writing, so it can appear on products sold here.',
      // Banned in the EU, still permitted in Great Britain. "Here" is the
      // UK, so this is true — and getting it backwards would have told a
      // shopper a legal product was contraband.
      authorisedHere: true,
    },
  },

  e200: { code: 'E200', name: 'Sorbic acid', role: 'Preservative, against moulds and yeasts' },
  e202: { code: 'E202', name: 'Potassium sorbate', role: 'Preservative, against moulds and yeasts' },
  e211: { code: 'E211', name: 'Sodium benzoate', role: 'Preservative' },
  e220: { code: 'E220', name: 'Sulphur dioxide', role: 'Preservative', regulatoryNote: 'A declarable allergen above 10 mg/kg — it must appear in the ingredients list.' },
  e223: { code: 'E223', name: 'Sodium metabisulphite', role: 'Preservative', regulatoryNote: 'A declarable allergen above 10 mg/kg.' },
  e250: {
    code: 'E250',
    name: 'Sodium nitrite',
    role: 'Curing salt, in bacon and ham — colour and botulism control',
    concern: {
      body: 'IARC',
      classification:
        'Group 2A — ingested nitrate or nitrite under conditions that result in endogenous nitrosation is probably carcinogenic to humans',
      year: 2010,
      means:
        'When nitrite meets protein in the gut it can form nitrosamines, and there is strong evidence those are a cancer risk. The classification is about that conversion, not about the salt on its own.',
      meansNot:
        'It is not a classification of the additive in isolation, and not of nitrate from vegetables, which is most of what people eat and which IARC treats differently. Processed meat itself is separately classified Group 1, so the meat is the larger part of this question than the curing salt.',
      status:
        'Authorised in the UK and EU with maximum levels, and it is there to stop botulism. EFSA re-examined the levels in 2017 and found exposure within the acceptable daily intake for most people.',
      authorisedHere: true,
    },
  },
  e251: {
    code: 'E251',
    name: 'Sodium nitrate',
    role: 'Curing salt, in cured meats',
    concern: {
      body: 'IARC',
      classification:
        'Group 2A — ingested nitrate or nitrite under conditions that result in endogenous nitrosation is probably carcinogenic to humans',
      year: 2010,
      means:
        'When nitrite meets protein in the gut it can form nitrosamines, and there is strong evidence those are a cancer risk. The classification is about that conversion, not about the salt on its own.',
      meansNot:
        'It is not a classification of the additive in isolation, and not of nitrate from vegetables, which is most of what people eat and which IARC treats differently. Processed meat itself is separately classified Group 1, so the meat is the larger part of this question than the curing salt.',
      status:
        'Authorised in the UK and EU with maximum levels, and it is there to stop botulism. EFSA re-examined the levels in 2017 and found exposure within the acceptable daily intake for most people.',
      authorisedHere: true,
    },
  },

  e300: { code: 'E300', name: 'Ascorbic acid', role: 'Antioxidant — vitamin C' },
  e320: {
    code: 'E320',
    name: 'BHA (butylated hydroxyanisole)',
    role: 'Antioxidant, stops fats going rancid',
    concern: {
      body: 'IARC',
      classification: 'Group 2B — possibly carcinogenic to humans',
      year: 1986,
      means:
        'High doses produced tumours in the forestomach of rats and mice, which placed it in the group used when animal evidence exists and human evidence does not.',
      meansNot:
        'The forestomach is an organ humans do not have, which is why the finding has not translated into a human classification in the forty years since.',
      status:
        'Authorised in the UK and EU. EFSA re-evaluated it in 2011 and set an acceptable daily intake of 1.0 mg per kg of body weight.',
      authorisedHere: true,
    },
  },
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
  e924: {
    code: 'E924',
    name: 'Potassium bromate',
    role: 'Flour treatment agent, in some imported breads',
    concern: {
      body: 'IARC',
      classification: 'Group 2B — possibly carcinogenic to humans',
      year: 1999,
      means:
        'It produced kidney and thyroid tumours in animal studies, and residues can survive baking.',
      meansNot:
        'Not something you can be exposed to from a product legally sold here, which is the point of the next line.',
      status:
        'Not authorised as a food additive in the UK or EU, and banned in many other countries. If this appears on a label, the product was made for a market that still permits it.',
      authorisedHere: false,
    },
  },

  e950: { code: 'E950', name: 'Acesulfame K', role: 'Sweetener, no energy' },
  e951: {
    code: 'E951',
    name: 'Aspartame',
    role: 'Sweetener, no energy',
    regulatoryNote:
      'Label must carry "contains a source of phenylalanine" — relevant to anyone with PKU.',
    concern: {
      body: 'IARC',
      classification: 'Group 2B — possibly carcinogenic to humans',
      year: 2023,
      means:
        'There is limited evidence that it could cause cancer in humans, so it was placed in the group used when the evidence is suggestive but not sufficient.',
      meansNot:
        'It is not a statement about how much is dangerous. Group 2B also holds aloe vera extract and pickled vegetables. IARC judges whether something can cause cancer under any conditions, not whether it does at the amount in a drink.',
      status:
        'Reviewed by JECFA in the same month, which kept the acceptable daily intake unchanged at 40 mg per kg of body weight — about 9 to 14 cans of a diet drink a day for an adult. Authorised in the UK and EU.',
      authorisedHere: true,
    },
  },
  e952: {
    code: 'E952',
    name: 'Cyclamate',
    role: 'Sweetener, no energy',
    concern: {
      body: 'FSA',
      classification: 'Authorised here, banned in the United States since 1970',
      year: 1970,
      means:
        'The American ban followed a study in which rats fed cyclamate and saccharin together developed bladder tumours.',
      meansNot:
        'Not a current finding. Later work attributed those tumours to a mechanism specific to rats, and European reviews have repeatedly kept it authorised. The two countries read the same evidence differently, which is worth knowing and is not the same as a warning.',
      status:
        'Authorised in the UK and EU with an acceptable daily intake of 7 mg per kg of body weight. Still not permitted in the United States.',
      authorisedHere: true,
    },
  },
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
  /**
   * Additives a named body has published a classification about.
   *
   * Kept apart from `withRegulatoryNote` because they are different in
   * kind and must not be presented the same way. A regulatory note is a
   * legal requirement on the label — the law says those words must
   * appear. A classification is a scientific body's published view, often
   * about hazard rather than risk, frequently decades old, and usually
   * sitting alongside an unchanged authorisation. Showing them in one
   * red box would turn "IARC placed this in the same group as pickled
   * vegetables" into a warning, which is how a shopper ends up more
   * frightened and no better informed.
   */
  readonly withConcern: readonly AdditiveFact[];
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
export function additiveReading(
  tags: readonly string[] | null | undefined,
  /**
   * Whether this record carries an ingredients list at all.
   *
   * Load-bearing, and the reason this parameter exists. Open Food Facts
   * does not transcribe an additive list from the packet — it *derives*
   * `additives_tags` by parsing the ingredients text. A record nobody
   * has entered ingredients for therefore comes back with an empty
   * array, not a missing field, and an empty array read on its own says
   * "this product declares no additives" when the truth is "nobody has
   * typed in what is in it".
   *
   * A Nando's sauce scanned in a supermarket showed exactly that: no
   * processing group, no allergen list, no origin — three independent
   * signs that the ingredients were never entered — and an additives
   * axis that nonetheless read "None declared", which is the one line a
   * shopper avoiding an additive would act on.
   *
   * Absent means absent. An empty derived list over no ingredients is
   * not a finding, and it must not be counted as an axis that was read.
   */
  hasIngredientList = true,
): AdditiveReading {
  const notDeclared = (says: string): AdditiveReading => ({
    count: 0,
    known: [],
    unrecognised: [],
    withRegulatoryNote: [],
    withConcern: [],
    sweeteners: [],
    says,
    source: 'not_declared',
  });

  if (!tags) {
    return notDeclared('No additive list on this record — not declared, rather than none.');
  }
  if (tags.length === 0 && !hasIngredientList) {
    return notDeclared(
      'No additives can be read: this record has no ingredients list, and the additive ' +
        'list is worked out from the ingredients. Not declared, rather than none — the ' +
        'packet in your hand is the one to read.',
    );
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
  const withConcern = known.filter((a) => a.concern);
  const sweeteners = known.filter((a) => /sweetener|sugar alcohol/i.test(a.role));

  let says: string;
  if (codes.length === 0) {
    says = 'No additives declared on this record.';
  } else if (withConcern.some((a) => !a.concern!.authorisedHere)) {
    /*
     * Something here is not authorised in the UK. That outranks the
     * reassuring phrasing below, which used to be asserted without ever
     * being checked — and was false on an imported loaf carrying
     * potassium bromate, contradicting the entry a few lines under it.
     */
    const unauthorised = withConcern.filter((a) => !a.concern!.authorisedHere);
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}. ` +
      `${unauthorised.map((a) => a.name).join(' and ')} ` +
      `${unauthorised.length === 1 ? 'is' : 'are'} not authorised as a food additive ` +
      'in the UK, so this product was made for a market that permits it. Set out below.';
  } else if (withRegulatoryNote.length > 0) {
    /*
     * The legal requirement leads, because it is the only line here the
     * law compels. But a classification must not vanish behind it: an
     * additive can carry both — aspartame's label must declare
     * phenylalanine *and* IARC published a classification — and dropping
     * the second because the first outranked it would hide it on exactly
     * the products that have most to say.
     */
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}, ` +
      `${withRegulatoryNote.length} of which carr${withRegulatoryNote.length === 1 ? 'ies' : 'y'} ` +
      'a warning the label is legally required to print.' +
      (withConcern.length > 0
        ? ` ${withConcern.length} ${withConcern.length === 1 ? 'has' : 'have'} also been ` +
          `classified by ${[...new Set(withConcern.map((a) => a.concern!.body))].join(' and ')}.`
        : '') +
      ' Each is named below.';
  } else if (withConcern.length > 0) {
    /*
     * Deliberately flat. The sentence names the number and the body and
     * stops; the classification, what it means and what it does not mean
     * are all in the entry itself. A summary line is the wrong place for
     * a nuance that takes three sentences, and a frightening half of it
     * is worse than none.
     */
    const bodies = [...new Set(withConcern.map((a) => a.concern!.body))].join(' and ');
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}, ${codes.length === 1 ? 'approved' : 'all approved'} for use here. ` +
      `${withConcern.length} ${withConcern.length === 1 ? 'has' : 'have'} been classified by ` +
      `${bodies} — each is set out below with what the classification does and does not mean.`;
  } else {
    says =
      `${codes.length} additive${codes.length === 1 ? '' : 's'}, ${codes.length === 1 ? 'approved' : 'all approved'} for use. ` +
      'Named below with what each one does — none of this is a safety ranking.';
  }

  return {
    count: codes.length,
    known,
    unrecognised,
    withRegulatoryNote,
    withConcern,
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
      /*
       * Not declared, even when a sold-in country is present.
       *
       * This said `open_food_facts` whenever `countries` was filled in,
       * which made a record carrying nothing but "sold in France" count
       * as an origin axis that had been read — while the sentence
       * directly above it said "No origin declared". The axis count
       * feeds "N of 3 beyond the nutrition panel were declared", so the
       * summary contradicted its own detail, and it did so in the
       * direction that flatters the record.
       *
       * Where a product is sold is kept and still reported, because the
       * sentence explaining why it is not an origin is worth saying. It
       * is simply not an answer to the question the axis asks.
       */
      source: 'not_declared',
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
  /**
   * The record's ingredients text, if it has one.
   *
   * Needed because the additive list is derived from it: an empty
   * additive list over a record with no ingredients is an absence of
   * data, not an absence of additives. See `additiveReading`.
   */
  readonly ingredientsText?: string | null;
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
  const additives = additiveReading(
    input.additiveTags ?? null,
    typeof input.ingredientsText === 'string' && input.ingredientsText.trim() !== '',
  );
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
