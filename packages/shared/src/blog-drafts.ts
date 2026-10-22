import type { PostDraft } from './blog';

/**
 * Feature articles, written and not published.
 *
 * ── Why these are not in `SEED_POSTS` ─────────────────────────────────
 *
 * There are two ways prose reaches this blog. `SEED_POSTS` plus `ARTICLES`
 * ship with the build and go live the moment they merge. `published.ts`
 * reads the database, where an article is written, then moved to
 * `in_review`, then published **by a named person** — `transition` refuses
 * `published` without a reviewer.
 *
 * The standing rule is that nothing an agent writes about health reaches a
 * member without a named human reviewer, and that there is no
 * draft-to-published edge. The repository path has no reviewer field at
 * all, so for agent-written prose it *is* that edge: add an entry, merge,
 * and it is live on jessmove.com with nobody having cleared it.
 *
 * These articles were written by an agent. So they live here, where
 * nothing renders them, and they are reviewable the way every other change
 * in this repository is reviewable — in the diff.
 *
 * ── Publishing one ────────────────────────────────────────────────────
 *
 * A person reads it, and if they are content to put their name to it:
 *
 *   1. move its `title`, `slug`, `category`, `keyword` and `clusterKey`
 *      into `SEED_POSTS`, adding `publishedAt`
 *   2. move its prose into `ARTICLES` as a `sections` array
 *   3. say in the commit message who reviewed it
 *
 * That is three deliberate steps rather than a merge, which is the point.
 * Nothing here is published by being written.
 *
 * ── What is already guaranteed ────────────────────────────────────────
 *
 * `blog-drafts.test.ts` runs the real `seoAudit` over every draft and
 * fails if one does not pass — the same gate the agent-drafted half of the
 * blog goes through, including the editorial lexicon. So a reviewer is
 * reading prose that already clears the machine checks, and is being asked
 * the only question a machine cannot answer: is this true, and is it ours
 * to say.
 *
 * No `lexiconExemptions` anywhere in this file, deliberately. The
 * exemption mechanism exists for prose a person wrote; using it here would
 * reach around the one control that is absolute for generated copy. If an
 * article needed a banned term, it was reworded instead.
 */
