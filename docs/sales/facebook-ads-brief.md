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
