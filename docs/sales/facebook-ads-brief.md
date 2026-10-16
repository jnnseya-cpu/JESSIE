# Facebook and Instagram ads — creative brief

Five prompts for image generation, one prompt for ad copy, and the rules
that make the difference between an ad that runs and an ad that gets
rejected twice and then throttled.

Read the three constraints first. They are not style preferences; two of
them are enforced in this repository and the third is enforced by Meta.

---

## Constraint 1 — this product may not use the vocabulary of its category

`BANNED_LEXICON` in `packages/shared/src/metering.ts` forbids, in any
member-facing copy:

> workout · burn · calories · fat · weight loss · slim · toned · bikini ·
> guilt · cheat day · no excuses · lazy · failure · failed ·
> you lost your streak · don't break the chain

And under `BANNED_LEXICON_STRICT`, for anything a minor may read, also:
body · shape · size · compete · beat · rank.

That removes essentially every stock phrase in weight-loss advertising.
It is a constraint, and it is also the single biggest commercial
advantage in this brief, for the reason in constraint 2.

## Constraint 2 — Meta's health rules, as they stand after July 2026

Meta moved from product-based to claims-based enforcement on 22 July
2026. Three rules decide whether this product's ads survive:

**The personal-attributes rule, which kills most health copy.** An ad may
not assert or imply that it knows something personal about the person
seeing it. "Struggling to lose weight?" is rejected — not for the claim
but for the second person. The test: does the sentence describe the
service, or does it allege a fact about the reader? "Resources for people
managing diabetes" passes where "Are you struggling with diabetes?" does
not. Meta now detects euphemisms semantically, so swapping in a softer
synonym does not get round it.

**Weight loss is a sensitive category** with tighter claim guardrails and
audience age restrictions. Because this product's own lexicon forbids the
phrase, ads written to the lexicon land outside that category by
construction. Do not reintroduce the vocabulary to "be clearer" — it buys
nothing and costs the lighter review path.

**Before-and-after is no longer auto-rejected**, but idealised results
still are, and the pairing with a prohibited claim is what triggers
rejection. Do not run them. This product has no measured outcomes, so any
before-and-after would be fabricated, which is a worse problem than a
policy one.

## Constraint 3 — a named human reviews this before it runs

`CLAUDE.md`: nothing an agent writes about health reaches the public
without a named human reviewer, and there is no draft-to-published edge.
Everything below is a draft. It is a clinical safety control, not a
workflow preference.

Also, before launch:

- **Target 18+.** The platform serves ages 10–100, but the tracking rules
  in `packages/shared/src/tracking.ts` forbid measurement for under-18s,
  and Meta age-restricts this space.
- **Do not advertise the mobile app.** `MOBILE_APP_RELEASED` is `false`.
  Every ad goes to the web.
- **No AI vendor or model name appears anywhere in an ad.**
- The Meta Pixel on the landing page stays consent-gated, public pages
  only, and is never sent an identity. Running ads changes none of that.

---

## What is actually worth saying

Facts, from the code, that a competitor cannot cheaply copy:

| Fact | Where it comes from |
| --- | --- |
| Every movement ships in five versions: standing, seated, chair-supported, bed or recliner, single-limb adaptive | `VARIANT_LABELS`, and the publishing gate refuses anything with fewer |
| A session is 90 to 300 seconds | A `CHECK` constraint in `0001_core.sql`, not a guideline |
| It reads calendar structure and never the titles | `packages/shared/src/calendar.ts` |
| It stays silent when you are driving, on a call, in quiet hours, or past the daily cap | `HARD_BLOCKS` in `context.ts` |
| Six age bands from 10 to 100, each with different mechanics | `AGE_MODE_DEFINITIONS` |
| Free is £0 forever with no card; Premium is £5.99 a month on the web | `core-concepts.ts` |

**On the funnel, because it affects the ask.** Free takes no card at all.
A cold audience converts to "free, no card" far more readily than to
£5.99, and the £5.99 decision is then made by somebody who has already
used the product. Running the card-out ask on a cold audience will cost
more per paying member than running it on the free signup. If you want
the card in the ad regardless, use image 5 and the Premium variant — it
is the Family angle at £12.99 for four people, which is the only offer
here with an obvious value comparison.

---

## The five image prompts

House palette, for every prompt: deep navy `#102a43`, teal `#00a99d`,
lime `#b7e436`, coral `#ff6b5e` as a sparing accent.

Shared negative prompt, append to all five:

