/**
 * Typical composition, per 100g, shipped with the platform.
 *
 * Why this exists: the front-of-pack table kept coming back empty. Not
 * because the analysis was wrong, but because it depended on a model
 * returning four numbers on every single request. When that round trip
 * missed — a fenced reply, a timeout, a model in a hurry — there were no
 * figures, and a panel that is sometimes there and sometimes not is worse
 * than one that is always wrong, because nobody can tell which they are
 * looking at.
 *
 * So the common case is answered from here: a published-composition table
 * that is instant, free, offline and identical on every request. The model
 * is now the fallback rather than the source, and the table is stable.
 *
 * What these figures are, exactly: the typical composition of a dish of
 * that name, per 100g as served. They are not a measurement of the plate
 * in front of anybody, and the row that carries them says so — the basis
 * word is "typical composition", never "from the label". A barcode still
 * outranks all of it, and what the member tells us outranks even that.
 *
 * Sources are the ordinary published composition figures for these foods.
 * Nothing here is novel, and where a dish varies wildly by recipe the
 * entry sits at the middle of the usual range rather than at either end.
 */

export interface Composition {
  /** Per 100g as served. */
  fatG: number;
  saturatesG: number;
  sugarsG: number;
  saltG: number;
  /** Energy per 100g, used when nothing else gives a figure. */
  kcal: number;
}

/**
 * Keyed by the words that appear in a name. Longer keys win, so
 * "fried rice" beats "rice" and "sweet potato" beats "potato".
 */