export const DRAFT_ARTICLES: readonly PostDraft[] = [
  {
    title: 'The movement coach built to stay silent',
    slug: 'the-coach-that-stays-silent',
    description:
      'Most coaching apps measure how often they speak. Ours measures how often it stays quiet. ' +
      'Why a movement coach that holds its tongue is the harder build.',
    category: 'Behaviour',
    keyword: 'movement coach',
    secondaryKeywords: ['context engine', 'notification timing', 'behaviour change'],
    clusterKey: 'micro-movement',
    internalLinks: ['/micro-movement', '/mova', '/how-it-works', '/account', '/status'],
    faq: [
      {
        q: 'Does the coach send a reminder at a set time each day?',
        a: 'No. A fixed timer is explicitly not permitted. It waits for evidence of a real gap — a declared schedule, a device that has been still — and if it has none it says nothing that day.',
      },
      {
        q: 'What happens if I am driving?',
        a: 'It holds, and says so. A request that arrives while you are driving comes back as a hold with the reason named, as a success rather than an error, and nothing is offered until the context changes.',
      },
      {
        q: 'Can I be asked more than a few times a day?',
        a: 'No. Each age mode carries a hard ceiling, counted from your own activity on the server. The number is not something the app can send up, so no client can raise its own limit.',
      },
    ],
    body: `A movement coach is usually judged by how well it persuades. This movement coach is judged by how often it decides to stay quiet, because the thing it is competing with is not another app — it is the twenty-ninth notification of your morning, and the only way to be the one that gets opened is to be the one that is rarely sent.

## A fixed timer was the obvious answer, and it is banned

The easy build is a daily reminder at nine. It is also the build that converts at around one in ten, because a prompt that arrives whether or not you have a moment free is indistinguishable from every other interruption.

So the engine is not allowed one. The rule is written into the service that would otherwise be the natural home for it: no positive availability signal and no declared schedule means defer, and a fixed-timer fallback is not permitted. There is no setting that turns it back on.

What stands in its place is evidence. A schedule you declared. A device that has been still for a while. A calendar gap you consented to share. Each of those is a class of signal you switch on individually, and the engine records which ones it actually used for a given decision, so the reason it spoke is auditable after the fact rather than asserted.

## Four things it used to be told, and now observes

Until recently the browser asserted four facts on every request: that you were still, that you were at home, that you were not on a call, and that you were not in do-not-disturb. A browser can observe none of those. They were sent as confident values anyway, which meant the safety layer could not have withheld a prompt for driving even if it wanted to — the input it would have checked was a constant.

Motion and location are now *unknown* by default, which is a real value in both unions rather than an absence, and the two booleans are optional, so leaving them out means "no evidence" instead of "no". The only thing a tap genuinely proves is that the device was in use, and that is the basis the request now claims.

This made the product quieter. That was the correct direction.

## A movement coach that counts its own ceiling

The daily ceiling used to arrive in the request body. The browser sent six, every time, which made "a hard ceiling the engine may never exceed" a ceiling the client set for itself.

Those fields are gone. The count comes from your own activity log on the server and the limit from your age mode, and neither is reachable from the outside — sending them is now rejected outright. If the count cannot be read at all, the engine treats the ceiling as already reached, because a rate limit that fails open on a product that sends notifications is worse than one that fails closed.

A delivery that does not arrive does not spend the ceiling either. An attempt to an unreachable device records as undelivered and writes no activity, so a prompt nobody received is not counted against the prompts you were willing to receive.

## What a hold looks like

When the engine declines, it returns a hold with the reason named — driving, a quiet window, the ceiling reached, a cooldown still running — as a successful answer rather than an error. The interface can then say what happened, which matters more than it sounds: an app that goes silent without explanation reads as broken, and an app that explains its silence reads as considerate.

The same path is used by the background scheduler as by the screen in front of you. A rule that only holds when somebody is watching is not a rule, so the sweep that can wake your phone goes through the identical ceiling, cooldown, quiet hours, sleep window and safety screen.

## Why this is the harder build

Every one of these decisions makes the product do less. The timer would have been fifty lines. Observing instead of asserting cost a schema, a migration and a ledger of why each decision was made. Counting the ceiling server-side meant deleting fields a client was already sending and accepting that some integrations would break.

The return is that when it does speak, it is usually right — and the measure we care about is not how many prompts went out, but how many were acted on by somebody who had a genuine gap and was glad to be told.`,
  },

  {
    title: 'Why micro movement is ninety seconds, not thirty minutes',
    slug: 'ninety-seconds-is-the-product',
    description:
      'The unit here is ninety to three hundred seconds, and that one constraint decided the ' +
      'engine, the library and the entire safety model. Here is how.',
    category: 'Product decisions',
    keyword: 'micro movement',
    secondaryKeywords: ['movement snacking', 'sedentary interruption', 'exercise adherence'],
    clusterKey: 'micro-movement',
    internalLinks: ['/micro-movement', '/how-it-works', '/for-adults', '/body-balance', '/get-started'],
    faq: [
      {
        q: 'How long is a single session?',
        a: 'Between ninety and three hundred seconds. It is enforced as a database constraint rather than a guideline, so anything outside that range cannot be stored as a session at all.',
      },
      {
        q: 'Do I need to change clothes or find a space?',
        a: 'No. Every item in the library exists in a seated form and a chair-supported form, and the engine will not offer one that needs more room than you said you had.',
      },
      {
        q: 'Is this a replacement for longer activity?',
        a: 'No, and it does not claim to be. It is built for the gaps in a day that longer activity never reaches, and the two are complementary rather than competing.',
      },
    ],
    body: `Micro movement means ninety to three hundred seconds here, and that number is not a design preference — it is the constraint everything else was built around. It is the longest a person will reliably give you in the middle of a working day and the shortest that does something worth recording, and it is enforced in the database rather than suggested in a guideline.

## Micro movement, enforced in the schema rather than the style guide

The table that holds each variant carries a check: duration between ninety and three hundred seconds. Anything outside that cannot be written at all, which means no future service, no import, and no well-meaning editor can create a forty-minute item and call it the same thing.

That is deliberate, and it is the pattern used for every promise in this platform that matters. A rule enforced only by the code that currently writes the column is a rule that survives exactly until somebody writes a different service. A constraint survives a refactor by somebody who never read the reasoning.

## What a micro movement unit does to the engine

Because the unit is small, the interesting question stops being "what should this person do" and becomes "is there a gap right now, and how long is it". That is a scheduling problem rather than a programming problem, and it changes the whole shape of the product.

It means the engine asks how long you actually have and calibrates to that, rather than offering a fixed block and hoping. It means a two-minute answer is a complete answer rather than a compromise. And it means declining is cheap: if there is no gap, nothing is lost by waiting, because the thing being offered was never going to occupy your afternoon.

It also makes the safety model tractable. Screening ninety seconds of seated thoracic movement against a declared condition is a question with an answer. Screening a thirty-minute session is a question about progression, intensity and fatigue, and the honest answer usually requires a clinician in the room.

## Five forms or it is not in the library

The other half of the constraint is that every item exists in five forms: standing, seated, chair-supported, bed or recliner, and single-limb or adaptive. A movement without all five cannot be published. There is no override flag, no force-publish and no administrative bypass, and a partial item stays as a draft indefinitely.

This is the rule most often mistaken for an accessibility feature bolted on. It is a publishing gate, and it is upstream of everything: it decides what gets written, not how it gets labelled afterwards. The practical effect is that somebody in a chair and somebody standing in a kitchen are offered the same item, in the form that suits them, rather than one of them being offered a smaller product.

The gate is also the reason the library is small and slow to grow. Five forms, each with its own instruction set per age mode and its own screening, is a serious amount of authoring for one item. We would rather have a short library where every entry reaches everybody than a long one with a note apologising for most of it.

## What the engine will not do

It will not promote you to a harder form to drive progression. Changing form is something you do, or something a clinician does, and never something the engine decides on your behalf because your numbers looked good this week.

It will not substitute upwards either. A swap may only ever move down the support ladder, and the legal moves are published rather than left for a client to infer from the order of a list — so an interface offering you an alternative cannot accidentally offer you a harder one and call it a substitution.

And when no form in the library is safe for the capability profile you have described, it declines and records the gap rather than offering the nearest thing. A library gap is a real answer. The nearest thing is how somebody gets hurt.

## The honest limitation

Ninety seconds is not a substitute for a long walk, a swim or a gym session, and nothing here says otherwise. What it reaches is the part of the day those never touch: the hours between nine and six, on the days when the longer thing does not happen, for the people for whom it mostly does not happen at all.`,
  },

  {
    title: 'Food swaps that respect what you actually cook',
    slug: 'swaps-that-respect-what-you-cook',
    description:
      'A suggestion that ignores somebody culture is a suggestion nobody takes. Here is the ' +
      'ladder we use, and why it narrows when we know less about you.',
    category: 'Nutrition',
    keyword: 'food swaps',
    secondaryKeywords: ['cultural food', 'dietary restriction', 'meal suggestions'],
    clusterKey: 'food-intelligence',
    internalLinks: ['/foodlens', '/how-it-works', '/for-adults', '/privacy', '/developers'],
    faq: [
      {
        q: 'Will it suggest something I do not eat?',
        a: 'No. Anything you list as never-suggest is excluded at every rung of the ladder. It is not offered more cautiously or with a caveat; it is removed from the set before you see it.',
      },
      {
        q: 'Why are the suggestions limited before I tell you anything?',
        a: 'Because the rungs that replace a dish need to know your food, and we will not guess it. With nothing declared you get only the changes that modify the meal in front of you.',
      },
      {
        q: 'Do you work out my cuisine from what I scan?',
        a: 'No. Inferring somebody cuisine from their shopping is inferring ethnicity without asking. It is declared by you or it is absent, and absent narrows the suggestions rather than filling the gap.',
      },
    ],
    body: `Food swaps fail for a reason that has nothing to do with nutrition: they are usually written by somebody who does not eat what you eat. Tell a person whose evening meal is jollof rice to have a salad instead and you have not given advice, you have given up. The ladder below is our attempt to be useful without that.

## Food swaps in five rungs, ordered by how much they disturb the meal

The ladder runs from least to most disruptive. Reduce one element. Change the cooking method. Replace one side. Rebuild the plate. Choose something else entirely.

The ordering is the whole design, because the first three rungs do not change what the dish *is*. "Use half the oil" and "grill rather than frying" are the same advice in Lagos, Lahore and Leeds — they cannot be culturally wrong, because they do not touch the identity of the meal. The fourth rebuilds the plate. The fifth replaces it, and replacing somebody dish without knowing their food is precisely where this goes wrong.

So the rule is: the less the system knows about you, the less it is allowed to move. With nothing declared, only the rungs that modify are offered, never the ones that replace. That is honest, it needs no database of cuisines, and it makes the claim true today rather than after a project nobody has started.

## What you declare, and what we refuse to guess

Two things change the suggestions. The first is what you cook, named by you. The second is anything that must never be suggested.

We do not infer the first. Working out somebody cuisine from their scanning history is inferring ethnicity from behaviour, and special-category information arrived at by inference is worse than not having it at all. If you have not said, the system behaves as though it does not know — because it does not.

The second is a safety matter rather than a preference. Allergens and religious restriction are absolute at every rung: a suggestion that violates one is not softened, not footnoted, not shown. If the database that holds your exclusions cannot be read for a moment, the code returns the *narrowest* possible ladder rather than an empty set, because an empty set reads as "nothing declared" and would offer somebody the one thing they told us to never mention.

## When there is nothing compliant to say

Sometimes the honest answer is that there is no suggestion. An engine with nothing compliant to offer should say so, and ours does — it reports how many were withheld and why, rather than reaching for the nearest non-compliant option.

Offering the nearest thing instead is how a product ends up recommending pork to somebody who does not eat it, and one of those is enough to lose a person permanently. A thinner list with a reason attached keeps the trust that a fuller list would spend.

## Honest about what we do not have

There is no library of cuisines behind this. We do not hold a catalogue of regional dishes with their nutritional profiles, and we are not going to pretend to by generating plausible-looking entries.

That is why the fifth rung — choosing a different meal — is never produced automatically, even once you have named your cuisine. It is the one rung that genuinely requires knowing somebody food, and the system says so to you instead of filling the space with a guess. The fourth rung describes proportions rather than naming a dish: keep the protein, reduce the starch, fill the gap with vegetables, cooked the way you cook.

## Why the ten constraints were a claim before they were a feature

The page describing this product listed ten things a suggestion should respect — culture, budget, local availability, allergies, religion, cooking skill, household size, preparation time, preferred foods, and whether the shops near you stock the thing. All ten were on the page for months and honoured by nothing, because no member had ever been asked for any of them and nothing stored an answer.

That is the uncomfortable shape of a lot of software: the logic existed, the tests passed, the list rendered, and the feature did not exist. It does now, with two fields on the scanning screen and a filter between the ladder and your eyes. The number of rungs you are offered tells you how much the system has been told, which is a more honest interface than a long list that quietly ignores half of it.`,
  },

  {
    title: 'Nine body composition pathways, six of which refuse',
    slug: 'nine-pathways-six-of-them-refuse',
    description:
      'Most products have one goal and apply it to everybody. We have nine body composition ' +
      'pathways, and six of them will not reduce anything at all.',
    category: 'Product decisions',
    keyword: 'body composition pathways',
    secondaryKeywords: ['safety screening', 'older adults', 'clinical safeguards'],
    clusterKey: 'weight-control',
    internalLinks: ['/body-balance', '/for-children', '/assurance', '/how-it-works', '/account'],
    faq: [
      {
        q: 'Why would a pathway refuse to reduce anything?',
        a: 'Because reduction is wrong for it. Growth in a child, independence in later life and recovery from illness all need maintenance or gain, and a pathway for those refuses reduction as a property rather than a setting.',
      },
      {
        q: 'Can I choose any pathway I like?',
        a: 'You state what you are here for, and a safety screen decides what is offered. Your age, anything you have declared and a request for an extreme change can all override the choice.',
      },
      {
        q: 'Is any of this available under 18?',
        a: 'No. Below eighteen there is no weight framing of any kind — not consent-gated, not guardian-gated, absent from the interface and refused by the database.',
      },
    ],
    body: `There are nine body composition pathways in this platform and six of them will not reduce anything. That is not a gap in the feature set. A product with one goal applied to everybody is a product that will eventually tell a recovering eighty-year-old to eat less, and no amount of careful copy fixes that afterwards.

## What the nine are for

Three of the pathways permit reduction: reducing overall, reducing around the waist, and recomposition. The other six are growth in childhood, independence in later life, strength protection, recovery, maintenance and performance. For those, reduction is not a setting that happens to be switched off — it is a property of the pathway, read from the definition rather than from a request.

That distinction matters because it decides where the answer lives. A flag on a request can be sent by anybody. A property of a pathway is the same for everyone on it, and changing it means changing a definition that a test reads.

## The gate the browser used to hold

Until recently the question "may this person be told to eat less" was answered by the browser, which sent a confident yes on every request. The server took it at face value.

That is the same class of fault as a client sending its own rate limit, except the answer is a daily energy figure rather than a notification count. It was harmless while the surface was switched off and would have stopped being harmless the moment it was turned on.

It now comes from the pathway definition, server-side, and the field has been removed from the request so that sending it is rejected. Six of the nine answer no before anything else is considered.

## Four more gates behind that one

The pathway is the first gate, not the only one. A safety screen runs over age, anything declared, and whether the request is for an extreme change, and it can force a refusal regardless of pathway. Declared conditions that need a clinician are read from the catalogue on the server rather than trusted from the request, so a client cannot clear its own gate by omitting one. A body mass index below the healthy range stops a reduction plan outright and points at a GP or a dietitian instead. And under eighteen the whole surface is absent.

The last of those is worth being specific about, because it is the one with commercial cost. Below eighteen, body composition is not consent-gated and not guardian-gated. It is not in the interface, the function that decides does not read the consent flag at all below that age, and the database rejects the write as well, so a defect in a service cannot store one. This cost a procurement conversation with a schools buyer who wanted the panel for sixth-formers. Sixth-formers are seventeen. The answer was no.

## Why the refusals are the product

It is tempting to treat a refusal as a missing feature with an apologetic message attached. These are the opposite: they are the reason the thing can be offered to anybody at all.

A platform for ages ten to a hundred cannot have one goal. The six pathways that refuse reduction are what make it safe to have three that permit it, and the screen that can override any of the nine is what makes it safe to let somebody choose. Take the refusals out and you do not get a more capable product, you get one that can only responsibly be sold to the middle of its own age range.

## What you see

You say what you are here for and give your measurements. What comes back is the numbers, what they do and do not mean, and the pathway that follows — with the reasoning visible rather than a verdict. Every gate that was considered is named, because a refusal that does not say what it checked reads as a refusal to engage.

Nothing on that screen is a judgement about you. It is an account of which of nine routes fits what you have described, and a list of the things that would change the answer.`,
  },

  {
    title: 'A daily energy range that starts with a floor',
    slug: 'a-daily-energy-range-with-a-floor',
    description:
      'Most apps give you a target and let you undershoot it. We give a daily energy range with ' +
      'a floor that is never crossed, built from your own record.',
    category: 'Nutrition',
    keyword: 'daily energy range',
    secondaryKeywords: ['kcal range', 'sustainable rate', 'food record'],
    clusterKey: 'weight-control',
    internalLinks: ['/body-balance', '/foodlens', '/how-it-works', '/assurance', '/account'],
    faq: [
      {
        q: 'Where does the number come from?',
        a: 'From your own recorded food over at least seven confirmed days, not from an equation about people in general. The range is set against what you actually eat, and the figure it rests on is shown to you.',
      },
      {
        q: 'What is the floor for?',
        a: 'It is the lower end, and it is never crossed. It is named before the upper end and labelled as a floor, so nobody skimming reads the smaller number as the thing to aim at.',
      },
      {
        q: 'Why will it not give me a range?',
        a: 'Seven of its eight possible answers are a refusal — too young, no consent, the wrong pathway, a condition needing a clinician, a body mass index below the healthy range, too little record, or a record you have not confirmed.',
      },
    ],
    body: `The daily energy range is the one screen in this product that tells a person how much to eat, and it is built the opposite way round from most. It starts with a floor that is never crossed, it is anchored on your own recorded food rather than a formula, and it refuses far more often than it answers.

## Anchored on your record, not on an equation

The usual approach is to estimate what somebody needs from height, weight, age and an activity multiplier, then subtract. That produces a confident number from four inputs and a guess, and the guess is the activity multiplier.

This takes a different input: what you have actually recorded eating, averaged over the days you recorded it, with a minimum of seven. If your record says two thousand six hundred, the range is set against two thousand six hundred — and the figure it rests on is shown beside the answer, because a range with no visible basis is a number to argue with rather than a number to use.

The divisor is days *recorded*, not days covered. An earlier version divided by a coverage figure that was itself derived partly from total energy, which made the arithmetic an identity: everybody eating above the reference figure got handed exactly the reference figure back. That is the kind of defect that looks like a working feature.

## The floor comes first, in the code and on the screen

There is a hard lower bound of one thousand five hundred, and the range can never sit below it. It is enforced in the arithmetic and again as a database constraint on the stored range, because a floor enforced only by the code that currently writes the value is not a floor.

On the screen the lower number is named first and labelled as a floor. That ordering is deliberate: somebody skimming a two-number range will anchor on one of them, and the one they should anchor on is the one they must not go under.

The upper end is set by a rate rather than a wish. The reduction implied is capped at the lesser of half a kilogram a week and one per cent of body weight, whichever is smaller — so a lighter person gets a gentler range automatically rather than the same subtraction applied to everybody.

## Seven of eight answers are a refusal

The range has eight possible outcomes and seven of them decline. Under eighteen. Not opted in. A pathway that does not reduce. Reduction not permitted by the safety screen. A declared condition that needs a clinician to agree first. A body mass index below the healthy range. Too little record to average. A record you have not confirmed is complete.

Each refusal says what would change it, which is the difference between a gate and a wall. And the refusal copy is most of the surface: for most people, most of the time, what this feature produces is a sentence explaining why there is no number yet.

That last gate is worth naming. A half-kept record makes your intake look lower than it is, and a range built on it would be built on a figure already too low. So the system asks you to confirm — and only you know whether the meals you did not record were meals you did not eat.

## The colour belongs on the day, not the plate

Once there is a range, each day gets a standing against it: inside, above, below the floor, or simply unfinished. There are three colours and none of them is red. An unfinished day that is low reads as *early* rather than as a shortfall, because before the evening a low day is just a day that has not happened yet.

A single meal is never coloured on its own. The same plate is unremarkable at noon and the whole day at nine, and only the running total knows which — so the colour is the day's, read from the ledger, after the meal you just recorded has joined it.

## What it says when it is above the range

It says the number, that it is above, and that one day changes a weekly rate very little — and that nothing here needs working off. There is no mechanism anywhere in this platform for undoing a meal with movement, and the copy does not imply one, because that idea is the thing most likely to do harm.`,
  },

  {
    title: 'The weekly weight record, and the gap it must not hide',
    slug: 'the-weekly-record-and-the-gap',
    description:
      'A weekly weight record is simple until somebody skips a fortnight. Then the arithmetic ' +
      'decides whether you get useful advice or a false alarm.',
    category: 'Behaviour',
    keyword: 'weekly weight record',
    secondaryKeywords: ['trend reading', 'rate of change', 'self monitoring'],
    clusterKey: 'weight-control',
    internalLinks: ['/body-balance', '/how-it-works', '/account', '/assurance', '/for-adults'],
    faq: [
      {
        q: 'What if I skip a week or two?',
        a: 'The gap is counted and the change is divided by it. Three kilograms across three weeks is reported as one a week, not three, because the threshold that triggers advice is a rate.',
      },
      {
        q: 'Does weighing more often give a better record?',
        a: 'No. One reading represents each week, and it is the last one you gave in it. Weighing three times in a week is not three weeks of data, though the record says how many readings it rests on.',
      },
      {
        q: 'What happens on a week where nothing changes?',
        a: 'It is reported as level, and explicitly not as a loss of progress. Weight does not move in a straight line, and a product that treats a flat week as a fault teaches people to stop weighing.',
      },
    ],
    body: `A weekly weight record sounds like the easiest feature in a product like this: store a number each week, subtract, show the difference. It is easy right up to the moment somebody misses a fortnight, and then the arithmetic decides whether they get useful advice or an alarming message that happens to be wrong.

## One rate across the span answers a different question

The platform already had a trend: take the first reading and the last, divide the change by the days between, report a rate. That tells you where things are going over a month, and it is genuinely useful.

It is not what somebody reducing actually asks. The question is "what happened this week, against last week" — and a single average across the whole span cannot answer it. Worse, it hides the pattern most worth noticing: four quiet weeks followed by a sudden drop reads, on average, as a gentle decline.

So the weekly weight record buckets readings into weeks that start on a Monday and reports each one against the week before it: the figure, the change, how many readings it rests on, and the two numbers a person is actually comparing.

## The gap is the part that matters

Weigh, skip two weeks, weigh again three kilograms lighter, and the change really is three kilograms. The rate is one a week.

Collapsing that distinction would be the most harmful bug available here, because the threshold that triggers advice is a rate. Read as a single week, three kilograms on a ninety-kilogram person is well past the point where the system should say something careful — so a person who simply did not weigh for a fortnight would be told they were reducing dangerously fast, at the moment they are most inclined to believe it.

The weeks between readings are counted, the change is divided by them, and the sentence says the gap aloud rather than leaving it implied: two weeks apart, so one point one a week rather than two point one. One division, and the difference between advice and a false alarm.

## One reading per week, and it is the last one

Each week is represented by the last reading given in it, matching the rule the underlying readings already follow. Weighing three times in a week is not three weeks of data, and averaging within the week would smooth over the thing you were trying to see.

The row still reports how many readings it rests on, so a week standing on a single morning is visible as exactly that. Daily weight moves by a kilogram or more on water alone, and a record that hides how thin a week was is a record that invites over-reading.

## The advice comes from one set of thresholds

When something is worth saying, it comes from the same rules that govern the whole-span trend: faster than roughly one per cent of body weight a week, a body mass index below the healthy range, a very high one, or a single reading that cannot show a direction at all.

Writing a second set of thresholds for the weekly view would have been easier and would have been a mistake. Two sets of rules about the same person can disagree, and when they do the one that happens to be consulted decides what a person is told. What changes between the two views is only *which* rate is judged — the latest week's, rather than the average that buried it.

Every piece of advice carries what to do about it. A warning without an action is just worry, and worry is not a feature.

## A level week is not a fault

If the week holds, the record says it held, and says that a week that holds is not a week lost. That sentence is in the product for a reason: weight does not move linearly, plateaus are normal and expected, and a product that frames a flat week as a shortfall trains people to stop recording. A record nobody keeps is worth nothing, however good the arithmetic behind it.`,
  },

  {
    title: 'A twelve week programme counted in days, not kilograms',
    slug: 'counted-in-days-never-in-kilograms',
    description:
      'A twelve week programme that promises a number on the scale is promising something it ' +
      'cannot control. Ours sets targets in days, and says why.',
    category: 'Behaviour',
    keyword: 'twelve week programme',
    secondaryKeywords: ['habit targets', 'adherence', 'realistic goals'],
    clusterKey: 'weight-control',
    internalLinks: ['/body-balance', '/how-it-works', '/challenges', '/account', '/for-adults'],
    faq: [
      {
        q: 'Does the programme set a target figure on the scale?',
        a: 'No. Targets are days — days with food recorded, days with movement, days finishing inside your range. What the rate implies is shown as a range and described as a consequence, never a promise.',
      },
      {
        q: 'What happens if I miss a day?',
        a: 'Nothing is taken away. Progress counts what you did and a missed day never reduces it, so the only thing a bad week costs you is the days it contained.',
      },
      {
        q: 'How is overall progress worked out?',
        a: 'It is the weakest of the three strands rather than their average, because a programme is not an average. Recording every day while never moving is not two-thirds of a programme.',
      },
    ],
    body: `A twelve week programme is the standard unit of this industry and it is usually sold on a number: lose this much by then. That number is the one thing the programme cannot control, so ours does not set one. The targets are days, and what the rate implies is reported as a consequence rather than a promise.

## Three strands, all of them behaviour

Each week asks for five days with your food recorded, five days with movement, and four days finishing inside your daily range. Five of seven and four of seven — not seven of seven, because a target that requires perfection is abandoned in week two and a target that survives a bad Tuesday is still there in week nine.

All three are things you do. None of them is a number on a scale, which is a thing that happens partly because of what you did and partly because of salt, sleep, hormones and the time of day you stood on it.

You choose eight, twelve or sixteen weeks. Twelve is the default because it is long enough for a trend to mean something and short enough to see the end of.

## What the arithmetic implies, stated as a consequence

The programme does report what the range implies over the weeks you chose — a span, not a figure, drawn from the rate the range already encodes. For a typical adult range over twelve weeks that is something like one and a half to three and a half kilograms.

It is phrased as what follows if the days are kept, not as what you will achieve. The distinction is not legal caution. A promise of a figure converts the whole programme into a single pass-or-fail event at the end, and a person who is three hundred grams short of a promise has been told they did not manage something they largely managed.

## A missed day never takes anything away

Progress is counted, and counting only ever goes up. There is no mechanism that reduces a strand because a day was missed, because the day being missed is already the whole of its effect. Subtracting on top of that is a product deciding to punish, and the research on punishment in self-monitoring is not kind to it.

This is the same reasoning that made the habit streak forgive. The cost of forgiving is that the number is softer. The benefit is that somebody who has a difficult fortnight still opens the app in the third week, and the only version of this product that works is the one people come back to.

## Overall is the weakest strand, not the average

Three strands could be averaged. They are not: overall progress is the lowest of the three.

An average lets one strand hide another. Record your food every single day, never move at all, and an average says you are doing two-thirds well — which is not true in any useful sense, because the thing the programme is for is the combination. The weakest strand is the honest summary and it also happens to point at what to do next, which an average never does.

## Counted from the record, not reported by the app

Days recorded come from the food ledger. Days moved come from the activity log. Days inside the range are computed per day from the ledger against the range itself, which is the only place the two can be compared.

None of it is sent up by the client. A progress figure a caller can assert is a progress figure that means nothing, and the temptation to let the interface keep its own tally — faster, simpler, no round trip — is exactly how a number becomes decorative.

## What happens at the end

The range is reviewed every fortnight throughout, so a programme is not a decision made once in week one and lived with. At the end you have a record of the days you kept, the weekly figures beside each other, and a rate. What you do with that is the next conversation, not a verdict on this one.`,
  },

  {
    title: 'Team challenges without a leaderboard of bodies',
    slug: 'challenges-without-a-leaderboard-of-bodies',
    description:
      'Team challenges usually rank people by the thing they are most sensitive about. Ours ' +
      'score participation, consistency, improvement and mutual support.',
    category: 'Workplace',
    keyword: 'team challenges',
    secondaryKeywords: ['workplace wellbeing', 'employee engagement', 'inclusive design'],
    internalLinks: ['/challenges', '/industries', '/privacy', '/how-it-works', '/for-adults'],
    faq: [
      {
        q: 'Can colleagues see my figures?',
        a: 'No. Nothing about a person body, their food or their readings is visible to a team, an employer or another member. What a team sees is participation and consistency, aggregated above a minimum group size.',
      },
      {
        q: 'What stops the fittest person winning every time?',
        a: 'Improvement against your own starting point is scored rather than absolute output, and mutual support is scored too. Somebody who begins from a chair can win a challenge outright.',
      },
      {
        q: 'Does my employer get a dashboard of individuals?',
        a: 'No, and there is no plan for one. An employer sees aggregate figures above a minimum group size, which is the only form of this data it is reasonable for them to hold at all.',
      },
    ],
    body: `Team challenges are the easiest thing in wellbeing software to get wrong, because the obvious build is a leaderboard and the obvious metric is output. Put those together in a workplace and you have ranked your colleagues by fitness, published it, and called it engagement. Our team challenges score four things instead, and none of them is output.

## What is actually scored

Participation: did you take part. Consistency: did you take part repeatedly rather than once. Improvement: how does this fortnight compare with your own starting point. And mutual support: did you encourage somebody else in the team.

Three of those four are available to absolutely anybody. Improvement is measured against yourself, so the person starting from a chair and the person who runs at weekends are competing on the same axis — the amount they have moved from where they each began. Mutual support is scored because it is the behaviour that makes a team challenge work at all, and because it costs nothing physical to offer.

Absolute output is not scored. It is the one metric that guarantees the same handful of people win every time, which is also the metric that teaches everybody else not to enter.

## Nothing about a person is visible to the group

A team sees participation and consistency. It does not see weight, body mass index, energy figures, food, readings, declared conditions or anything derived from them. That is not a privacy setting, it is the shape of the data: those things are never part of a team view to begin with, so there is no switch that could expose them.

Aggregates are reported only above a minimum group size. Below that floor, "aggregate" is a thin disguise — in a team of three, an average is three people identified.

## No employer dashboard, and no plan for one

The most requested feature we have refused is a dashboard showing an employer how its individual employees are doing. It is requested in good faith, usually by somebody who wants to help the people who are struggling.

It still cannot exist. An employer holding individual health engagement data has a power over an employee that no consent checkbox makes symmetrical, and the moment that dashboard exists it will be used in a conversation about somebody performance. What an organisation gets is aggregate figures above the k-anonymity floor, which is the only version of this that is reasonable for them to hold.

This costs sales. It is also the reason a link worker or an occupational health team will recommend the platform at all, and that recommendation is worth more than the dashboard.

## Prohibited mechanics, written down

A list of mechanics this product will not use is published rather than implied: no ranking of people by body metrics, no streak that punishes, no comparison between members, no competitive framing of weight, no scarcity pressure, no loss-framed language.

They are assertions in a test file rather than paragraphs in a policy, which is the only version of an ethical commitment that survives a quarter where the numbers are bad. A build that violates one does not deploy.

## What a challenge feels like as a result

Quieter than the category standard. There is no confetti for beating a colleague and no notification telling you somebody has overtaken you. What there is: a team that can see it is collectively turning up, a score you can move from any starting point, and credit for helping somebody else move theirs.

That is a less exciting product demonstration. It is a considerably better thing to be enrolled in without having asked.`,
  },

  {
    title: 'Wearable integration, and why none is connected yet',
    slug: 'seven-wearables-and-what-each-waits-for',
    description:
      'Seven devices are listed on our wearables page and not one can be connected today. The ' +
      'table says what each is waiting for instead of hiding it.',
    category: 'Engineering',
    keyword: 'wearable integration',
    secondaryKeywords: ['health data', 'device sync', 'product honesty'],
    internalLinks: ['/wearables', '/how-it-works', '/privacy', '/status', '/developers'],
    faq: [
      {
        q: 'Which devices can I connect right now?',
        a: 'None of them. Seven are listed with what each one is waiting for, and the page says plainly that not one can be connected today rather than leaving you to find out by pressing a button.',
      },
      {
        q: 'Will the platform work without a device?',
        a: 'Yes. A connection improves the estimate and never gates the experience. Readiness falls back to your declared schedule, device inactivity and your own check-in.',
      },
      {
        q: 'What happens to the data if I disconnect later?',
        a: 'Four guarantees are published on the page, including that revoking a connection stops the collection and that what was already derived does not silently persist as though it were still current.',
      },
    ],
    body: `Wearable integration is listed on our wearables page as seven devices, and the page states in its third paragraph that not one of them can be connected today. That is an odd thing to publish and it is the most defensible thing on the page, because the alternative is a grid of logos implying seven integrations we do not have.

## What wearable integration actually requires

A logo is not an integration. Each one needs an approved developer application, a review process that varies from weeks to months, a scope negotiation about exactly which fields are read, an authorisation flow, a token refresh path, a revocation path that genuinely stops collection, and a data mapping that does not quietly treat one vendor step count as equivalent to another.

The last column of our table says which of those each device is waiting on. Not a status badge, not "coming soon" — the actual blocker, named. A reader deciding whether to rely on this platform can tell the difference between a device waiting on an approval queue and one waiting on a decision we have not made.

## Why it is written down rather than left out

The easy version of this page lists the seven, uses present-tense verbs, and lets a reader assume. Nobody lies outright; the page simply does not say which direction the arrow points. We have all read that page on other products, and the discovery that the integration does not exist arrives after signing up.

So the page says it. It costs us the impression of a larger product and buys the only thing worth having on a page about health data, which is that a reader can believe the rest of it.

It also means the endpoints behind this are visible as unbuilt rather than hidden. An internal check lists routes the interface cannot reach, and five of them are the wearable endpoints. They show up every time it runs. That is the correct amount of discomfort for a feature that is specified and not finished.

## What the platform does without a device

A connection improves the estimate and never gates the experience, and this is the part most products get backwards. Readiness is inferred from a declared schedule, from the device having been still, and from your own check-in — and where a signal is missing the engine widens its uncertainty rather than pretending to know.

That design came first precisely because most people do not own one of the seven. Building for the device and degrading to nothing is how a product ends up only working for people who already had the gear.

## The four guarantees on disconnecting

Published on the same page: revoking stops the collection rather than pausing it; the scopes granted are listed individually rather than bundled; what was derived while connected does not persist as though it were current; and the connection is revocable from inside the account rather than only at the vendor.

Those are easy to write before an integration exists, which is exactly why they are written now. Committing to them while nothing is connected is a cheap promise to make and an expensive one to break later — the right order.

## When this changes

It changes when a device can actually be connected, and the table column changes with it. Until then the page keeps saying no, the status page keeps listing the engine as unmonitored rather than operational, and the honest version of this article remains the one in which the answer to "which can I use" is none.

If you came here looking for a product that already syncs your watch, this is not it yet. If you came looking for one that tells you the truth about what it does, the seven rows with their blockers are the best evidence on the site.`,
  },

  {
    title: 'Showing the compute cost of every answer we give',
    slug: 'you-can-see-what-the-compute-costs',
    description:
      'Running a model costs real money, and most products hide it inside a subscription. We ' +
      'show the compute cost, meter it, and refuse to let anything mint credit.',
    category: 'Engineering',
    keyword: 'compute cost',
    secondaryKeywords: ['usage metering', 'transparent pricing', 'idempotency'],
    internalLinks: ['/developers', '/account', '/privacy', '/how-it-works', '/status'],
    faq: [
      {
        q: 'Why show the cost at all?',
        a: 'Because the alternative is a flat price with an invisible cap, and a member who cannot see the meter cannot tell the difference between a limit and a defect. The figure is published so the ceiling is legible.',
      },
      {
        q: 'Can a repeated payment notification give me credit twice?',
        a: 'No. Every money event is keyed so that a redelivery is recognised and recorded as a duplicate. A repeated notification returns the same answer and changes no balance.',
      },
      {
        q: 'Can anything create allowance out of nothing?',
        a: 'No. Nothing in the platform may mint allowance — it is one of a small set of rules checked by an automated probe that attacks the running system rather than reading the code.',
      },
    ],
    body: `Every answer this platform generates has a compute cost, and that cost is real money paid to somebody. Most products bury it inside a subscription and enforce an invisible cap, which works until a member hits the cap and cannot tell whether they have reached a limit or found a defect. We publish the figure instead.

## A unit, so the meter is legible

Usage is counted in a single internal unit with a published rate, and the account screen shows what has been spent and what remains. Underlying provider prices are held in one place in the shared package, so the figure the platform charges itself and the figure a member sees cannot drift apart.

This has an obvious commercial downside: a visible meter invites a member to think about cost, which a flat subscription never does. The upside is that when something is unavailable the reason is a number they can see rather than a shrug, and the support conversation is about the ceiling rather than about whether the product is broken.

Everything stays available at the floor. Unconfigured providers are skipped rather than failing, so the platform starts and serves with no provider keys at all; the only thing that degrades is the part that genuinely needs one.

## Money is idempotent, and that is a tested claim

Payment notifications arrive more than once. That is normal, documented behaviour from any payment provider, and a system that treats a redelivery as a new event will eventually credit somebody twice.

So every money event is keyed on the provider identifier and the outcome recorded against it. Send the same notification again and the answer is the same answer, with the outcome *duplicate* and the balance unchanged. Reversals are keyed too, with a uniqueness constraint in the database on the pair, because five deliveries of one refund claimed it once in testing and would have claimed it five times without the constraint.

An automated probe checks sixteen of these properties against the running system rather than reading the source: a repeated notification creates no repeated money, an unsigned notification is refused, a forged one is refused, compute delivered and not charged for is recorded rather than quietly absorbed.

## Nothing may mint allowance

The hardest rule is the simplest to state: no path anywhere may create allowance out of nothing. Not an administrative endpoint, not a promotional grant, not a retry, not a well-intentioned fix for a support ticket.

It is checked adversarially, from outside, by a script that attempts exactly that among thirty-odd other attacks — reaching another member balance, opening an administrative surface, bypassing a guard with a type the validator did not expect. Pointed at the wrong address, that script reports every single attempt as a reachable hole, which is a useful reminder that a security check which cannot connect looks identical to a security check that found everything open.

## Grants expire, and the label says the amount it granted

Two defects worth recording because both were visible on a member screen. An expired grant was shown as live, because the query filtered on remaining balance rather than on expiry. And a label interpolated the current grant size rather than the size of the grant it described, so an old fifty-unit grant was labelled with today figure.

Neither was a maths error. Both were a display reading from the wrong place, which is the category of defect that an accounting test does not catch and a member notices immediately.

## Why publish any of this

Because a platform asking somebody to trust it with food records and body readings is asking for more trust than a platform asking for a card number, and the only way to earn that is to be legible about the unglamorous parts. A meter you can read, a notification that cannot pay twice, and a rule that nothing creates credit from nothing are not features anybody chooses a product for. They are the reason it is reasonable to choose one at all.`,
  },
];