> no weighing scales, no measuring tape, no calorie counters, no
> before-and-after split, no gym equipment, no barbells, no treadmills,
> no exposed midriff, no idealised or athletic physique, no sweat, no
> grimacing, no text, no watermark, no logos, no distorted hands, no
> extra fingers

---

### Image 1 — the chair *(lead creative: most ownable, least run)*

> A woman in her late sixties sits at a sunlit kitchen table in a
> comfortable cardigan, mid-movement, both arms raised in a slow relaxed
> reach, eyes closed, a small genuine smile. An ordinary used kitchen
> behind her: a half-finished cup of tea, a newspaper, a plant on the
> windowsill. Photographed on a 50mm lens at f/2.0, soft morning light
> from the left, warm and unstyled, shallow depth of field. Documentary
> photography, not stock. Muted natural palette with a deep navy and
> teal accent in the room's textiles. Calm, dignified, entirely
> unremarkable in the best way. Square 1:1.

**Why it works.** Every competitor's creative assumes the viewer can
stand up. This is the one image in the category that says otherwise, and
it is true: the publishing gate refuses a movement that does not ship a
seated version. It also reaches the 40–64 and 65–79 bands, which the
category systematically ignores.

### Image 2 — ninety seconds

> Overhead flat-lay on a deep navy desk surface. A single analogue
> stopwatch showing ninety seconds, beside a closed laptop and a mug. One
> hand reaching into frame, relaxed, mid-stretch. Hard directional light
> from the upper right casting a long clean shadow. Minimal, graphic,
> generous negative space on the left third for headline text. Teal and
> lime accents only. Editorial product photography, crisp, high contrast.
> Vertical 4:5.

**Why it works.** The stopwatch is the whole proposition in one object,
and the negative space is where the headline goes without burning text
into the image.

### Image 3 — the phone that stayed quiet

> A phone lying face down on a passenger seat in a car, late afternoon
> light through the windscreen, the driver's hands visible on the wheel,
> out of focus in the background. Nothing is happening. Still, quiet,
> cinematic. Shot on 35mm film, grain visible, desaturated with a cool
> navy-teal cast. The composition is deliberately uneventful. Vertical
> 4:5.

**Why it works.** It is the only image in a wellness feed where nothing
happens, which is exactly why a thumb stops on it. It carries the
strongest differentiator — the engine records a decision not to interrupt
as a success — and that is checkable in `HARD_BLOCKS`.

### Image 4 — the gaps

> A week-view paper diary on a desk, dense with handwritten appointments,
> with three small gaps between entries marked in bright lime highlighter.
> Top-down, slightly angled, natural window light, a pen resting across
> the page. Realistic handwriting, indistinct and unreadable. Warm wood
> desk, navy notebook beside it. Honest documentary still life. Square
> 1:1.

**Why it works.** The handwriting must be unreadable — that is the point.
The product reads start, end, busy or free, attendee count and recurrence,
and never the title. Make sure the generator does not produce legible
entries; regenerate if it does.

### Image 5 — ten to a hundred *(the Family ask)*

> A grandfather in his seventies and a child of about nine, both
> mid-movement in a bright living room, arms up, laughing, caught
> mid-motion with slight blur. Neither is performing for the camera.
> Ordinary home: sofa, rug, toys at the edge of frame. 35mm, f/2.8,
> bright bounced daylight. Warm, loose, candid family photography.
> Navy and lime in the soft furnishings. Vertical 4:5.

**Why it works.** This is the only creative that justifies the £12.99
Family price in a single frame, and six age bands from 10 to 100 is a
true and unusual claim. Check that the child is clearly incidental to a
family scene rather than the subject of a health message.

---

## The ad copy prompt

Paste this whole block into your copy generator. It is written so that
the output needs editing for taste, not for compliance.