export const COMPOSITION: Readonly<Record<string, Composition>> = {
  /* ---- rice, grains and starches ---- */
  'jollof rice': { fatG: 5.8, saturatesG: 1.1, sugarsG: 1.9, saltG: 0.7, kcal: 170 },
  'fried rice': { fatG: 6.5, saturatesG: 1.3, sugarsG: 1.2, saltG: 0.8, kcal: 185 },
  'egg fried rice': { fatG: 7.2, saturatesG: 1.5, sugarsG: 1.1, saltG: 0.8, kcal: 195 },
  'pilau rice': { fatG: 4.6, saturatesG: 0.9, sugarsG: 0.8, saltG: 0.6, kcal: 165 },
  'brown rice': { fatG: 1.0, saturatesG: 0.2, sugarsG: 0.4, saltG: 0.01, kcal: 132 },
  'white rice': { fatG: 0.4, saturatesG: 0.1, sugarsG: 0.1, saltG: 0.01, kcal: 130 },
  rice: { fatG: 1.2, saturatesG: 0.3, sugarsG: 0.3, saltG: 0.2, kcal: 140 },
  'wholemeal pasta': { fatG: 1.1, saturatesG: 0.2, sugarsG: 0.8, saltG: 0.01, kcal: 124 },
  spaghetti: { fatG: 1.1, saturatesG: 0.2, sugarsG: 0.6, saltG: 0.01, kcal: 158 },
  pasta: { fatG: 1.1, saturatesG: 0.2, sugarsG: 0.6, saltG: 0.01, kcal: 158 },
  noodles: { fatG: 2.1, saturatesG: 0.5, sugarsG: 0.6, saltG: 0.5, kcal: 150 },
  couscous: { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.1, saltG: 0.01, kcal: 112 },
  quinoa: { fatG: 1.9, saturatesG: 0.2, sugarsG: 0.9, saltG: 0.01, kcal: 120 },
  'wholemeal bread': { fatG: 2.5, saturatesG: 0.5, sugarsG: 3.2, saltG: 0.95, kcal: 247 },
  'white bread': { fatG: 1.5, saturatesG: 0.3, sugarsG: 3.4, saltG: 0.98, kcal: 235 },
  bread: { fatG: 1.9, saturatesG: 0.4, sugarsG: 3.3, saltG: 0.97, kcal: 240 },
  toast: { fatG: 2.6, saturatesG: 0.6, sugarsG: 3.5, saltG: 1.0, kcal: 265 },
  chapati: { fatG: 6.2, saturatesG: 1.4, sugarsG: 1.2, saltG: 0.8, kcal: 297 },
  naan: { fatG: 6.8, saturatesG: 1.6, sugarsG: 4.1, saltG: 1.1, kcal: 310 },
  tortilla: { fatG: 7.0, saturatesG: 1.8, sugarsG: 2.0, saltG: 1.2, kcal: 306 },
  porridge: { fatG: 1.7, saturatesG: 0.4, sugarsG: 1.4, saltG: 0.1, kcal: 68 },
  'breakfast cereal': { fatG: 2.0, saturatesG: 0.5, sugarsG: 17.0, saltG: 0.7, kcal: 379 },
  cereal: { fatG: 2.0, saturatesG: 0.5, sugarsG: 17.0, saltG: 0.7, kcal: 379 },

  /* ---- potatoes, yam and plantain ---- */
  'sweet potato': { fatG: 0.1, saturatesG: 0.0, sugarsG: 5.7, saltG: 0.03, kcal: 86 },
  'mashed potato': { fatG: 4.2, saturatesG: 2.5, sugarsG: 1.4, saltG: 0.5, kcal: 108 },
  'roast potato': { fatG: 4.5, saturatesG: 0.7, sugarsG: 0.7, saltG: 0.3, kcal: 149 },
  'jacket potato': { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.9, saltG: 0.02, kcal: 93 },
  'boiled potato': { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.9, saltG: 0.01, kcal: 80 },
  chips: { fatG: 9.4, saturatesG: 1.2, sugarsG: 0.4, saltG: 0.5, kcal: 232 },
  'french fries': { fatG: 12.0, saturatesG: 1.7, sugarsG: 0.3, saltG: 0.6, kcal: 274 },
  potato: { fatG: 0.4, saturatesG: 0.1, sugarsG: 1.0, saltG: 0.05, kcal: 87 },
  'fried plantain': { fatG: 8.8, saturatesG: 1.9, sugarsG: 15.6, saltG: 0.15, kcal: 205 },
  dodo: { fatG: 8.8, saturatesG: 1.9, sugarsG: 15.6, saltG: 0.15, kcal: 205 },
  plantain: { fatG: 0.4, saturatesG: 0.1, sugarsG: 14.0, saltG: 0.01, kcal: 122 },
  'pounded yam': { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.6, saltG: 0.02, kcal: 118 },
  yam: { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.5, saltG: 0.01, kcal: 116 },
  fufu: { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.4, saltG: 0.02, kcal: 120 },
  eba: { fatG: 0.3, saturatesG: 0.1, sugarsG: 0.3, saltG: 0.02, kcal: 128 },
  garri: { fatG: 0.3, saturatesG: 0.1, sugarsG: 0.3, saltG: 0.02, kcal: 128 },

  /* ---- meat, fish and eggs ---- */
  'fried chicken': { fatG: 15.0, saturatesG: 3.9, sugarsG: 0.4, saltG: 1.2, kcal: 265 },
  'grilled chicken': { fatG: 3.6, saturatesG: 1.0, sugarsG: 0.0, saltG: 0.4, kcal: 165 },
  'roast chicken': { fatG: 7.4, saturatesG: 2.1, sugarsG: 0.0, saltG: 0.5, kcal: 190 },
  'chicken breast': { fatG: 3.6, saturatesG: 1.0, sugarsG: 0.0, saltG: 0.2, kcal: 165 },
  chicken: { fatG: 6.0, saturatesG: 1.7, sugarsG: 0.1, saltG: 0.4, kcal: 180 },
  turkey: { fatG: 3.2, saturatesG: 1.0, sugarsG: 0.0, saltG: 0.3, kcal: 157 },
  bacon: { fatG: 26.0, saturatesG: 9.8, sugarsG: 0.5, saltG: 2.9, kcal: 320 },
  sausage: { fatG: 21.0, saturatesG: 7.8, sugarsG: 1.4, saltG: 1.8, kcal: 290 },
  ham: { fatG: 4.2, saturatesG: 1.5, sugarsG: 0.9, saltG: 2.2, kcal: 120 },
  'minced beef': { fatG: 14.0, saturatesG: 5.9, sugarsG: 0.0, saltG: 0.2, kcal: 215 },
  steak: { fatG: 9.0, saturatesG: 3.6, sugarsG: 0.0, saltG: 0.2, kcal: 210 },
  beef: { fatG: 12.0, saturatesG: 4.9, sugarsG: 0.0, saltG: 0.2, kcal: 215 },
  lamb: { fatG: 16.0, saturatesG: 7.1, sugarsG: 0.0, saltG: 0.2, kcal: 250 },
  goat: { fatG: 3.0, saturatesG: 0.9, sugarsG: 0.0, saltG: 0.2, kcal: 143 },
  pork: { fatG: 12.0, saturatesG: 4.3, sugarsG: 0.0, saltG: 0.2, kcal: 210 },
  suya: { fatG: 12.5, saturatesG: 4.4, sugarsG: 1.2, saltG: 2.0, kcal: 245 },
  salmon: { fatG: 13.0, saturatesG: 3.0, sugarsG: 0.0, saltG: 0.2, kcal: 208 },
  tuna: { fatG: 1.0, saturatesG: 0.3, sugarsG: 0.0, saltG: 0.9, kcal: 116 },
  'fried fish': { fatG: 13.0, saturatesG: 2.0, sugarsG: 0.6, saltG: 0.9, kcal: 232 },
  fish: { fatG: 2.5, saturatesG: 0.5, sugarsG: 0.0, saltG: 0.3, kcal: 105 },
  prawns: { fatG: 0.9, saturatesG: 0.2, sugarsG: 0.0, saltG: 1.5, kcal: 99 },
  'fried egg': { fatG: 14.8, saturatesG: 3.6, sugarsG: 0.4, saltG: 0.5, kcal: 196 },
  'scrambled egg': { fatG: 12.5, saturatesG: 4.2, sugarsG: 1.3, saltG: 0.6, kcal: 166 },
  egg: { fatG: 10.6, saturatesG: 3.1, sugarsG: 0.4, saltG: 0.3, kcal: 143 },
  tofu: { fatG: 4.8, saturatesG: 0.7, sugarsG: 0.6, saltG: 0.02, kcal: 76 },

  /* ---- pulses ---- */
  'baked beans': { fatG: 0.6, saturatesG: 0.1, sugarsG: 5.0, saltG: 0.6, kcal: 81 },
  'black beans': { fatG: 0.5, saturatesG: 0.1, sugarsG: 0.3, saltG: 0.01, kcal: 132 },
  lentils: { fatG: 0.4, saturatesG: 0.1, sugarsG: 1.8, saltG: 0.01, kcal: 116 },
  chickpeas: { fatG: 2.6, saturatesG: 0.3, sugarsG: 4.8, saltG: 0.02, kcal: 164 },
  beans: { fatG: 0.6, saturatesG: 0.1, sugarsG: 1.5, saltG: 0.2, kcal: 120 },
  'moi moi': { fatG: 7.5, saturatesG: 1.4, sugarsG: 1.6, saltG: 0.7, kcal: 165 },

  /* ---- dairy ---- */
  cheddar: { fatG: 34.9, saturatesG: 21.7, sugarsG: 0.1, saltG: 1.8, kcal: 416 },
  mozzarella: { fatG: 22.0, saturatesG: 13.2, sugarsG: 1.0, saltG: 1.4, kcal: 280 },
  cheese: { fatG: 30.0, saturatesG: 18.5, sugarsG: 0.5, saltG: 1.7, kcal: 380 },
  yoghurt: { fatG: 3.3, saturatesG: 2.1, sugarsG: 4.7, saltG: 0.13, kcal: 61 },
  milk: { fatG: 1.8, saturatesG: 1.1, sugarsG: 4.7, saltG: 0.11, kcal: 50 },
  butter: { fatG: 81.0, saturatesG: 51.0, sugarsG: 0.6, saltG: 1.7, kcal: 717 },
  cream: { fatG: 30.0, saturatesG: 19.0, sugarsG: 2.9, saltG: 0.08, kcal: 292 },

  /* ---- vegetables, salad and fruit ---- */
  salad: { fatG: 0.3, saturatesG: 0.1, sugarsG: 2.0, saltG: 0.03, kcal: 20 },
  lettuce: { fatG: 0.2, saturatesG: 0.0, sugarsG: 0.8, saltG: 0.01, kcal: 15 },
  spinach: { fatG: 0.4, saturatesG: 0.1, sugarsG: 0.4, saltG: 0.2, kcal: 23 },
  broccoli: { fatG: 0.4, saturatesG: 0.1, sugarsG: 1.7, saltG: 0.08, kcal: 34 },
  carrot: { fatG: 0.2, saturatesG: 0.0, sugarsG: 4.7, saltG: 0.17, kcal: 41 },
  peas: { fatG: 0.4, saturatesG: 0.1, sugarsG: 5.7, saltG: 0.01, kcal: 81 },
  sweetcorn: { fatG: 1.4, saturatesG: 0.2, sugarsG: 6.3, saltG: 0.3, kcal: 96 },
  tomato: { fatG: 0.2, saturatesG: 0.0, sugarsG: 2.6, saltG: 0.01, kcal: 18 },
  cucumber: { fatG: 0.1, saturatesG: 0.0, sugarsG: 1.7, saltG: 0.01, kcal: 15 },
  onion: { fatG: 0.1, saturatesG: 0.0, sugarsG: 4.2, saltG: 0.01, kcal: 40 },
  pepper: { fatG: 0.3, saturatesG: 0.1, sugarsG: 4.2, saltG: 0.01, kcal: 31 },
  mushroom: { fatG: 0.3, saturatesG: 0.1, sugarsG: 1.0, saltG: 0.01, kcal: 22 },
  avocado: { fatG: 15.0, saturatesG: 2.1, sugarsG: 0.7, saltG: 0.02, kcal: 160 },
  banana: { fatG: 0.3, saturatesG: 0.1, sugarsG: 12.2, saltG: 0.01, kcal: 89 },
  apple: { fatG: 0.2, saturatesG: 0.0, sugarsG: 10.4, saltG: 0.01, kcal: 52 },
  orange: { fatG: 0.1, saturatesG: 0.0, sugarsG: 9.4, saltG: 0.01, kcal: 47 },
  berries: { fatG: 0.3, saturatesG: 0.0, sugarsG: 5.5, saltG: 0.01, kcal: 43 },
  grapes: { fatG: 0.2, saturatesG: 0.1, sugarsG: 16.3, saltG: 0.01, kcal: 69 },
  vegetables: { fatG: 0.4, saturatesG: 0.1, sugarsG: 3.0, saltG: 0.05, kcal: 40 },

  /* ---- soups and stews ---- */
  'egusi soup': { fatG: 15.0, saturatesG: 3.5, sugarsG: 1.2, saltG: 1.1, kcal: 200 },
  'okra soup': { fatG: 8.0, saturatesG: 2.0, sugarsG: 1.5, saltG: 1.0, kcal: 120 },
  'pepper soup': { fatG: 4.5, saturatesG: 1.4, sugarsG: 0.8, saltG: 1.1, kcal: 85 },
  stew: { fatG: 7.5, saturatesG: 2.2, sugarsG: 2.6, saltG: 0.9, kcal: 125 },
  curry: { fatG: 8.5, saturatesG: 3.4, sugarsG: 3.0, saltG: 0.9, kcal: 145 },
  soup: { fatG: 2.4, saturatesG: 0.8, sugarsG: 1.9, saltG: 0.7, kcal: 55 },
  'tomato sauce': { fatG: 2.0, saturatesG: 0.3, sugarsG: 5.4, saltG: 0.8, kcal: 60 },

  /* ---- composite meals ---- */
  pizza: { fatG: 10.0, saturatesG: 4.4, sugarsG: 3.2, saltG: 1.3, kcal: 266 },
  burger: { fatG: 13.5, saturatesG: 5.3, sugarsG: 4.0, saltG: 1.2, kcal: 250 },
  lasagne: { fatG: 6.9, saturatesG: 3.1, sugarsG: 3.4, saltG: 0.7, kcal: 135 },
  sandwich: { fatG: 8.5, saturatesG: 2.7, sugarsG: 3.5, saltG: 1.1, kcal: 230 },
  wrap: { fatG: 8.0, saturatesG: 2.4, sugarsG: 3.0, saltG: 1.1, kcal: 220 },
  sushi: { fatG: 2.0, saturatesG: 0.4, sugarsG: 4.5, saltG: 0.9, kcal: 145 },
  'fish and chips': { fatG: 12.0, saturatesG: 1.9, sugarsG: 0.5, saltG: 0.9, kcal: 250 },
  'full english': { fatG: 15.0, saturatesG: 5.2, sugarsG: 2.4, saltG: 1.6, kcal: 240 },
  omelette: { fatG: 14.0, saturatesG: 4.5, sugarsG: 0.9, saltG: 0.8, kcal: 180 },
  'stir fry': { fatG: 5.5, saturatesG: 1.0, sugarsG: 3.2, saltG: 0.9, kcal: 120 },

  /* ---- more composite dishes, the ones that actually get photographed ---- */
  'spaghetti bolognese': { fatG: 5.2, saturatesG: 1.9, sugarsG: 2.6, saltG: 0.5, kcal: 155 },
  bolognese: { fatG: 6.4, saturatesG: 2.4, sugarsG: 3.0, saltG: 0.6, kcal: 130 },
  'shepherds pie': { fatG: 6.0, saturatesG: 2.6, sugarsG: 1.9, saltG: 0.6, kcal: 130 },
  'cottage pie': { fatG: 6.0, saturatesG: 2.6, sugarsG: 1.9, saltG: 0.6, kcal: 130 },
  'chilli con carne': { fatG: 6.5, saturatesG: 2.4, sugarsG: 3.0, saltG: 0.7, kcal: 135 },
  'tikka masala': { fatG: 9.5, saturatesG: 4.0, sugarsG: 3.6, saltG: 0.9, kcal: 160 },
  korma: { fatG: 11.0, saturatesG: 5.2, sugarsG: 4.5, saltG: 0.8, kcal: 180 },
  biryani: { fatG: 6.8, saturatesG: 2.2, sugarsG: 1.6, saltG: 0.8, kcal: 190 },
  paella: { fatG: 5.0, saturatesG: 1.2, sugarsG: 1.4, saltG: 0.9, kcal: 160 },
  risotto: { fatG: 5.5, saturatesG: 2.6, sugarsG: 1.2, saltG: 0.8, kcal: 165 },
  'macaroni cheese': { fatG: 9.0, saturatesG: 5.2, sugarsG: 2.4, saltG: 0.9, kcal: 185 },
  'jerk chicken': { fatG: 7.0, saturatesG: 2.0, sugarsG: 2.4, saltG: 1.1, kcal: 190 },
  kebab: { fatG: 12.0, saturatesG: 4.8, sugarsG: 2.2, saltG: 1.3, kcal: 215 },
  katsu: { fatG: 11.0, saturatesG: 2.4, sugarsG: 3.2, saltG: 1.0, kcal: 230 },
  fajita: { fatG: 7.5, saturatesG: 2.3, sugarsG: 3.4, saltG: 1.0, kcal: 190 },
  samosa: { fatG: 17.0, saturatesG: 5.0, sugarsG: 2.0, saltG: 1.0, kcal: 308 },
  'spring roll': { fatG: 12.0, saturatesG: 2.0, sugarsG: 3.0, saltG: 1.0, kcal: 240 },
  'meat pie': { fatG: 18.0, saturatesG: 7.5, sugarsG: 1.6, saltG: 1.1, kcal: 300 },
  falafel: { fatG: 14.0, saturatesG: 1.8, sugarsG: 1.4, saltG: 0.8, kcal: 260 },
  hummus: { fatG: 17.0, saturatesG: 2.2, sugarsG: 0.9, saltG: 1.0, kcal: 230 },
  coleslaw: { fatG: 18.0, saturatesG: 1.6, sugarsG: 5.0, saltG: 0.7, kcal: 195 },
  akara: { fatG: 14.0, saturatesG: 2.6, sugarsG: 1.0, saltG: 0.8, kcal: 235 },
  'puff puff': { fatG: 12.0, saturatesG: 2.4, sugarsG: 14.0, saltG: 0.4, kcal: 300 },

  /* ---- drinks, which are where a great deal of sugar hides ---- */
  cola: { fatG: 0, saturatesG: 0, sugarsG: 10.6, saltG: 0, kcal: 42 },
  lemonade: { fatG: 0, saturatesG: 0, sugarsG: 9.0, saltG: 0.01, kcal: 38 },
  'orange juice': { fatG: 0.1, saturatesG: 0.0, sugarsG: 8.4, saltG: 0.01, kcal: 45 },
  'energy drink': { fatG: 0, saturatesG: 0, sugarsG: 11.0, saltG: 0.1, kcal: 45 },
  smoothie: { fatG: 0.4, saturatesG: 0.1, sugarsG: 11.5, saltG: 0.02, kcal: 57 },
  'fizzy drink': { fatG: 0, saturatesG: 0, sugarsG: 10.0, saltG: 0.01, kcal: 40 },
  beer: { fatG: 0, saturatesG: 0, sugarsG: 0.3, saltG: 0.01, kcal: 43 },
  wine: { fatG: 0, saturatesG: 0, sugarsG: 0.6, saltG: 0.01, kcal: 83 },
  'milkshake': { fatG: 3.0, saturatesG: 1.9, sugarsG: 12.0, saltG: 0.15, kcal: 100 },

  /* ---- sauces, fats and snacks ---- */
  mayonnaise: { fatG: 75.0, saturatesG: 6.0, sugarsG: 1.5, saltG: 1.2, kcal: 680 },
  ketchup: { fatG: 0.2, saturatesG: 0.0, sugarsG: 22.8, saltG: 1.8, kcal: 102 },
  gravy: { fatG: 1.4, saturatesG: 0.4, sugarsG: 1.0, saltG: 1.6, kcal: 35 },
  'olive oil': { fatG: 100.0, saturatesG: 14.0, sugarsG: 0.0, saltG: 0.0, kcal: 884 },
  chocolate: { fatG: 30.0, saturatesG: 18.0, sugarsG: 52.0, saltG: 0.2, kcal: 535 },
  biscuit: { fatG: 20.0, saturatesG: 10.0, sugarsG: 28.0, saltG: 0.6, kcal: 470 },
  cake: { fatG: 18.0, saturatesG: 6.5, sugarsG: 38.0, saltG: 0.5, kcal: 400 },
  crisps: { fatG: 33.0, saturatesG: 2.8, sugarsG: 0.6, saltG: 1.3, kcal: 532 },
  'ice cream': { fatG: 11.0, saturatesG: 7.0, sugarsG: 21.0, saltG: 0.15, kcal: 207 },
};

