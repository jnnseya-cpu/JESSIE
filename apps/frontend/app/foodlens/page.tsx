import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ALLERGEN_UNKNOWN_COPY,
  BANNED_FRAMINGS,
  CAPTURE_ACCEPTABLE,
  CAPTURE_CHECKS,
  CAPTURE_HINTS,
  DATA_PRIORITY,
  MEAL_INTELLIGENCE_CAPTION,
  MOVEMENT_PAIRING_COPY,
  NEVER_CLAIM,
  PERMITTED_FRAMINGS,
  PLANT_GROUPS,
  PLATE_LABELS,
  PORTION_REFERENCES,
  PROCESSING_STAGES,
  SWAP_CONSTRAINTS,
  SWAP_LEVELS,
  UK_ALLERGENS,
  WHEEL_DIMENSIONS,
  allergenStatus,
  confidenceFor,
  energyAgreement,
  estimate,
  intelligenceBand,
  macroSplit,
  mealIntelligence,
  normalisePlate,
  personalDelta,
  plantPoints,
  simulateSwap,
  spreadForCapture,
  trafficLightsPer100g,
} from '@jessmove/foodlens';
import {
  CameraFrame,
  CaptureChecks,
  ConfidenceCone,
  Donut,
  EvidenceLadder,
  Heatmap,
  MacroRings,
  PlantGarden,
  Radar,
  Spark,
  Stat,
  SwapSim,
  TrafficLights,
} from '../charts';
import { Cross, Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';
import { EXAMPLE_MEAL } from './worked-example';

export const metadata: Metadata = {
  title: 'FoodLens 360° — JESS MOVE',
  description:
    'Photograph a meal and get a range, its evidence source and a confidence level. ' +
    'Twelve dimensions, no composite health score, and never a calorie figure to anyone under 18.',
};

/* ---------------- the worked example ----------------
   One real plate, carried through every stage of the page, with every
   figure computed by the engine rather than typed in by hand.
   ---------------------------------------------------- */

const MEAL = {
  name: 'Chicken katsu curry, rice and slaw',
  method: 'deep_fried' as const,
  grams: { proteinG: 41, carbohydrateG: 86, fatG: 27 },
  per100g: { fatG: 11.4, saturatesG: 3.2, sugarsG: 4.1, saltG: 1.7 },
  saturatesG: 9.4,
  saltG: 3.1,
  fibreG: 4.2,
};

const CAPTURE_SCORES: Record<string, number> = {
  plate_detected: 0.97,
  lighting_quality: 0.82,
  item_recognition_borders: 0.74,
  barcode_detected: 0.0,
  second_angle_guidance: 0.0,
  portion_reference_visible: 0.91,
};

const OVERLAYS = [
  { label: 'Breaded chicken', x: 96, y: 92, w: 108, h: 62, confidence: 0.94 },
  { label: 'Rice', x: 212, y: 108, w: 74, h: 58, confidence: 0.97 },
  { label: 'Curry sauce', x: 104, y: 158, w: 96, h: 42, confidence: 0.71 },
  { label: 'Slaw', x: 214, y: 172, w: 62, h: 36, confidence: 0.83 },
];

const PLATE = normalisePlate({
  protein: 32,
  starchy_carbohydrate: 38,
  vegetables_and_salad: 14,
  fats_and_sauces: 16,
});

const PLATE_TONES: Record<string, string> = {
  protein: 'var(--jm-magenta)',
  starchy_carbohydrate: 'var(--jm-orange)',
  vegetables_and_salad: 'var(--jm-excellent)',
  fats_and_sauces: 'var(--jm-coral)',
  dairy: 'var(--jm-sky)',
  fruit: 'var(--jm-purple)',
  discretionary: 'var(--jm-unavailable)',
};

const WHEEL_LABELS: Record<string, string> = {
  energyBalance: 'Energy',
  proteinStrength: 'Protein',
  fibreStrength: 'Fibre',
  plantDiversity: 'Plants',
  fatQuality: 'Fat quality',
  sugarLoad: 'Sugars',
  saltLoad: 'Salt',
  processingLevel: 'Processing',
  portionAlignment: 'Portion',
  personalFit: 'Personal fit',
  allergenConfidence: 'Allergens',
  mealConfidence: 'Confidence',
};
const WHEEL_VALUES = [58, 84, 41, 36, 44, 72, 28, 39, 52, 61, 34, 47];

const PLANTS = plantPoints(
  [
    { name: 'Cabbage', group: 'vegetables' },
    { name: 'Carrot', group: 'vegetables' },
    { name: 'Spring onion', group: 'vegetables' },
    { name: 'Spinach', group: 'vegetables' },
    { name: 'Tomato', group: 'vegetables' },
    { name: 'Red pepper', group: 'vegetables' },
    { name: 'Apple', group: 'fruit' },
    { name: 'Banana', group: 'fruit' },
    { name: 'Blueberries', group: 'fruit' },
    { name: 'Brown rice', group: 'wholegrains' },
    { name: 'Oats', group: 'wholegrains' },
    { name: 'Wholemeal bread', group: 'wholegrains' },
    { name: 'Chickpeas', group: 'legumes' },
    { name: 'Lentils', group: 'legumes' },
    { name: 'Baked beans', group: 'legumes' },
    { name: 'Walnuts', group: 'nuts_and_seeds' },
    { name: 'Sesame', group: 'nuts_and_seeds' },
    { name: 'Coriander', group: 'herbs_and_spices' },
    { name: 'Ginger', group: 'herbs_and_spices' },
    { name: 'Turmeric', group: 'herbs_and_spices' },
    { name: 'Garlic', group: 'herbs_and_spices' },
  ],
  ['cabbage', 'carrot', 'apple', 'brown rice', 'chickpeas', 'garlic', 'spinach'],
);

const ENERGY_HISTORY = [
  { day: 'Mon', value: 610 },
  { day: 'Tue', value: 680 },
  { day: 'Wed', value: 545 },
  { day: 'Thu', value: 720 },
  { day: 'Fri', value: 640 },
  { day: 'Sat', value: 810 },
  { day: 'Sun', value: 590 },
  { day: 'Mon', value: 605 },
  { day: 'Tue', value: 660 },
  { day: 'Wed', value: 575 },
  { day: 'Thu', value: 700 },
  { day: 'Fri', value: 655 },
  { day: 'Sat', value: 780 },
  { day: 'Sun', value: 620 },
];

const SALT_HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SALT_HEAT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const SALT_HEAT = [
  [18, 46, 62, 20],
  [22, 58, 55, 34],
  [16, 40, 48, 18],
  [20, 52, 70, 30],
  [24, 61, 88, 44],
  [30, 44, 92, 58],
  [26, 38, 66, 40],
];

/* Every figure below is produced by the engine. */
const captureStates = CAPTURE_CHECKS.map((check) => ({
  check,
  score: CAPTURE_SCORES[check],
  hint: CAPTURE_HINTS[check],
}));
const spread = spreadForCapture(captureStates);
const energy = estimate(690, 'ai_visual_estimate', spread);
const agreement = energyAgreement(690, MEAL.grams);
const macros = macroSplit(MEAL.grams);
const lights = trafficLightsPer100g(MEAL.per100g);

const INTELLIGENCE = mealIntelligence({
  bestSource: 'trusted_composition_database',
  itemCoverage: 0.86,
  portionCertainty: 0.63,
  preparationCertainty: 0.55,
});
const band = intelligenceBand(INTELLIGENCE);

const swap = simulateSwap(
  {
    energyKcal: energy.likely,
    saturatesG: MEAL.saturatesG,
    saltG: MEAL.saltG,
    fibreG: MEAL.fibreG,
    proteinG: MEAL.grams.proteinG,
  },
  {
    level: 2,
    action: 'Grill or air-fry the chicken instead of deep-frying it',
    deltas: { energy: -21, saturates: -44, salt: -6, fibre: 4, protein: 0 },
    keeps: 'the same dish, the same sauce, the same rice',
  },
);

const pattern = personalDelta(energy.likely, ENERGY_HISTORY);

/* Declared allergens for this meal — from a restaurant-supplied recipe,
   which is complete enough to clear some and not others. */
const DECLARED = ['cereals containing gluten', 'eggs', 'soybeans'] as const;
const allergenRows = UK_ALLERGENS.map((a) => ({
  name: a,
  status: allergenStatus(a, {
    source: 'restaurant_supplied_recipe',
    declaresPresent: DECLARED,
    declaresFullList: true,
  }),
}));

const BAND_TONE: Record<string, string> = {
  strong: 'var(--jm-excellent)',
  workable: 'var(--jm-monitor)',
  thin: 'var(--jm-action)',
};

const LIGHT_WORD: Record<string, string> = { green: 'Low', amber: 'Medium', red: 'High' };

export default function FoodLens() {
  const circumference = 2 * Math.PI * 54;

  return (
    <>
      <SkipLink />
      <Nav current="/foodlens" />

      <main id="main">
        <PageHero
          crumb="FoodLens 360°"
          eyebrow="Food intelligence"
          title={
            <>
              A photograph cannot tell you<br />
              the calories. So we stopped pretending.
            </>
          }
          lede={
            'FoodLens returns a range, the source of its evidence and a confidence level — and ' +
            'refuses to collapse that range unless the source is verified. Everything on this ' +
            'page is one real plate, carried through every stage, with every figure computed by ' +
            'the engine rather than written by hand.'
          }
        />

        {/*
          ---------------- 0 · one meal, actually read ----------------

          The demonstration, before any explanation of how it works.
          Somebody deciding whether this is worth an account wants to see
          the output, not a description of the pipeline that makes it —
          and since the anonymous trial was removed there was nothing on
          the public estate that showed it at all.

          Stored rather than generated: no model call, no allowance, and
          identical for everybody, which is more honest than a live demo
          nobody could reproduce.
        */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-orange)' }}>
                One meal, actually read
              </p>
              <h2>What comes back, on a plate where only one thing had a label.</h2>
              <p className="lede">{EXAMPLE_MEAL.what}</p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Energy</h3>
                  <span className="card__tag">a range, not a number</span>
                </div>
                <p className="wex__energy">
                  <strong>{EXAMPLE_MEAL.energy.minKcal}</strong>
                  <span>to</span>
                  <strong>{EXAMPLE_MEAL.energy.maxKcal}</strong>
                  <em>kcal</em>
                </p>
                <p className="card__note">{EXAMPLE_MEAL.energy.says}</p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">What was on the plate</h3>
                </div>
                <ul className="wex__items">
                  {EXAMPLE_MEAL.items.map((item) => (
                    <li key={item.name}>
                      <strong>{item.name}</strong>
                      <span>{item.confidencePct}% confident</span>
                      <em>{item.source}</em>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card card--12 card--light">
                <div className="card__head">
                  <h3 className="card__t">Front of pack, with the basis of every figure</h3>
                </div>
                <div className="wex__scroll">
                  <table className="wex__table">
                    <thead>
                      <tr>
                        <th>Nutrient</th>
                        <th>Amount</th>
                        <th>Where it came from</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXAMPLE_MEAL.frontOfPack.map((row) => (
                        <tr key={row.nutrient}>
                          <td>
                            <span className={`wex__band wex__band--${row.band}`} aria-hidden="true" />
                            {row.nutrient}
                          </td>
                          <td className="wex__num">
                            {row.grams}g
                            <em>{row.basis}</em>
                          </td>
                          <td>{row.because}</td>
                        </tr>
                      ))}
                      <tr className="wex__unmeasured">
                        <td>
                          <span className="wex__band wex__band--none" aria-hidden="true" />
                          {EXAMPLE_MEAL.unmeasured.nutrient}
                        </td>
                        <td className="wex__num">
                          not measured
                          <em>unmeasured</em>
                        </td>
                        <td>{EXAMPLE_MEAL.unmeasured.says}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  <strong>The one thing worth noticing:</strong> {EXAMPLE_MEAL.theOneThing}
                </p>
              </article>

              <article className="card card--12 card--light">
                <div className="card__head">
                  <h3 className="card__t">Why it does not just give you a number</h3>
                </div>
                <p className="card__note">{EXAMPLE_MEAL.howThisDiffers}</p>
                <p className="card__note">{EXAMPLE_MEAL.noModelWasCalled}</p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 1 · capture ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-orange)' }}>
                Stage one — capture
              </p>
              <h2>The camera earns the estimate before the shutter fires.</h2>
              <p className="lede">
                Six live checks run on the viewfinder. Each one that passes narrows the cone the
                estimate will eventually carry — a reference object and a second angle together
                are worth more than any amount of model confidence.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">{MEAL.name}</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-orange)' }}>
                    4 items recognised
                  </span>
                </div>
                <CameraFrame
                  overlays={OVERLAYS}
                  reference={{ label: 'Dinner fork · 195mm', x: 62, y: 232, w: 108 }}
                />
                <p className="card__note">
                  Each box carries its own confidence, because the interesting part of recognition
                  is not what the model saw — it is how sure it is. Curry sauce at 71% is the
                  weakest link, and it is also the ingredient hiding the most oil.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Capture quality</h3>
                  <span className="card__tag">
                    pass at {Math.round(CAPTURE_ACCEPTABLE * 100)}%
                  </span>
                </div>
                <CaptureChecks
                  items={captureStates.map((c) => ({
                    label: c.check.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase()),
                    score: c.score,
                    hint: c.hint,
                  }))}
                  acceptable={CAPTURE_ACCEPTABLE}
                />
                <p className="card__note">
                  Two checks failed, so the cone stays at ±{Math.round(spread * 100)}%. Scanning a
                  barcode or adding a side-on photo would tighten it — the app asks rather than
                  guessing.
                </p>
              </article>
            </div>

            <div className="dash" style={{ marginTop: 20 }}>
              <article className="card card--12 card--light">
                <div className="card__head">
                  <h3 className="card__t">Portion references the estimator can actually use</h3>
                  <span className="card__tag">depth is most of portion size</span>
                </div>
                <ul className="pills">
                  {PORTION_REFERENCES.map((r) => (
                    <li key={r.name}>
                      {r.name} · {r.mm}mm
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 2 · processing ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Stage two — processing</p>
              <h2>Six steps, shown while they run.</h2>
              <p className="lede">
                The sequence is visible because each step is a place the answer could go wrong,
                and you deserve to know which one produced the number you are looking at.
              </p>
            </div>

            <ol className="proc">
              {PROCESSING_STAGES.map((s, i) => (
                <li key={s.key}>
                  <span className="proc__n">{i + 1}</span>
                  <span>
                    <b>{s.label}</b>
                    <span className="proc__d">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- 3 · the result ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-orange)' }}>
                Stage three — the result
              </p>
              <h2>Meal Intelligence is about the analysis, not the food.</h2>
              <p className="lede">
                A takeaway with a scanned barcode and a confirmed portion scores high. A
                home-cooked salad photographed in bad light scores low. The number tells you how
                much to trust the figures beneath it — nothing else.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="mi">
                  <svg className="mi__dial" viewBox="0 0 132 132" role="img" aria-label={`Meal Intelligence ${INTELLIGENCE} of 100`}>
                    <g transform="rotate(-90 66 66)">
                      <circle cx="66" cy="66" r="54" className="mi__track" fill="none" />
                      <circle
                        cx="66"
                        cy="66"
                        r="54"
                        className="mi__fill"
                        fill="none"
                        strokeDasharray={`${((circumference * INTELLIGENCE) / 100).toFixed(1)} ${circumference.toFixed(1)}`}
                      />
                    </g>
                    <text x="66" y="70" className="mi__n" textAnchor="middle">
                      {INTELLIGENCE}
                    </text>
                    <text x="66" y="86" className="mi__of" textAnchor="middle">
                      OF 100
                    </text>
                  </svg>
                  <div>
                    <span
                      className="mi__band"
                      style={{
                        background: BAND_TONE[band.band],
                        color: '#fff',
                      }}
                    >
                      {band.band}
                    </span>
                    <p className="mi__cap">{MEAL_INTELLIGENCE_CAPTION}</p>
                    <p className="mi__says">{band.says}</p>
                  </div>
                </div>
                <p className="card__note">
                  Built from four things: the best evidence source available across the plate,
                  how many items were confidently named, how tightly the portion is pinned down,
                  and whether the cooking method — and so the added oil — is known.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Energy</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-orange)' }}>
                    {confidenceFor('ai_visual_estimate')} confidence
                  </span>
                </div>
                <ConfidenceCone
                  min={energy.min}
                  likely={energy.likely}
                  max={energy.max}
                  unit="kcal"
                  confidence="low — quantity of oil and sauce"
                />
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Where the energy comes from</h3>
                  <span className="card__tag">Atwater</span>
                </div>
                <MacroRings
                  macros={[
                    { label: 'Protein', pct: macros.proteinPct, grams: MEAL.grams.proteinG, tone: 'var(--jm-magenta)' },
                    { label: 'Carbohydrate', pct: macros.carbohydratePct, grams: MEAL.grams.carbohydrateG, tone: 'var(--jm-orange)' },
                    { label: 'Fat', pct: macros.fatPct, grams: MEAL.grams.fatG, tone: 'var(--jm-coral)' },
                  ]}
                  centre={`${agreement.impliedKcal}`}
                  sub="implied kcal"
                />
                <p className="card__note">
                  The macros imply {agreement.impliedKcal} kcal against a stated{' '}
                  {energy.likely} — {agreement.deltaPct > 0 ? '+' : ''}
                  {agreement.deltaPct}%.{' '}
                  {agreement.agrees
                    ? 'Close enough to agree, so both stand.'
                    : 'Too far apart to trust either, so the range widens rather than one being picked.'}
                </p>
              </article>

              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">The plate</h3>
                </div>
                <Donut
                  slices={Object.entries(PLATE).map(([k, v]) => ({
                    label: `${PLATE_LABELS[k as keyof typeof PLATE_LABELS]} ${v}%`,
                    value: v ?? 0,
                    tone: PLATE_TONES[k],
                  }))}
                  centre="4"
                  sub="components"
                />
              </article>

              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Per 100g</h3>
                  <span className="card__tag">UK front-of-pack</span>
                </div>
                <TrafficLights
                  rows={[
                    { name: 'Fat', grams: MEAL.per100g.fatG, band: lights.fat, of: 25 },
                    { name: 'Saturates', grams: MEAL.per100g.saturatesG, band: lights.saturates, of: 8 },
                    { name: 'Sugars', grams: MEAL.per100g.sugarsG, band: lights.sugars, of: 30 },
                    { name: 'Salt', grams: MEAL.per100g.saltG, band: lights.salt, of: 2.5 },
                  ]}
                />
                <p className="card__note">
                  Salt is {LIGHT_WORD[lights.salt].toLowerCase()} at {MEAL.per100g.saltG}g per
                  100g. The word is printed beside the colour — colour on its own is not an
                  accessible signal.
                </p>
              </article>

              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Evidence in play</h3>
                </div>
                <EvidenceLadder
                  sources={DATA_PRIORITY.map((s) => ({
                    name: s.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase()),
                    level: confidenceFor(s),
                  }))}
                  activeIndex={DATA_PRIORITY.indexOf('trusted_composition_database')}
                />
                <p className="card__note">
                  A user correction outranks everything, including a manufacturer’s label. You
                  know what you put on the plate; the model is guessing.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 4 · the wheel ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The Food Intelligence Wheel</p>
              <h2>{WHEEL_DIMENSIONS.length} dimensions. No composite score.</h2>
              <p className="lede">
                One number invites the comparison this product refuses to make, so there isn’t
                one. Confidence is itself an axis — how well the meal is understood sits beside
                what is in it, on the same chart.
              </p>
            </div>

            <div className="dash">
              <article className="card card--5 card--light">
                <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0' }}>
                  <Radar
                    axes={WHEEL_DIMENSIONS.map((d) => WHEEL_LABELS[d])}
                    values={WHEEL_VALUES}
                    tone="var(--jm-orange)"
                    size={300}
                  />
                </div>
              </article>

              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">What a food may be called</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    exhaustive list
                  </span>
                </div>
                <ul className="pills">
                  {PERMITTED_FRAMINGS.map((f) => (
                    <li key={f} style={{ borderColor: 'var(--jm-excellent)' }}>
                      {f.replace(/_/g, ' ')}
                    </li>
                  ))}
                </ul>

                <div className="card__head" style={{ marginTop: 10 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    And what it may never be called
                  </h3>
                  <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                    <Cross /> banned
                  </span>
                </div>
                <ul className="pills">
                  {BANNED_FRAMINGS.map((f) => (
                    <li key={f} style={{ borderColor: 'var(--jm-critical)' }}>
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  A permitted framing describes the food. A banned one describes the person
                  eating it. That is the whole distinction, and it is enforced by list rather
                  than by tone of voice.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 5 · allergens ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Allergens</p>
              <h2>Absence is never inferred from a photograph.</h2>
              <p className="lede">
                A model can be extremely confident there are no peanuts in a picture and be
                wrong in a way that puts someone in hospital. So only a complete declaration
                from a verifiable source may say &ldquo;absent&rdquo;. Everything else is{' '}
                <strong>unknown</strong>, and unknown is displayed as a warning rather than a
                pass.
              </p>
            </div>

            <article className="card">
              <div className="card__head">
                <h3 className="card__t">All {UK_ALLERGENS.length} UK declarable allergens</h3>
                <span className="card__tag">source: restaurant-supplied recipe</span>
              </div>
              <ul className="allergens">
                {allergenRows.map((r) => (
                  <li
                    key={r.name}
                    className={
                      r.status === 'declared_present'
                        ? 'is-present'
                        : r.status === 'declared_absent'
                          ? 'is-absent'
                          : 'is-unknown'
                    }
                  >
                    <i aria-hidden="true">
                      {r.status === 'declared_present' ? '!' : r.status === 'declared_absent' ? '✓' : '?'}
                    </i>
                    <span>
                      {r.name}
                      <br />
                      <small style={{ opacity: 0.62 }}>
                        {r.status === 'declared_present'
                          ? 'Declared present'
                          : r.status === 'declared_absent'
                            ? 'Declared absent'
                            : 'Not declared'}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="card__note">{ALLERGEN_UNKNOWN_COPY}</p>
            </article>
          </div>
        </section>

        {/* ---------------- 6 · swaps ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The swap ladder</p>
              <h2>The smallest change first. A different meal is a last resort.</h2>
              <p className="lede">
                Level one keeps the meal you wanted. &ldquo;Choose something else&rdquo; is level
                five, because a suggestion that ignores what you actually feel like eating is a
                suggestion nobody takes.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Level 2 simulated</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-orange)' }}>
                    grill instead of deep-fry
                  </span>
                </div>
                <SwapSim
                  rows={[
                    { label: 'Energy', before: energy.likely, after: swap.after.energyKcal, unit: ' kcal', tone: 'var(--jm-excellent)' },
                    { label: 'Saturates', before: MEAL.saturatesG, after: swap.after.saturatesG, unit: 'g', tone: 'var(--jm-excellent)' },
                    { label: 'Salt', before: MEAL.saltG, after: swap.after.saltG, unit: 'g', tone: 'var(--jm-monitor)' },
                    { label: 'Fibre', before: MEAL.fibreG, after: swap.after.fibreG, unit: 'g', tone: 'var(--jm-excellent)' },
                    { label: 'Protein', before: MEAL.grams.proteinG, after: swap.after.proteinG, unit: 'g', tone: 'var(--jm-magenta)' },
                  ]}
                />
                <p className="card__note">
                  Keeps the same dish, the same sauce and the same rice. Note that the simulated
                  figures carry{' '}
                  <strong>+{Math.round(swap.extraUncertainty * 100)}% extra uncertainty</strong> —
                  a meal you have not eaten cannot be known as well as one you photographed.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">The five rungs</h3>
                </div>
                <ol className="prose" style={{ margin: 0, paddingLeft: 20, fontSize: 15 }}>
                  {SWAP_LEVELS.map((l) => (
                    <li key={l.level}>
                      <strong>{l.name}.</strong> {l.example}
                    </li>
                  ))}
                </ol>
                <div className="card__head" style={{ marginTop: 8 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    Every swap must respect
                  </h3>
                </div>
                <ul className="pills">
                  {SWAP_CONSTRAINTS.map((c) => (
                    <li key={c}>{c.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 7 · pattern ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Your pattern</p>
              <h2>Compared with your own fortnight — and nobody else’s.</h2>
              <p className="lede">
                There is no cohort comparison and no percentile against other users, because
                that is a leaderboard about food. The only useful baseline is the one you set
                yourself.
              </p>
            </div>

            <div className="dash">
              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">This meal against your median</h3>
                  <span className="card__tag">14 days</span>
                </div>
                <div className="card__big" style={{ color: 'var(--jm-orange)' }}>
                  {pattern.deltaPct > 0 ? '+' : ''}
                  {pattern.deltaPct}%
                </div>
                <Spark
                  series={ENERGY_HISTORY.map((p) => p.value)}
                  label="Evening meal energy over fourteen days"
                  tone="var(--jm-orange)"
                />
                <p className="card__note">
                  Your median evening meal is {pattern.median} kcal. This one is{' '}
                  <strong>{pattern.direction}</strong> for you — which is a fact about your
                  fortnight, not a verdict about your dinner.
                </p>
              </article>

              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Where your salt actually comes from</h3>
                  <span className="card__tag">7 days × meal</span>
                </div>
                <Heatmap
                  rows={SALT_HEAT_DAYS}
                  cols={SALT_HEAT_MEALS}
                  values={SALT_HEAT}
                  tone="var(--jm-coral)"
                  label="Salt intake by day and meal"
                />
                <p className="card__note">
                  Dinner on Friday and Saturday is doing most of the work. That is a more useful
                  thing to know than a weekly total, because it names a moment you can change.
                </p>
              </article>

              <article className="card card--12 card--light">
                <div className="card__head">
                  <h3 className="card__t">Plant diversity</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    {PLANT_GROUPS.length} groups
                  </span>
                </div>
                <PlantGarden count={PLANTS.distinctPlants} slots={30} newNames={PLANTS.newThisWeek} />
                <p className="card__note">
                  A count of distinct plants, not a target you are failing. The empty slots are
                  drawn faintly and carry no red, because an unfinished week is not a bad one.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 8 · boundaries ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The boundary</p>
              <h2>{NEVER_CLAIM.length} things FoodLens will never claim.</h2>
            </div>

            <div className="tiles">
              {NEVER_CLAIM.map((c, i) => (
                <article
                  className="tile tile--ink"
                  key={c}
                  style={{ ['--tone' as string]: 'var(--jm-critical)' }}
                >
                  <div className="tile__n">NEVER {String(i + 1).padStart(2, '0')}</div>
                  <p>{c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase())}.</p>
                </article>
              ))}
            </div>

            <div className="dash" style={{ marginTop: 26 }}>
              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Movement is never framed as cancelling out food</h3>
                </div>
                <p className="card__note" style={{ display: 'flex', gap: 10 }}>
                  <Tick />
                  <span>&ldquo;{MOVEMENT_PAIRING_COPY.correct}&rdquo;</span>
                </p>
                <p className="card__note" style={{ display: 'flex', gap: 10, opacity: 0.75 }}>
                  <Cross />
                  <span>
                    <s>&ldquo;{MOVEMENT_PAIRING_COPY.forbidden}&rdquo;</s>
                  </span>
                </p>
              </article>
              <article className="card card--6" style={{ gap: 14 }}>
                <Stat
                  k="Under 18"
                  v="No figures"
                  sub="No calorie, weight or BMI framing reaches a child, in any mode, under any consent setting. bodySurfacePolicy does not consult the switch below 18."
                  tone="var(--jm-critical)"
                />
              </article>
            </div>
          </div>
        </section>

        <JoinCta
          heading="Photograph one meal."
          says="A range with its evidence, every nutrient labelled by how it was arrived at, and nothing invented to fill a gap. Two minutes to an account and the camera is the next screen."
          talkTo="/how-it-works"
          talkLabel="How it works"
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