```
You are writing Facebook and Instagram ad copy for Jess Move
(jessmove.com), a UK movement and food-intelligence platform. Write in
British English.

THE PRODUCT, AND ONLY WHAT IS TRUE
- Short movement sessions of 90 to 300 seconds, built into the day a
  person already has.
- Every movement ships in five versions — standing, seated,
  chair-supported, bed or recliner, and single-limb adaptive. A movement
  that does not have all five is not published. There is no override.
- It reads calendar structure only: start time, end time, busy or free,
  attendee count, whether it recurs. Titles are never transmitted,
  never logged, never sent to a model.
- It stays silent while someone is driving, on a call, in quiet hours,
  past a daily limit, or flagged to rest. A prompt it decides not to
  send is recorded as a success.
- Six age bands, ten to a hundred, each with different mechanics.
- Free is £0 forever and takes no card. Premium is £5.99 a month at
  jessmove.com. Family is £12.99 a month for up to four people.

HARD RULES — a violation means the copy is unusable
1. Never use: workout, burn, calories, fat, weight loss, slim, toned,
   bikini, guilt, cheat day, no excuses, lazy, failure, failed. No
   synonym or euphemism for them either.
2. Never assert or imply anything about the reader's health, appearance
   or circumstances. No "struggling with", no "still carrying", no
   "tired of". Describe the service; never diagnose the audience. If a
   sentence could only be true if you knew something private about the
   reader, rewrite it.
3. No results, no outcomes, no numbers of users, no testimonials, no
   "join thousands". There are no customers yet and no measured results.
   Inventing either is prohibited.
4. No before-and-after framing and no idealised appearance.
5. No medical claim, and no suggestion of diagnosis or treatment.
6. Never name an AI vendor or model.
7. Do not mention a mobile app. It has not been released.
8. No shame, no urgency manufactured from fear, no countdown that is not
   real.

TONE
Plain, specific, quietly confident. Short sentences. Concrete nouns. The
most persuasive thing available is a fact a competitor cannot copy, so
lead with one of those rather than with an adjective. Never cheerful at
the reader. Assume an intelligent adult who has bought a wellbeing app
before and stopped using it in a fortnight.

OUTPUT
For each of the five angles below, produce:
- Primary text: 2 versions, one under 125 characters and one of 2 to 3
  short sentences.
- Headline: 3 versions, each 40 characters or fewer.
- Description: 1 version, 30 characters or fewer.
- The call to action button to use, from: Learn more, Sign up, Get offer.

THE FIVE ANGLES
A. Nobody is excluded. Five versions of every movement, including one
   for a chair and one for a single limb.
B. Ninety seconds. The unit of the product, against the hour nobody has.
C. It knows when to say nothing. Silence as a feature, not a gap.
D. It reads the calendar and never the titles. Privacy as the product.
E. Ten to a hundred, one household. The Family angle at £12.99 for four.

For angles A to D the offer is the free tier: £0, no card. For angle E
the offer is Family at £12.99 a month. Say the price plainly in the copy
for E; do not bury it.
```

---

## Testing order, and what to watch

Run A, B and C first against a cold 40–64 audience. A is the hypothesis
most likely to win and the only one a competitor cannot answer within a
quarter. Keep D in reserve for retargeting, where privacy objections
actually surface, and E for lookalikes off the free signups once there
are enough of them to build one.

Judge on cost per free signup, not on click-through. A health ad with a
high click-through and a low signup rate usually means the copy promised
something the landing page does not, and on this product that is a
correctness problem rather than a funnel one.

**Before any of this goes live**, a named human reviews the copy. Record
who, and when.

---

# The copy, written

The section above is the guardrail. This is the creative. Thirty lines,
run through `bannedTermsIn` and through the personal-attributes test
sentence by sentence.

The punch does not come from adjectives, because the adjectives in this
category are exhausted and nobody reads them. It comes from saying a
specific, checkable, slightly uncomfortable thing that no competitor in
the feed is able to say back. Every line below is a fact from the code.

---

## A — Nobody is excluded *(lead)*

**Primary text, short**
> Most movement apps assume everyone can stand up. This one ships five
> versions of every move.

**Primary text, long**
> Five versions of every single movement: standing, seated,
> chair-supported, bed or recliner, and one-limb adaptive.
>
> Not one version with things taken out — a good seated movement uses
> the chair.
>
> If a movement doesn't have all five, it never gets published. There is
> no override button, and no admin can press one.
>
> Free. £0. No card.

**Headlines**
> Five versions. No exceptions.
> One of them is done sitting down.
> Built for the people usually left out

**Description** · `Free, and it takes no card`
**Button** · Sign up

---

## B — Ninety seconds

**Primary text, short**
> A session is 90 seconds. Reading this ad takes longer.

**Primary text, long**
> Ninety seconds to five minutes. That's the whole session.
>
> It isn't a marketing round-down either — it's a rule in the database.
> Anything longer than five minutes is not permitted to exist in the
> library.
>
> Nobody skips 90 seconds because they ran out of time.
>
> Free. £0. No card.

**Headlines**
> 90 seconds. That is the session.
> Shorter than this advert
> No hour to find. There isn't one.

**Description** · `Free, and it takes no card`
**Button** · Sign up

---