/** The longest keys first, so "fried rice" is tested before "rice". */
const KEYS = Object.keys(COMPOSITION).sort((a, b) => b.length - a.length);

/**
 * Finds the entry a food name matches, or null.
 *
 * Word boundaries matter: "grape" must not match inside "grapefruit", and
 * "ham" must not match inside "hamburger". A name that matches nothing
 * returns null rather than the nearest thing, because the nearest thing to
 * an unknown food is not a fact about it.
 */
export function compositionFor(name: string): { key: string; composition: Composition } | null {
  const text = ` ${name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const key of KEYS) {
    if (text.includes(` ${key} `) || text.includes(`${key} `) || text.endsWith(` ${key}`)) {
      return { key, composition: COMPOSITION[key]! };
    }
  }
  return null;
}

/**
 * The composition of a plate of several things, per 100g of the plate.
 *
 * Weighted by how sure the model was about each item, because an item it
 * named at 40% should not move the figures as much as one it named at 95%.
 * Returns null when nothing on the plate is recognised — a partial guess
 * across an unrecognised meal is not worth having.
 */
export function plateComposition(
  items: { name: string; confidencePct?: number | null }[],
): { composition: Composition; matched: string[] } | null {
  const hits = items
    .map((item) => ({ item, found: compositionFor(item.name) }))
    .filter((h): h is { item: (typeof items)[number]; found: NonNullable<ReturnType<typeof compositionFor>> } =>
      h.found !== null,
    );

  if (hits.length === 0) return null;

  let totalWeight = 0;
  const sum: Composition = { fatG: 0, saturatesG: 0, sugarsG: 0, saltG: 0, kcal: 0 };
  for (const hit of hits) {
    const weight = Math.max(0.2, (hit.item.confidencePct ?? 60) / 100);
    totalWeight += weight;
    sum.fatG += hit.found.composition.fatG * weight;
    sum.saturatesG += hit.found.composition.saturatesG * weight;
    sum.sugarsG += hit.found.composition.sugarsG * weight;
    sum.saltG += hit.found.composition.saltG * weight;
    sum.kcal += hit.found.composition.kcal * weight;
  }

  const round = (value: number): number => Math.round((value / totalWeight) * 10) / 10;
  return {
    composition: {
      fatG: round(sum.fatG),
      saturatesG: round(sum.saturatesG),
      sugarsG: round(sum.sugarsG),
      saltG: round(sum.saltG),
      kcal: Math.round(sum.kcal / totalWeight),
    },
    matched: hits.map((h) => h.found.key),
  };
}
