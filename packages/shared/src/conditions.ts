/**
 * Living with something, and what everything else here then means.
 *
 * A person with exocrine pancreatic insufficiency looking at "your fat is
 * high" is being told the opposite of what their clinical team told them.
 * A person with chronic kidney disease being pushed towards more protein
 * is being harmed. A person with coeliac disease needs one thing from a
 * ledger that no general reading of it will ever surface. So a condition
 * is not a label on a profile — it changes what the numbers mean, and
 * until it is here the numbers are being read wrong.
 *
 * THE RULES THIS FILE WORKS TO, none of which are negotiable.
 *
 *  1. **This is not medical advice and never becomes it.** Everything
 *     below is published dietary and lifestyle guidance for a condition
 *     somebody has told us they have. It does not diagnose, it does not
 *     treat, and it never contradicts the person who does.
 *  2. **Medication is never touched.** Not a dose, not a timing, not a
 *     "you might need more". Enzyme replacement, insulin, statins,
 *     diuretics — all of it is prescribed, and all of it stays with the
 *     prescriber.
 *  3. **Where the guidance has changed, the current guidance is used.**
 *     The clearest example is fat in pancreatic insufficiency: the old
 *     low-fat advice is out of date and causes weight loss and vitamin
 *     deficiency. Repeating it because it is what most people remember
 *     would be actively harmful.
 *  4. **A condition can silence a feature.** Where weight loss is a
 *     warning sign rather than a goal, the reduction plan does not run.
 *     A platform that keeps cheering a falling weight at somebody whose
 *     falling weight is the symptom is dangerous.
 *  5. **Nothing here is shown to anyone under 18**, and nothing here ever
 *     reaches a household or an organisation, at any group size.
 *  6. **Every card ends with the clinician.** For several of these the
 *     most useful thing this platform can say is "take this to the team
 *     that knows your case".
 */

export type ConditionId =
  | 'pancreatic_insufficiency'
  | 'coeliac'
  | 'type_2_diabetes'
  | 'type_1_diabetes'
  | 'hypertension'
  | 'high_cholesterol'
  | 'chronic_kidney_disease'
  | 'ibs'
  | 'gout'
  | 'lactose_intolerance'
  | 'iron_deficiency_anaemia'
  | 'reflux'
  | 'diverticular_disease'
  | 'osteoporosis'
  | 'heart_failure'
  | 'ibd'
  | 'nafld'
  | 'pregnancy'
  | 'appetite_suppressing_medication';

/** What a condition changes about how the rest of the platform behaves. */
export interface ConditionEffects {
  /**
   * Weight loss is a symptom to report, not a goal to pursue. The
   * reduction plan does not run, and a falling weight is flagged.
   */
  readonly weightLossIsAWarning?: boolean;
  /** A deliberate energy deficit needs a clinician's agreement first. */
  readonly deficitNeedsClinician?: boolean;
  /** Fat in the ledger must not be read as something to minimise. */
  readonly doNotFlagFat?: boolean;
  /** Salt matters more than the general guideline suggests. */
  readonly saltMattersMore?: boolean;
  /** Potassium-based salt substitutes are dangerous here. */
  readonly noSaltSubstitute?: boolean;
  /** Protein is not something to push without a dietitian. */
  readonly doNotPushProtein?: boolean;

  /* --- added for appetite-suppressing medication --- */

  /**
   * Protein sufficiency is the thing at risk, because appetite is low
   * rather than because the person is choosing badly.
   *
   * Note the deliberate collision with `doNotPushProtein`. Somebody on
   * appetite-suppressing medication who also has reduced kidney function
   * has two true instructions that point opposite ways, and the platform
   * is not the right place to resolve that — so the suppression wins and
   * the card says why. A rule that cannot conflict is a rule that has not
   * met a real patient.
   */
  readonly proteinMattersMore?: boolean;
  /**
   * Weight coming down fast risks taking muscle with it. Not a reason to
   * stop; a reason to keep resistance work in and to say so.
   */
  readonly muscleLossRisk?: boolean;
  /** Fluid is easy to forget when nothing is appealing. */
  readonly hydrationMattersMore?: boolean;
  /** Small and frequent beats three meals, when three are impossible. */
  readonly smallFrequentMeals?: boolean;
  /**
   * Declared medication, not a diagnosis.
   *
   * A card carrying this is never shown to anyone under 18 under any
   * circumstances, is never counted in a household or organisation view,
   * and always states that the prescription and the dose belong to the
   * prescriber.
   */
  readonly prescribedElsewhere?: boolean;
}