## C — It knows when to say nothing

**Primary text, short**
> Most apps count the notifications they sent. This one counts the ones
> it held back.

**Primary text, long**
> It stays quiet while someone is driving. On a call. In quiet hours.
> Past the daily limit. Flagged to rest.
>
> And when it decides not to speak, that gets recorded as a success —
> not as a delivery it missed.
>
> Which is the opposite of how every other app in your pocket is scored.
>
> Free. £0. No card.

**Headlines**
> It counts its silences
> The one built to interrupt less
> A prompt it holds back is a win

**Description** · `Free, and it takes no card`
**Button** · Learn more

---

## D — The calendar it never reads

**Primary text, short**
> It reads the gaps in a calendar. It never reads the titles. Not once.

**Primary text, long**
> Start time. End time. Busy or free. How many people. Whether it
> repeats.
>
> That is the entire list. The title of a meeting is never transmitted,
> never logged, and never sent to a model.
>
> A one-to-one and a board review look identical to us. That costs us
> accuracy, and we take the worse suggestion instead.
>
> Free. £0. No card.

**Headlines**
> We read the gaps, not the titles
> Your 3pm stays yours
> Accuracy we gave up on purpose

**Description** · `Free, and it takes no card`
**Button** · Learn more

---

## E — Ten to a hundred, one household *(the paid ask)*

**Primary text, short**
> Six settings from ten to a hundred. A nine-year-old and an
> eighty-year-old are not sent the same thing.

**Primary text, long**
> Six age settings, ten through to a hundred. Different mechanics,
> different daily limits, different safety rules at each one — derived
> from a verified age band, never chosen from a menu.
>
> A child is never shown a number about themselves. That isn't a setting
> a parent switches on. It cannot be switched on.
>
> £12.99 a month, up to four people.

**Headlines**
> Ten to a hundred. One household.
> £12.99 a month, for four people
> One app the whole house can use

**Description** · `£12.99 a month for four`
**Button** · Get offer

---

## Why these lines and not warmer ones

Four deliberate choices, so they survive the next person who edits them.

**Every hook is a comparison the category loses.** "Most movement apps
assume everyone can stand up" works because the reader has met those
apps. Nothing is claimed about the reader — only about the competition,
which the personal-attributes rule has no view on.

**The uncomfortable detail is the proof.** "There is no override button,
and no admin can press one" is more persuasive than any adjective,
because it is the kind of thing a company only says when it is true.
"Accuracy we gave up on purpose" works the same way: a cost admitted is
the cheapest credibility available to a brand with no track record.

**The price is in the copy, not hidden behind the click.** "£0. No card."
does more work on a cold audience than any urgency device, and it is the
only honest urgency available — there is no deadline, so inventing one
would be the one thing that makes the rest unbelievable.

**No second person about the reader's state.** Count them: "you" appears
as possession of a diary and a pocket, never as a condition. That is the
line Meta's semantic detection is actually watching, and it is also the
line that separates this from every ad the reader has learned to scroll
past.

## What to do with the long and short versions

Short goes in first. Facebook truncates mobile primary text at roughly
125 characters, so the short version is the whole message and the long
version is what somebody reads after tapping "see more" — which they only
do if the first line earned it.

Run A, B and C as the opening test. A is the hypothesis most likely to
win and the only one a competitor cannot answer this quarter.

**Still a draft.** A named human reviews this before it runs, and that
review gets recorded. The constraint is a clinical safety control.

---

# Campaign two — the food record

Asked for the plate side of the product, punchier, and aimed at the card
rather than the free signup. Three things make that reasonable here, and
one of them is a conflict that has to be settled before anything runs.

## The conflict: `calories` is in the banned lexicon

It is, and the product's own FoodLens page opens with it:

> **A photograph cannot tell you the calories. So we stopped pretending.**

That is not a slip. The lexicon is enforced on blog posts through
`seoAudit`, and on agent-written drafts through `assertEditorialSafe`.
Marketing pages are not gated by it, and the word there is doing the
opposite of diet-culture work: it names the thing being refused.

**Every line below that uses the word has a clean alternative beside it.**
The reviewer picks. Using the word inside a refutation is defensible and
matches the live site; using it to promise counting is not, and nothing
here does.

## Why these ads can ask for the card

The movement ads sell the free tier because movement is free. Food is
not: `core-concepts.ts` puts the AI features in Premium, and Free "runs
on the pre-authored library". So the thing being advertised is the thing
behind the paywall, which is the one honest reason to put a price in a
cold ad.

The allowance, computed through the same pricing path the gateway uses,
not from a marketing round number:

| | Analyses | Price |
| --- | --- | --- |
| Free tier | 30 a month, for 2 months, then it stops | £0, no card |
| Premium | 119 a month | £5.99 a month |

Sixty free plate reads is a trial somebody can actually judge. A hundred
and nineteen a month is roughly four a day against about ninety meals.

## The facts worth advertising

Verified in `packages/foodlens` this session, not recalled:

| Fact | Source |
| --- | --- |
| A photo returns a range. 420 likely becomes **336–504** | `estimate()` — `isExact` is false for a visual source |
| A verified label collapses to a single figure | `evidenced()` returns 420/420/420, confidence `verified` |
| Seven ranked evidence sources, five confidence levels | `EVIDENCE_SOURCES`, `CONFIDENCE_LEVELS` |
| Twelve readings on a plate, and no composite score | `WHEEL_DIMENSIONS`; `a_single_composite_health_score` is in `NEVER_CLAIM` |
| It will not say movement cancels food | `that_movement_cancels_out_food` in `NEVER_CLAIM`; the forbidden sentence is spelled out in `MOVEMENT_PAIRING_COPY` as "Walk for 20 minutes to burn off the burger" |
| It cannot call food bad, junk, cheat, guilty, sinful, clean or toxic | `BANNED_FRAMINGS` |
| On allergens it says it cannot tell | `ALLERGEN_UNKNOWN_COPY`, against all 14 UK allergens |
| No energy figure to anyone under 18 | FoodLens page, and `bodySurfacePolicy` for the wider rule |

**One claim I will not let you make.** `FalsePrecisionError` and
`ForbiddenClaimError` are exported and nothing anywhere throws either.
"It throws an error rather than guess" would be a lovely line and it is
not true today. The behaviour underneath it is true — a photo gets a
range, a label gets a number — so advertise the behaviour.

---

## Five image prompts — the plate set

Same house palette and same shared negative prompt as campaign one, plus:
**no calorie counters, no nutrition labels large enough to read, no
scales, no portion-control containers, no "healthy vs unhealthy" split.**

### Image 6 — one real plate *(lead)*

> Overhead photograph of an ordinary weeknight dinner on a plain white
> plate: a burger, a scattering of chips, a small undressed salad to one
> side. Honest home lighting from a kitchen window, slightly overcast.
> Shot on 50mm at f/4, crisp and flat, shallow vignette. The food looks
> real and slightly imperfect, not styled — a chip out of place, a smear
> of sauce. Deep navy placemat under the plate, generous empty space
> above for a headline. Documentary food photography, no gloss.
> Square 1:1.

**Why it works.** Every food ad in the feed shows a perfect bowl of
berries. This shows a burger and refuses to be ashamed of it, which is
the product's actual position. The space above the plate is where the
range goes as editable text.

### Image 7 — the range

> Two identical photographs of the same bowl of pasta side by side in one
> frame, one very slightly sharper and one very slightly softer, almost
> imperceptibly different. Overhead, cool even daylight, navy background.
> Minimal and conceptual, like an editorial illustration of uncertainty.
> Generous negative space to the right. Teal accent only. Square 1:1.

**Why it works.** It is a picture of "we are not sure, and we will say
so", which is the entire differentiator against every counter on the
market. Pair with the range headline.

### Image 8 — the barcode

> A hand holding an ordinary supermarket food packet at arm's length,
> the barcode facing the camera, kitchen counter blurred behind. Sharp
> focus on the barcode strip, everything else soft. Warm overhead
> kitchen light, late evening. 35mm, f/2.0. The packet is generic with
> no readable brand. Navy and lime in the background objects.
> Vertical 4:5.

**Why it works.** The barcode is the moment the range collapses to a
number. It carries "a label gets you a figure, a photo does not" in one
object, and it photographs well.

### Image 9 — what it will not say

> A plate of chips and a pair of trainers side by side on a wooden
> kitchen floor, shot from above, deliberately absurd in their pairing.
> Natural window light, soft shadows, muted palette with a coral accent
> on the trainers. Clean, graphic, a little wry. Editorial still life.
> Square 1:1.

**Why it works.** The image sets up the joke the copy lands: this is the
pairing the product is built to refuse. Everyone recognises the logic of
"walk it off" and nobody enjoys it.

### Image 10 — the teenager's kitchen *(parent angle)*