export interface ConditionCard {
  readonly id: ConditionId;
  readonly label: string;
  /** Grouped so a long list stays findable. */
  readonly group: 'digestive' | 'metabolic' | 'heart' | 'kidney' | 'bones' | 'medication' | 'other';
  /** Plain English, for somebody who has just been told they have it. */
  readonly inShort: string;
  /** What this platform will watch for in what they scan and record. */
  readonly watches: readonly string[];
  /** What published guidance says generally helps. */
  readonly helps: readonly string[];
  /** What to be careful with. Never a prohibition unless it truly is one. */
  readonly careful: readonly string[];
  /** The parts that belong to a clinician and are not ours to touch. */
  readonly clinicianOnly: readonly string[];
  readonly effects: ConditionEffects;
}

export const CONDITIONS: Readonly<Record<ConditionId, ConditionCard>> = {
  pancreatic_insufficiency: {
    id: 'pancreatic_insufficiency',
    label: 'Exocrine pancreatic insufficiency',
    group: 'digestive',
    inShort:
      'The pancreas is not releasing enough digestive enzymes, so fat, protein and the vitamins that travel with fat are not fully absorbed. The food goes in; a lot of it does not get taken up.',
    watches: [
      'Energy that looks low for you — with EPI the risk is taking in too little, not too much.',
      'Weight going down without you trying, which is a sign to report rather than a result to be pleased about.',
      'Very long gaps between meals, when smaller and more frequent usually sits better.',
    ],
    helps: [
      'Eating normally, including fat. Current guidance is not to restrict it — enzyme replacement is what makes fat digestible, and cutting fat out instead is what causes the weight loss and the vitamin problems.',
      'Smaller meals more often, rather than two large ones.',
      'Taking enzymes with everything that has fat or protein in it, including snacks, exactly as they were prescribed.',
      'Keeping an eye on weight over weeks rather than days, and telling your team if it is drifting down.',
    ],
    careful: [
      'Alcohol, which makes pancreatic problems worse and is usually advised against entirely where pancreatitis is involved.',
      'Very high-fibre meals during a flare, which some people find harder to manage.',
      'Any advice — including older leaflets and most of the internet — telling you to eat a low-fat diet. That guidance has changed.',
    ],
    clinicianOnly: [
      'How much enzyme replacement to take, and when. That is a prescription and this platform will never suggest a change to it.',
      'Vitamin A, D, E and K levels, and whether supplements are needed. Those are blood tests and prescriptions.',
      'Pale, oily or floating stools, or pain after eating — tell your team, that is how they know the dose is not right.',
    ],
    effects: { weightLossIsAWarning: true, deficitNeedsClinician: true, doNotFlagFat: true },
  },

  coeliac: {
    id: 'coeliac',
    label: 'Coeliac disease',
    group: 'digestive',
    inShort:
      'An immune reaction to gluten that damages the lining of the small intestine. The treatment is a strictly gluten-free diet, for life — there is no amount that is fine.',
    watches: [
      'Anything you scan whose label declares cereals containing gluten.',
      'Products that are easy to miss — sauces, stock, processed meat, some crisps and many "may contain" lines.',
    ],
    helps: [
      'Scanning the packet rather than trusting the front. This platform reads the declared allergens off the label, and gluten is one of the fourteen it always reports.',
      'Certified gluten-free staples, so the everyday things are not a decision each time.',
      'Iron, calcium, and B12 tend to be worth watching, because absorption takes time to recover.',
    ],
    careful: [
      'Cross-contamination — shared toasters, shared frying oil, a knife in the butter. It is the usual reason someone doing everything right still feels unwell.',
      'Oats, which are naturally gluten-free but very often contaminated. Certified gluten-free oats are the ones to look for.',
    ],
    clinicianOnly: [
      'Diagnosis itself — do not start a gluten-free diet before testing, because it makes the tests unreliable.',
      'Follow-up bloods and bone density, and whether family members should be tested.',
    ],
    effects: {},
  },

  type_2_diabetes: {
    id: 'type_2_diabetes',
    label: 'Type 2 diabetes',
    group: 'metabolic',
    inShort:
      'Blood glucose runs higher than it should because the body has become less responsive to insulin, or is not making enough of it.',
    watches: [
      'Free sugars across the week, and where they are coming from — drinks are usually the largest single line.',
      'Days without movement, because muscle takes up glucose independently of insulin.',
      'Weight, where even five percent lost slowly makes a measurable difference to control.',
    ],
    helps: [
      'Cutting sugary drinks first. It is the change with the biggest effect for the least effort in almost every case.',
      'Movement on most days, including something after meals — a short walk after eating blunts the rise.',
      'Fibre, wholegrains and pulses in place of refined starch.',
      'Losing five to ten percent of body weight slowly, if there is weight to lose.',
    ],
    careful: [
      'Fruit juice and smoothies, which behave much more like a sugary drink than like fruit.',
      'Very low-calorie approaches, which can work but are a clinical programme, not something to improvise.',
    ],
    clinicianOnly: [
      'Medication of any kind, and especially insulin or gliclazide, where eating less without adjusting the dose can cause a hypo.',
      'Target HbA1c, and what your own numbers mean.',
      'Feet, eyes and kidney checks — the reviews that catch problems before they are felt.',
    ],
    effects: { deficitNeedsClinician: true },
  },

  type_1_diabetes: {
    id: 'type_1_diabetes',
    label: 'Type 1 diabetes',
    group: 'metabolic',
    inShort:
      'The pancreas no longer makes insulin, so it has to be replaced. Food, activity and insulin all move blood glucose, and they have to be balanced deliberately.',
    watches: [
      'The carbohydrate in what you scan, which is the number that matters most for dosing.',
      'Days of unusual activity, which change insulin needs in both directions.',
    ],
    helps: [
      'Carbohydrate counting, which the labels this platform reads make easier.',
      'Knowing that exercise can lower glucose for many hours afterwards, not just during.',
    ],
    careful: [
      'Deliberate weight loss, which changes insulin requirements and needs to be planned with your team.',
      'Alcohol, which can cause delayed lows overnight.',
    ],
    clinicianOnly: [
      'Every insulin decision — ratios, corrections, basal rates. This platform will not go near them.',
      'Hypo treatment and sick-day rules.',
    ],
    effects: { deficitNeedsClinician: true },
  },

  hypertension: {
    id: 'hypertension',
    label: 'High blood pressure',
    group: 'heart',
    inShort:
      'Blood pressure that stays above the healthy range. It usually causes no symptoms at all, which is why it is measured rather than felt.',
    watches: [
      'Salt across the week, against the 6g guideline — and where it is actually coming from, which is rarely the salt cellar.',
      'Days without movement.',
      'Weight, where a few kilograms makes a measurable difference.',
    ],
    helps: [
      'Less salt, and the biggest wins are bread, sauces, processed meat and takeaways rather than cooking salt.',
      'More potassium from vegetables, fruit and pulses — the food kind, not the supplement kind.',
      'Regular movement, and less alcohol.',
    ],
    careful: [
      'Salt substitutes, which are usually potassium chloride. Fine for many people, not for everybody, and worth checking first.',
      'Liquorice, and some decongestants, which raise blood pressure.',
    ],
    clinicianOnly: [
      'Medication, and never stopping it because the numbers look better.',
      'What your own target is, which depends on age and on what else is going on.',
    ],
    effects: { saltMattersMore: true },
  },

  high_cholesterol: {
    id: 'high_cholesterol',
    label: 'High cholesterol',
    group: 'heart',
    inShort:
      'More cholesterol circulating than the arteries can tolerate over time. Like blood pressure, it is measured rather than felt.',
    watches: [
      'Saturated fat across the week, and which items carry most of it.',
      'Fibre, which is one of the few dietary things that actively lowers cholesterol.',
    ],
    helps: [
      'Swapping saturated fat for unsaturated — oils, nuts, oily fish — rather than simply eating less fat.',
      'Soluble fibre: oats, beans, lentils, apples.',
      'Movement, which lifts the protective fraction.',
    ],
    careful: [
      'Assuming a food is fine because it is low in cholesterol. It is the saturated fat that matters far more than the cholesterol in the food.',
    ],
    clinicianOnly: [
      'Statins and other medication, and whether your overall cardiovascular risk warrants them.',
      'Familial hypercholesterolaemia, which is inherited and is not a diet problem.',
    ],
    effects: {},
  },

  chronic_kidney_disease: {
    id: 'chronic_kidney_disease',
    label: 'Chronic kidney disease',
    group: 'kidney',
    inShort:
      'Kidneys that filter less well than they should. What that means for food depends heavily on the stage, and on blood results this platform cannot see.',
    watches: [
      'Salt, which matters more here than for most people.',
      'Anything sold as a low-sodium salt substitute.',
    ],
    helps: [
      'Less salt, which helps blood pressure and fluid both.',
      'Keeping to the plan your renal dietitian gave you, which is specific to your bloods.',
    ],
    careful: [
      'Potassium-based salt substitutes, which can be genuinely dangerous with reduced kidney function.',
      'High-protein diets and protein supplements, which are not automatically good here.',
      'Over-the-counter anti-inflammatories such as ibuprofen.',
    ],
    clinicianOnly: [
      'Potassium, phosphate, protein and fluid targets. These come from your bloods and belong to a renal dietitian — this platform will not guess at them.',
      'Any supplement, including ordinary vitamins.',
    ],
    effects: { noSaltSubstitute: true, doNotPushProtein: true, saltMattersMore: true },
  },

  ibs: {
    id: 'ibs',
    label: 'Irritable bowel syndrome',
    group: 'digestive',
    inShort:
      'A gut that is sensitive and unpredictable without being damaged. Triggers differ enormously between people, which is why a food record is more useful here than any general rule.',
    watches: [
      'Patterns across what you record, since your triggers are yours and a fortnight of scanning shows them better than a leaflet.',
    ],
    helps: [
      'Regular meals rather than long gaps, and eating slowly.',
      'Limiting caffeine, alcohol and fizzy drinks, which is where many people find the quickest change.',
      'Soluble fibre such as oats — insoluble bran often makes it worse.',
    ],
    careful: [
      'The low-FODMAP diet, which works well but is restrictive and is meant to be done with a dietitian and then reintroduced, not stayed on.',
    ],
    clinicianOnly: [
      'Anything new or changed — bleeding, weight loss, a change in habit after 50 — which needs looking at rather than managing.',
    ],
    effects: {},
  },

  gout: {
    id: 'gout',
    label: 'Gout',
    group: 'metabolic',
    inShort:
      'Uric acid crystallising in a joint. Diet contributes, but it is a smaller part of the picture than most people are led to believe.',
    watches: ['Alcohol, especially beer.', 'Sugary drinks, which raise uric acid through fructose.'],
    helps: [
      'Staying well hydrated.',
      'Less beer and spirits; less fructose from drinks.',
      'Losing weight slowly if there is weight to lose — crash dieting triggers attacks.',
    ],
    careful: [
      'Rapid weight loss and fasting, both of which can bring on an attack.',
      'Cutting out all purine-containing food, which is a large sacrifice for a small effect.',
    ],
    clinicianOnly: [
      'Urate-lowering medication, which does far more than diet for anybody with repeated attacks.',
    ],
    effects: { deficitNeedsClinician: true },
  },

  lactose_intolerance: {
    id: 'lactose_intolerance',
    label: 'Lactose intolerance',
    group: 'digestive',
    inShort:
      'Not enough lactase to digest milk sugar. Uncomfortable rather than dangerous, and most people tolerate some amount.',
    watches: ['Milk in what you scan — this platform reports it as one of the fourteen declared allergens.'],
    helps: [
      'Hard cheese and live yoghurt, which many people manage well.',
      'Lactase drops or tablets before dairy.',
      'Fortified alternatives, so calcium and iodine do not quietly drop away.',
    ],
    careful: [
      'Dropping dairy entirely without replacing the calcium and iodine it was providing.',
    ],
    clinicianOnly: [
      'Telling this apart from a milk allergy or from coeliac disease, which is a test rather than a guess.',
    ],
    effects: {},
  },

  iron_deficiency_anaemia: {
    id: 'iron_deficiency_anaemia',
    label: 'Iron-deficiency anaemia',
    group: 'other',
    inShort: 'Not enough iron to make haemoglobin, so less oxygen gets carried. Tiredness is the usual first sign.',
    watches: ['Whether iron-rich food appears at all in what you record.'],
    helps: [
      'Iron-rich food with something containing vitamin C in the same meal, which improves absorption.',
      'Meat, pulses, dark leafy greens and fortified cereals.',
    ],
    careful: [
      'Tea and coffee with meals, which reduce iron absorption considerably.',
      'Calcium supplements taken at the same time as iron.',
    ],
    clinicianOnly: [
      'Why the iron is low, which matters more than the iron itself and needs investigating.',
      'Supplement dose and duration.',
    ],
    effects: {},
  },

  reflux: {
    id: 'reflux',
    label: 'Acid reflux',
    group: 'digestive',
    inShort: 'Stomach contents coming back up into the gullet. Common, and often improved by a few small changes.',
    watches: ['Late meals close to bedtime.', 'Alcohol and caffeine.'],
    helps: [
      'Eating earlier in the evening and staying upright afterwards.',
      'Smaller meals; less alcohol, caffeine and fizzy drinks.',
      'Losing weight slowly if there is weight around the middle to lose.',
    ],
    careful: ['Very fatty or very spicy meals late at night, which many people find are the trigger.'],
    clinicianOnly: [
      'Difficulty swallowing, weight loss or persistent symptoms, which need looking at rather than managing.',
      'Long-term acid-suppressing medication.',
    ],
    effects: {},
  },

  diverticular_disease: {
    id: 'diverticular_disease',
    label: 'Diverticular disease',
    group: 'digestive',
    inShort: 'Small pouches in the wall of the bowel. Usually quiet, occasionally inflamed.',
    watches: ['Fibre across the week.'],
    helps: [
      'More fibre, built up gradually, with plenty of fluid alongside it.',
      'Regular movement, which helps the bowel generally.',
    ],
    careful: [
      'Increasing fibre suddenly, which causes more discomfort than it solves.',
      'During a flare the advice is often the opposite — lower fibre for a while — so follow what you were told rather than the general rule.',
    ],
    clinicianOnly: ['Pain with fever, or any bleeding, which is not a diet question.'],
    effects: {},
  },

  osteoporosis: {
    id: 'osteoporosis',
    label: 'Osteoporosis',
    group: 'bones',
    inShort: 'Bone that has become less dense and breaks more easily than it should.',
    watches: ['Whether calcium-containing food appears in what you record.', 'Days without weight-bearing movement.'],
    helps: [
      'Calcium from food — dairy, fortified alternatives, tinned fish with bones, green vegetables.',
      'Weight-bearing movement and resistance work, which is the part food cannot do.',
      'Vitamin D, particularly through a British winter.',
    ],
    careful: [
      'Losing weight quickly, which takes bone with it.',
      'Smoking and heavy drinking, both of which reduce bone density.',
    ],
    clinicianOnly: [
      'Bone-protecting medication and vitamin D dosing.',
      'Which movements are safe for you, particularly bending and twisting if there have been spinal fractures.',
    ],
    effects: { deficitNeedsClinician: true },
  },

  heart_failure: {
    id: 'heart_failure',
    label: 'Heart failure',
    group: 'heart',
    inShort: 'A heart that is not pumping as effectively as it should, so fluid and salt balance matter a great deal.',
    watches: ['Salt, which matters more here than for most people.', 'Weight, where a sudden rise means fluid rather than fat.'],
    helps: ['Less salt.', 'Movement at the level your team has agreed, which improves symptoms and outlook.'],
    careful: [
      'Salt substitutes, which are usually potassium chloride and interact with several heart-failure medicines.',
      'A weight gain of two or three kilograms over a few days, which is fluid and is a reason to ring your team the same week.',
    ],
    clinicianOnly: [
      'Fluid limits and diuretic doses.',
      'Any sudden breathlessness or swelling, which is urgent rather than dietary.',
    ],
    effects: { saltMattersMore: true, noSaltSubstitute: true, weightLossIsAWarning: true },
  },

  ibd: {
    id: 'ibd',
    label: 'Crohn’s disease or ulcerative colitis',
    group: 'digestive',
    inShort:
      'Inflammation of the gut that comes and goes. What helps in remission and what helps in a flare are often opposites, which is why general diet advice fits it badly.',
    watches: ['Weight going down without you trying.', 'Long periods eating very little.'],
    helps: [
      'Eating enough, which is the thing most often lost during a flare.',
      'Keeping a record of what you actually manage, which is more use to your team than any general list.',
    ],
    careful: [
      'Exclusion diets taken up alone. They are used in IBD, but as a supervised treatment rather than an experiment.',
    ],
    clinicianOnly: [
      'Flare treatment, and all of the medication.',
      'Weight loss, iron and B12 — these are monitored, not managed by an app.',
    ],
    effects: { weightLossIsAWarning: true, deficitNeedsClinician: true },
  },

  nafld: {
    id: 'nafld',
    label: 'Fatty liver disease',
    group: 'metabolic',
    inShort:
      'Fat accumulating in the liver, usually alongside weight, blood sugar or cholesterol. It is one of the most reversible things on this list.',
    watches: ['Sugary drinks and free sugars.', 'Weight, where losing seven to ten percent can reverse a great deal.'],
    helps: [
      'Cutting sugary drinks, which contribute disproportionately.',
      'Losing weight slowly and steadily if there is weight to lose.',
      'Movement, which helps the liver independently of weight.',
    ],
    careful: ['Alcohol, which adds to the same injury.', 'Rapid weight loss, which can make liver inflammation worse.'],
    clinicianOnly: ['Monitoring for scarring, which is the part that matters and is not felt.'],
    effects: {},
  },

  pregnancy: {
    id: 'pregnancy',
    label: 'Pregnancy',
    group: 'other',
    inShort:
      'Not a condition, but it changes almost everything on this page — including the fact that weight is expected to rise.',
    watches: ['Foods that carry a listeria or toxoplasma risk.', 'Caffeine across the day.'],
    helps: [
      'Folic acid and vitamin D, as advised in pregnancy.',
      'Staying active at a level that feels comfortable.',
    ],
    careful: [
      'Unpasteurised dairy, mould-ripened and blue cheeses, pâté, raw or undercooked meat and eggs outside the British Lion scheme, and liver.',
      'Caffeine above about 200mg a day.',
      'Alcohol, where the advice is none.',
    ],
    clinicianOnly: [
      'Weight, which is expected to rise and is not something to manage from an app.',
      'Everything else — your midwife knows your case and this platform does not.',
    ],
    effects: { weightLossIsAWarning: true, deficitNeedsClinician: true },
  },

  /**
   * Appetite-suppressing medication — the one entry here that is not a
   * condition, and the one that needed the most care.
   *
   * Somebody on a GLP-1 receptor agonist has a prescription, not an
   * illness, and what they need from a food platform is the opposite of
   * what a food platform usually offers. Nobody needs help eating less;
   * appetite has been solved chemically. What is genuinely hard is getting
   * enough protein into a day when nothing appeals, holding on to muscle
   * while weight comes down fast, staying hydrated when thirst has gone
   * quiet too, and finding anything tolerable during nausea.
   *
   * Three deliberate refusals in this card.
   *
   * It says nothing about the medication itself. Not a dose, not a
   * schedule, not an injection site, not whether to keep taking it, not
   * what to do about a missed one — every competitor treats those as
   * first-class features and every one of them is a prescriber's decision.
   *
   * It does not congratulate a falling weight. The number going down is
   * the medication working and needs no encouragement from us; what needs
   * saying is what to protect while it does.
   *
   * And it is never shown to anyone under 18, which the platform enforces
   * for every condition but which matters most here.
   */
  appetite_suppressing_medication: {
    id: 'appetite_suppressing_medication',
    label: 'Appetite-suppressing medication',
    group: 'medication',
    inShort:
      'A prescribed medication that reduces appetite — a GLP-1 receptor agonist such as semaglutide or tirzepatide, or something similar. Eating less is the intended effect, so the difficult part is no longer restraint. It is getting enough of what your body still needs into a much smaller appetite.',
    watches: [
      'Days where very little was recorded at all — with appetite suppressed it is easy to reach evening on almost nothing.',
      'Protein across the week, which is the first thing to fall away when portions shrink.',
      'How fast weight is coming down, because faster is not better and muscle goes with it.',
      'Long stretches with no movement recorded, which is when muscle loss accelerates.',
    ],
    helps: [
      'Putting protein first in every meal, before anything else on the plate. When you can only manage a few mouthfuls, which mouthfuls they are decides what this month costs you.',
      'Small and frequent rather than three sittings. Most people find a quarter of a plate five times a day easier than a plate twice.',
      'Resistance work two or three times a week — this is the part food cannot do. It is the difference between coming down and coming down while keeping what you had.',
      'Drinking to a schedule rather than to thirst, because thirst quietens along with appetite.',
      'Cold, plain and simple food during nausea. Most people find it goes down when hot and rich food will not.',
      'Recording what you actually managed rather than what you meant to. A thin day is information your team needs, not a failure to hide.',
    ],
    careful: [
      'Days that end on almost nothing. It happens easily and it is the main way this goes wrong — the medication is doing its job and the shortfall is invisible until it is weeks deep.',
      'Alcohol, which many people find they tolerate very differently and which displaces food there is no room for.',
      'Very large or very rich meals, which are the usual trigger for feeling unwell on these medications.',
      'Fibre supplements taken to fix constipation without also raising fluid, which makes it worse.',
    ],
    clinicianOnly: [
      'Everything about the medication. The dose, the timing, the escalation, a missed one, and whether to continue — all of it belongs to whoever prescribed it, and this platform will not comment on any of it.',
      'Persistent vomiting, severe abdominal pain, or being unable to keep fluid down, which need looking at rather than managing.',
      'Whether you need supplements or blood tests while your intake is this low.',
      'Muscle mass, if you want it measured. We can see that you are doing resistance work; we cannot see what it is preserving.',
    ],
    effects: {
      proteinMattersMore: true,
      muscleLossRisk: true,
      hydrationMattersMore: true,
      smallFrequentMeals: true,
      prescribedElsewhere: true,
      // Not weightLossIsAWarning: here the weight coming down is the point.
      // But a deliberate deficit on top of a suppressed appetite is a
      // decision for the prescriber, not for an app to plan.
      deficitNeedsClinician: true,
    },
  },
};