> A teenager of about fifteen eating cereal at a kitchen counter,
> half-listening, phone face down beside the bowl. Morning light, school
> bag on the floor, ordinary family clutter. Candid, unposed, the
> teenager mid-sentence and not looking at the camera. 35mm, f/2.8, warm
> natural tones with navy in the units. Documentary family photography.
> Vertical 4:5.

**Why it works.** The phone is face down and no screen is visible — the
point being that a number is never shown to this person. Parents are the
buyer here, not the teenager, and this is the only frame in the set that
reaches them.

---

## The copy, written

Where a line uses the word `calories`, the lexicon-clean alternative sits
under it as **Clean**. Pick one per ad; do not run both.

### F — A photograph cannot count *(lead)*

**Primary text, short**
> A photograph cannot tell you the calories. So we stopped pretending.
>
> **Clean** · A photograph cannot count your dinner. So we stopped
> pretending it can.

**Primary text, long**
> Photograph a plate and you get a range: 336 to 504, the evidence it
> used, and how sure it is.
>
> Scan the barcode on the packet and the range collapses to one figure,
> because now there is a label behind it.
>
> It will not hand you the photograph's number as though it came from the
> label. That is the whole product.
>
> Thirty plates a month, free, for two months. No card.

**Headlines**
> We show a range. On purpose.
> 336–504, and why
> The number nobody can actually see

**Description** · `30 free plates a month`
**Button** · Sign up

### G — It will never tell you to walk it off

**Primary text, short**
> It will never tell you to walk off your lunch. That sentence is on a
> list of things it is not allowed to say.

**Primary text, long**
> "Walk for 20 minutes and work off the burger."
>
> That exact sentence sits in the code as an example of what this engine
> may not produce. Food is not a debt and movement is not a repayment.
>
> It also cannot call a meal bad, junk, cheat, guilty, sinful, clean or
> toxic. Those seven words are blocked, not discouraged.
>
> Thirty plates a month, free, for two months. No card.

**Headlines**
> Food is not a debt
> Seven words it cannot say
> No punishment attached

**Description** · `30 free plates a month`
**Button** · Learn more

### H — Twelve readings, no score

**Primary text, short**
> Twelve readings on a plate. No score out of ten, because a plate is not
> one number.

**Primary text, long**
> Protein. Fibre. Plant variety. Sugar. Salt. Processing. Portion.
> Personal fit. Allergen confidence. And three more.
>
> Twelve separate readings, each with its own confidence level — and
> deliberately no single score, because collapsing twelve honest readings
> into one tidy figure is how an app ends up lying to you politely.
>
> Thirty plates a month, free, for two months. No card.

**Headlines**
> Twelve readings. No score.
> A plate is not one number
> Twelve answers, not one verdict

**Description** · `30 free plates a month`
**Button** · Learn more

### I — It says when it cannot tell

**Primary text, short**
> On allergens it will say: I cannot tell from a photograph. Check the
> packet.

**Primary text, long**
> Fourteen allergens, and a photograph cannot confirm the absence of a
> single one of them.
>
> So when the source is not verifiable it says exactly that — check the
> packet, or ask, especially if a reaction would be serious.
>
> An app that is confident about everything is an app that has not
> thought about this.
>
> Thirty plates a month, free, for two months. No card.

**Headlines**
> "I cannot tell from a photo"
> Confident only where it should be
> 14 allergens. No guessing.

**Description** · `30 free plates a month`
**Button** · Learn more

### J — The paid ask

**Primary text, short**
> 119 plate readings a month for £5.99. About four a day, against roughly
> ninety meals.

**Primary text, long**
> £5.99 a month. That buys 119 plate readings — comfortably more than
> most people eat.
>
> Every one returns a range rather than a fake figure, twelve readings
> rather than a score, and an honest "cannot tell" where a photograph
> genuinely cannot.
>
> Nobody under 18 is ever shown an energy figure, whatever anybody
> switches on.
>
> Start on the free tier if you would rather. Thirty a month, no card.

**Headlines**
> 119 plates a month, £5.99
> £5.99. About four a day.
> Less than two coffees a month

**Description** · `£5.99 a month`
**Button** · Get offer

---

## Running order

F first, against a cold 30–55 audience. It is the only hook in the
category that argues *against* precision, and arguing against the thing
everyone else sells is the cheapest attention available.

G is the one most likely to be shared, which makes it the cheapest
reach. H and I are the retargeting pair — they answer the objection
"another food app" after somebody has clicked once and not signed up.

J runs last and only to people who have already seen F or G. A price in
a cold ad for a feature nobody has experienced is the most expensive
click in this set.

Judge F, G, H and I on cost per free signup. Judge J on cost per paid
conversion, and expect it to look bad in week one — it is a retargeting
ad wearing a prospecting ad's clothes until there is an audience to
retarget.

**Still a draft.** A named human reviews this and records the review.
The `calories` decision above is theirs, not mine.

---

# FINAL SET — five images with their headlines, and one copy prompt

Supersedes the running order in both campaigns above. Five prompts, each
carrying the headline that goes on the picture, chosen across movement
and the food record.

**Correction to earlier guidance in this file.** It said to keep text out
of the image because overlay hurts delivery. That was wrong: Meta removed
the 20% text rule in 2020 and does not penalise overlay in auctions or
delivery. Short text on the image is standard and fine. Ad policy still
applies to what the text says.

**Headlines are five words or fewer on purpose.** Image models garble
long strings. If your generator renders the text badly, generate the
photograph clean and set the headline in Canva — every prompt below says
where the space for it is.

**Logo**: `docs/brand/mark-mono-white.svg` over photography,
`docs/brand/jess-move-logo.svg` on plain navy or white. Bottom left,
small.

---

## 1 · A range. Not a guess. *(lead — the food record)*

> **Headline on image:** A RANGE. NOT A GUESS.

> Overhead photograph of an ordinary weeknight dinner on a plain white
> plate — a burger, a scatter of chips, a small undressed salad. Honest
> kitchen window light, slightly overcast, no gloss. Shot on 50mm at
> f/4, flat and crisp, the food real and a little imperfect: a chip out
> of place, a smear of sauce. Deep navy placemat. The plate sits in the
> lower two thirds; the top third is clean empty navy for a headline.
> Documentary food photography, not styled. Square 1:1.

**Why this leads.** Every food app in the feed sells a precise number. A
photograph cannot produce one, and this is the only product in the
category that says so and shows 336–504 instead. Arguing against
precision, in a category built on fake precision, is the cheapest
attention available.

**Sub-line, under the headline:** *A photo gets you a range. A barcode
gets you a figure. We won't pretend they're the same.*

---

## 2 · Food is not a debt.

> **Headline on image:** FOOD IS NOT A DEBT.

> A plate of chips and a pair of trainers side by side on a wooden
> kitchen floor, shot from directly above, deliberately absurd in their
> pairing. Natural window light, soft shadows, muted palette with one
> coral accent on the trainers. Clean, graphic, slightly wry. Wide empty
> floor to the right for the headline. Editorial still life. Square 1:1.

**Why it works.** "Walk for 20 minutes and work off the burger" is
written into the codebase as an example of what the engine may not
produce. Everyone recognises that logic and nobody enjoys it. This is
the most shareable thing in the set, which makes it the cheapest reach.

**Sub-line:** *It will never tell you to walk off your lunch. That
sentence is on a list of things it cannot say.*

---

## 3 · Five versions. One sits down.

> **Headline on image:** FIVE VERSIONS. ONE SITS DOWN.

> A woman in her late sixties at a sunlit kitchen table in a comfortable
> cardigan, mid-movement, both arms in a slow relaxed reach, eyes
> closed, a small genuine smile. An ordinary lived-in kitchen behind
> her: half-finished tea, a newspaper, a plant on the sill. 50mm at
> f/2.0, soft morning light from the left, warm and unstyled, shallow
> depth of field. She sits left of centre; clear wall space to the
> right for the headline. Documentary photography, not stock.
> Vertical 4:5.

**Why it works.** Every competitor's creative assumes the viewer can
stand up. The publishing gate here refuses any movement that does not
ship a seated version, so this is the one claim nobody can answer this
quarter. It also reaches 40–64 and 65–79, which the category ignores.

**Sub-line:** *Standing, seated, chair-supported, bed, one-limb. No
version, no publish.*

---

## 4 · 90 seconds. That's it.

> **Headline on image:** 90 SECONDS. THAT'S IT.

> Overhead flat-lay on a deep navy desk. A single analogue stopwatch
> reading ninety seconds beside a closed laptop and a mug. One relaxed
> hand reaching into frame mid-stretch. Hard directional light from the
> upper right, one long clean shadow. Minimal and graphic, the left
> third entirely empty for the headline. Teal and lime accents only.
> Editorial product photography, high contrast. Vertical 4:5.

**Why it works.** The whole proposition in one object. Ninety to three
hundred seconds is a database rule, not a marketing round-down —
anything longer is not permitted to exist in the library.