/**
 * Entries that are a medication rather than a diagnosis.
 *
 * Kept separate because they behave differently: the card never comments
 * on the medication, the prescriber is named as the owner of every
 * decision about it, and the platform's usual instinct — to help somebody
 * eat less — is exactly wrong.
 */
export const MEDICATION_CONTEXTS: readonly ConditionId[] = ['appetite_suppressing_medication'];

export function isMedicationContext(id: ConditionId): boolean {
  return MEDICATION_CONTEXTS.includes(id);
}

/**
 * The sentence a medication context carries, in place of the diagnosis one.
 */
export const MEDICATION_NOT_ADVICE =
  'This is not medical advice and says nothing about your medication. The dose, the timing and ' +
  'whether to continue are your prescriber’s, and nothing here will comment on any of them. What ' +
  'this does is read what you have actually recorded and point at what is worth protecting while ' +
  'your appetite is reduced.';

export const CONDITION_IDS = Object.keys(CONDITIONS) as ConditionId[];

export function isConditionId(value: string): value is ConditionId {
  return (CONDITION_IDS as string[]).includes(value);
}

/** The combined effect of everything somebody has told us they live with. */
export function effectsOf(ids: readonly ConditionId[]): ConditionEffects {
  const combined: {
    -readonly [K in keyof ConditionEffects]: ConditionEffects[K];
  } = {};
  for (const id of ids) {
    const effects = CONDITIONS[id]?.effects;
    if (!effects) continue;
    for (const [key, value] of Object.entries(effects)) {
      if (value) combined[key as keyof ConditionEffects] = true;
    }
  }
  return combined;
}

/**
 * The sentence that has to sit under all of it, unaltered.
 *
 * It is not a disclaimer bolted on to make the rest safe to say — it is
 * the accurate description of what this is. Everything above is published
 * guidance restated against what somebody scanned.
 */
export const NOT_MEDICAL_ADVICE =
  'This is not medical advice. It is published guidance for a condition you have told us about, ' +
  'read against what you have actually recorded. It does not diagnose anything, it never changes ' +
  'a prescription, and it does not know your test results. Anyone treating you knows your case; ' +
  'this does not.';