**Sub-line:** *Not a rounded-down marketing number. A rule in the
database.*

---

## 5 · 30 plates free. No card. *(the ask)*

> **Headline on image:** 30 PLATES FREE. NO CARD.

> A hand holding a phone over a bowl of pasta on a kitchen counter,
> about to photograph it, seen from slightly behind the shoulder. The
> phone screen is dark and not legible. Warm late-evening kitchen light,
> everything soft except the bowl. 35mm at f/2.0. Navy and lime in the
> background objects. Lower third clear for the headline. Candid,
> unposed, documentary. Vertical 4:5.

**Why it works.** The offer is the hook, and it is real: a free month
buys thirty plate readings, two months, no card at all. Premium is 119 a
month for £5.99 — roughly four a day. Thirty is a trial somebody can
actually judge, which is the honest version of urgency.

**Sub-line:** *Then £5.99 a month for 119, if you want it. Nothing
charged without asking.*

---

## The one copy prompt

```
Write Facebook and Instagram ad copy for Jess Move (jessmove.com), a UK
movement and food-intelligence platform. British English. Five ads, one
per angle below, matching the headline already on each image.

ANGLES AND THEIR IMAGE HEADLINES
1. A RANGE. NOT A GUESS.        — a photo returns 336–504, a barcode returns 420
2. FOOD IS NOT A DEBT.          — it will never tell anyone to walk off a meal
3. FIVE VERSIONS. ONE SITS DOWN. — standing, seated, chair-supported, bed, one-limb
4. 90 SECONDS. THAT'S IT.       — 90 to 300 seconds, enforced in the database
5. 30 PLATES FREE. NO CARD.     — then £5.99 a month for 119 readings

TRUE, AND THE ONLY THINGS YOU MAY CLAIM
- A movement that does not ship all five versions is never published.
  No override, no admin bypass.
- Sessions are 90 to 300 seconds. A rule, not a guideline.
- It reads calendar structure only — start, end, busy or free, attendee
  count, whether it repeats. Titles are never transmitted, logged or
  sent to a model.
- It stays silent while someone is driving, on a call, in quiet hours,
  past a daily limit, or flagged to rest. Silence is recorded as a
  success.
- Photograph a plate and it returns a range with its evidence and
  confidence. Scan a barcode and the range collapses to one figure.
- Twelve readings on a plate and deliberately no single score.
- On allergens it says it cannot tell from a photograph. All 14 UK ones.
- It cannot call food bad, junk, cheat, guilty, sinful, clean or toxic.
- Nobody under 18 is shown an energy figure, whatever is switched on.
- Free: 30 plate readings a month for two months, no card.
  Premium: £5.99 a month, 119 readings. Family: £12.99 for four people.

HARD RULES — breaking one makes the copy unusable
1. Never use: workout, burn, calories, fat, weight loss, slim, toned,
   bikini, guilt, cheat day, no excuses, lazy, failure, failed — or any
   synonym or euphemism.
2. Never assert or imply anything about the reader's health, appearance
   or circumstances. No "struggling with", no "tired of", no "still".
   Describe the service. Never diagnose the audience. If a sentence
   could only be true if you knew something private about the reader,
   rewrite it. Compare against other apps, never against the reader.
3. No results, no outcomes, no user counts, no testimonials, no "join
   thousands". There are no customers yet and nothing has been measured.
4. No before-and-after, no idealised appearance.
5. No medical claim.
6. Never name an AI vendor or model.
7. Do not mention a mobile app. It is not released.
8. No shame, and no deadline that is not real.

TONE
Plain, specific, quietly confident. Short sentences, concrete nouns.
Lead with a fact a competitor cannot copy, not with an adjective. Never
cheerful at the reader. Assume an intelligent adult who has bought a
wellbeing app before and stopped using it within a fortnight. A cost
admitted — "that costs us accuracy, and we take the worse suggestion" —
is more persuasive than any superlative.

OUTPUT, per angle
- Primary text, short: under 125 characters.
- Primary text, long: 2 to 4 short sentences.
- Two extra headlines, 40 characters or fewer, to test against the one
  already on the image.
- Description: 30 characters or fewer.
- Button: Learn more, Sign up, or Get offer.
```

---

**Order:** 1 and 2 first, cold, 30–55. 3 next for the 55+ audience. 4 as
a cheap scroll-stopper. 5 only to people who have already seen another
one — a price in front of a stranger is the most expensive click here.

**Still a draft.** A named human reviews it before it runs.
