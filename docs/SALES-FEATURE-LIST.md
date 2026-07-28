# MOVEQUEST — Feature List for Sales

**Small Moves. Powerful Change.**

*For organic selling and for marketwaros.com. Every claim below describes something that
exists in the product specification and the codebase. Nothing here is aspirational, and
the "What we never claim" section at the end is not optional — it is what keeps this
sellable in the UK.*

---

## The pitch, in one paragraph

MoveQuest is an AI-powered movement, food and body-balance operating system for people aged
10 to 100. It doesn't ask anyone to find an hour, join a gym or rebuild their life. It reads
the day a person already has — work, school, commute, home — finds the two-minute gaps that
are genuinely free, and puts one personalised movement into them. Then it explains why it
chose that one, adapts to what actually got completed, and stays silent when moving isn't
possible. It is the difference between a reminder that fires at the wrong moment and a coach
that knows you're in a meeting.

**The 15-second version:** *Fitness apps compete for the hour you don't have. MoveQuest owns
the two-minute gaps you didn't know you had.*

---

## The problem it solves

Meeting a weekly exercise target does not cancel the risk of spending the rest of the day
sitting. Most people who aren't moving enough are not refusing to exercise — they cannot
commit to something that needs an hour, a changing room and a membership. And generic
"time to stand" reminders fail because they know nothing about the person's day: they fire
while you're driving, teaching, holding a baby or in a meeting you cannot leave. You ignore
them, then you turn notifications off. MoveQuest is built for the gap between what people are
told to do and what their day actually permits.

---

# 1 · The Movement Opportunity Engine

### Nine questions before it says anything
Before a single prompt fires, the engine settles nine things: when you were last active, what
you're doing, where you are, what capability you have, how much time is genuinely free,
whether movement is safe and socially appropriate here, which activity you'll actually
finish, what tone will work, and whether to stay silent altogether. A generic reminder
answers none of these. That's the entire difference in one list.

### The Opportunity Score
Every candidate moment is scored on seven factors that multiply — available time, sedentary
duration, readiness, environmental suitability, safety confidence, completion probability and
personal benefit — minus three penalties: interruption cost, social awkwardness and fatigue
risk. Safety sits in the multiplied half, so a zero there kills the recommendation no matter
how attractive the moment otherwise looks. Below the threshold, the system says nothing.

### Silence is a feature, and it's measured
A notification fired into a moment you cannot move is treated as a defect. It's logged as a
misfire and used to retrain the timing model. "Prompts held back" is a headline metric on
the dashboard — which makes growth conversations slightly awkward and the product
substantially better.

### Seventeen recognised contexts
Office desk, home office, classroom, library, kitchen, bedroom, living room, train, bus,
airport, parked vehicle, care home, hospital waiting area, hotel, outdoors, and public versus
private environments. The engine knows the difference between a stairwell and an open-plan
office, and it suggests accordingly.

### The sedentary timeline
A visual map of the working day showing committed time, gaps found, missions delivered and
prompts deliberately held. It's the single screen that makes people say "oh, I *do* have
time" — because it shows them their own day with the movement already in it.

---

# 2 · MOVA — the AI coach

### It has to explain itself before it's allowed to speak
Every suggestion carries a machine-readable reason trace with three required parts: what
triggered it, what window made it possible, and why this movement rather than another. If
the trace can't be built, nothing is shown. "Why this?" isn't a feature bolted on — it's the
precondition for interrupting somebody at all.

### It shows what it rejected
The card tells you not just what it chose but what it ruled out and why — "standing balance:
no stable support detected", "stairwell walk: 25 minutes isn't enough to get back and
settle". A recommendation only means something next to the options it beat.

### Four presence levels, including completely off
Full coach, compact card, quiet, or off entirely. Turning MOVA off removes **zero**
capability — the full movement library, every chart, the sedentary timeline, export and team
challenges all remain. This is asserted as a build gate, not a promise. And off means off,
including for safety messages: a coach that ignores your setting isn't switched off, it's
just quieter.

### One personality, six voices
The same reasoning arrives in six registers derived from age mode. It's not a tone slider —
each register carries different prohibitions. Explorer Mode never says anything evaluative
about a body; Teen Mode never uses hype or sounds like a parent; Vitality Mode never uses
timers, scores or more than one instruction.

### Seven things it refuses, at any price
It won't diagnose a symptom, invent a movement outside the clinically reviewed library,
override a safety block because you insisted, discuss a child's weight or calories, compare
you with another named person, promise a result by a date, or claim to be human. These are
refusals, not confidence thresholds — a better model doesn't unlock them.

### Colour is never the only signal
MOVA changes colour with context — teal for movement, orange for food, purple for body
reasoning, sky for recovery — and always prints the state name alongside. Somebody who can't
distinguish teal from sky still knows whether they're being coached or warned.

---

# 3 · Micro-Movement

### 90 to 300 seconds, matched to the room you're actually in
Space, noise level, privacy, footwear, clothing, whether there's a stable surface to hold,
and whether you're in a moving vehicle. All of it narrows the library *before* preference is
considered. A movement you love that would have you kneeling on an office floor in a suit is
not offered, however much you love it.

### Yes, footwear
Heels rule out balance work. Socks on a hard floor rule out anything with a pivot. Nobody
else asks, and it's precisely why their suggestions get ignored.

### Every refusal names its reason and its unlock
When something isn't available it doesn't just disappear — it says which constraint failed
("needs floor space", "balance work is unsafe in a moving vehicle") and what would change it
("a counter, a chair back or a wall"). An unexplained refusal is indistinguishable from a
bug.

### Five variants on every movement, or it doesn't ship
Standing, seated, chair-supported, bed or recliner, and adaptive single-limb — each
independently authored, not degraded from the standing version. A movement missing any of the
five stays in draft indefinitely. There is no force-publish flag, no admin bypass and no
override role. **A competitor with a standing-first library cannot retrofit this.**

### The support ladder is a one-way function
Variant selection can only move *down* toward more support, never up. An easier variant is
always safe to substitute; a harder one never is. A reported flare-up drops to the gentlest
variant automatically. In Vitality Mode, standing work is disabled unless a clinician has
cleared it.

### The dose gets smaller when you're struggling
The engine prescribes the largest dose you'll actually complete, not the optimal one, and
escalates by at most 7% a week. When completion slips below 60%, the ask goes *down* — not
louder. That single decision is what separates this from every plan somebody has already
abandoned.

### Variety is enforced
A movement offered in the last 20 hours is suppressed even when it scores best, and two from
the same category in one day is the ceiling. Boredom is the quiet killer in this category.

### 180 authored cue sets per movement
Five variants × six age modes × six cue channels (text, audio, captioned video, haptic,
voice-only). Every movement also carries ten governance fields — contraindications,
accessibility alternatives, balance demand, clinical review status, version history — before
it can exist.

---

# 4 · FoodLens 360°

### Photograph a meal, get an honest answer
A photograph cannot resolve portion size, hidden oil or cooking method exactly. So FoodLens
returns a **range**, its evidence source and a confidence level — and refuses to collapse
that range unless the source is verified. Everyone else invents a tidy number; this is the
one that tells you what the picture couldn't see.

### Six live capture checks before the shutter
Plate detected, lighting quality, item borders, barcode present, second-angle guidance, and
whether a reference object is in frame. Each check that passes narrows the estimate — a fork
for scale and a side-on photo are worth more than any amount of model confidence. The app
asks rather than guessing.

### The processing is visible while it runs
Finding foods → estimating portions → checking preparation → calculating nutrition →
comparing with your pattern → creating alternatives. Six steps, shown, because each one is a
place the answer could go wrong and you deserve to know which produced your number.

### Meal Intelligence — a score for the analysis, not the food
A 0–100 figure for how much the system actually *knows* about this plate. A barcode-scanned
takeaway with a confirmed portion scores high; a home-cooked salad photographed in bad light
scores low. It tells you how much to trust the numbers underneath — and it never rates how
good the food is.

### Twelve dimensions, no composite health score
Energy, protein, fibre, plant diversity, fat quality, sugars, salt, processing, portion,
personal fit, allergen confidence and the estimate's own confidence. There is deliberately no
single "healthy" rating, because one number invites the comparison this product refuses to
make.

### UK front-of-pack traffic lights, with the word printed
Fat, saturates, sugars and salt at the published per-100g thresholds — and each band prints
"Low", "Medium" or "High" beside the colour, because colour alone is not an accessible
signal.

### The macros are checked, not trusted
An Atwater cross-check compares the stated energy against protein, carbohydrate and fat. When
they disagree by more than 12%, the range *widens* rather than one side being picked.

### All 14 UK allergens — and absence is never inferred
A model can be extremely confident there are no peanuts in a photograph and be wrong in a way
that puts somebody in hospital. Only a complete declaration from a verifiable source may say
"absent". Everything else is **unknown**, displayed as a warning rather than a pass.

### The swap ladder starts with the smallest change
Level 1 keeps the meal and reduces one element. "Choose something else" is level 5, a last
resort. Every swap respects culture, budget, local availability, allergies, religion, cooking
skill, family size, preparation time and supermarket access. And a simulated swap carries
*extra* uncertainty, because a meal you haven't eaten can't be known as well as one you
photographed.

### Compared with your own fortnight, never with other people
No cohort comparison, no percentile against other users. That would be a leaderboard about
food. The only useful baseline is the one you set yourself.

### Plant diversity as a count, not a target you're failing
Distinct plants across a rolling week, with new ones named. The empty slots are drawn faintly
and carry no red, because an unfinished week is not a bad one.

### Movement is never framed as cancelling out food
Permitted: *"A short walk may support your movement target and break up sitting after the
meal."* Forbidden: *"Walk 20 minutes to burn off the burger."* The distinction is enforced in
code.

---

# 5 · BodyCommand — body balance

### Nine pathways, of which weight reduction is one
Reduce, Waist, Maintain, Strength Recomposition, Gain Safely, Child Growth, Older-Adult
Independence, Limited Mobility, and Professional Support. The system never assumes a lower
number is better. You choose the pathway, you can change it whenever you like, and you can
switch the whole surface off without losing anything else in the product.

### Trajectory with honest uncertainty
Projections are drawn as a widening cone, not a confident line — because the further out you
look, the less anyone can honestly say. A single line would be a promise nobody can keep.

### Your strongest current blocker, and the minimum effective change
A behaviour waterfall shows what's helping and what's holding you back, then names the one
smallest change that would move it. Not a twelve-point plan — one thing, chosen because it's
the highest-leverage thing available to you this week.

### Safety can only narrow, never widen
Under 18 forces the growth pathway with automation off. Pregnancy or eating-disorder
indicators block automation entirely and route to professional support. In the ranking
formula, safety is a multiplier rather than a weighted term, so it cannot be outvoted by a
high score elsewhere.

### The absolute under-18 rule
No weight, BMI, calorie or appearance framing is ever shown to a person under 18, in any
mode, under any consent setting. The consent switch is not consulted below 18 — there is no
setting that turns it on. Growth, energy, confidence and routine are the frame instead.

---

# 6 · Challenges and team competition

### The fittest person in the room can't win it alone
Team Score is participation (35%), consistency (25%), improvement against your own baseline
(25%) and mutual support (15%). Capability isn't weighted down — it is **absent** from the
formula. A ten-year-old, a wheelchair user and an eighty-eight-year-old contribute on exactly
the same four terms as a marathon runner.

### Output metrics are rejected at the boundary
Steps, distance, pace, VO2 max, calories, weight, BMI, heart rate, watts, reps, load and
personal bests — fourteen field names refused outright, matched by substring so `weeklySteps`
is caught as readily as `steps`. A well-meaning integration cannot quietly reintroduce a
fitness leaderboard.

### A contribution ceiling stops domination
No individual may supply more than 18% of a team's total. In the engine's own numbers, three
genuinely exceptional athletes score 34; twelve ordinary people doing two minutes most days
score 82.

### A challenge no median team can win is not shipped
Every challenge is simulated against a team of entirely median people before release. If they
can't reach the target, it doesn't launch.

### Nobody is ever shown their position from the bottom
Below-median positions are not rendered at all, for anyone. Team standing is visible;
individual ranking within it is not. No leaderboard is ever built on weight or appearance,
and there are no open leaderboards at all in Explorer or Teen Mode.

### Stepping out costs your team nothing
Illness, a flare-up, bereavement, a new caring responsibility, three days of declining, or
any safety escalation triggers automatic withdrawal from competitive mechanics. Participation
is measured against *active* members, not the roster — so your absence cannot drag colleagues
down, and nobody is told why you left.

### Eight ready-made challenge formats
Meeting Breakers, Lunchtime Lift, School Class Quest, Family Weekend Expedition, Care Home
Garden Journey, UK City Movement League, Charity Movement Month, and The Return — which
scores only teammates brought back after a lapse. Charity Movement Month has no losing team.

---

# 7 · Wearables and integrations

### Seven providers, none of them required
Apple Health, Health Connect, Fitbit, Garmin, Samsung Health, Oura and Polar. A wearable
improves the estimate; it never gates the product. The floor of MoveQuest is a phone that can
receive a text message.

### Two never let your data leave the phone
Apple Health and Health Connect classify on-device and hand over a summary. The table states
plainly which providers already hold your data in their own cloud, rather than implying a
difference that doesn't exist.

### Nine data types deliberately refused
ECG traces, blood oxygen, blood glucose, blood pressure, detailed cycle data, fertility
indicators, medication logs, GPS route history and continuous raw heart-rate series. Each
would either edge the product toward a medical-device claim or create a re-identification
surface that no movement recommendation is worth.

### Every switch says what turning it off costs
Revoke sleep data and Low Energy Day is triggered by your check-in instead of automatically —
the logic is unchanged, it just asks rather than infers. Each scope names what gets less
precise *and* what carries on working. A consent screen that only lists losses is designed to
stop you leaving.

### Stale readings are labelled, not used silently
Past three hours a reading is marked stale. A confident number from this morning is worse
than an honest gap.

### When two watches disagree, it says so
Resolution is deterministic — freshest first, then on-device over cloud. And when sources
disagree by more than 15%, the engine stops picking a winner and widens its own uncertainty
instead.

### Disconnecting is four guarantees, shown before you connect
Immediate effect with no sync cycle or support ticket; ingested data deleted within 24 hours;
never disables another provider or the product; reconnecting later starts fresh rather than
restoring old history.

---

# 8 · Six age modes — genuinely one product for 10 to 100

Mode is derived from a verified age band plus a capability profile. It is never chosen
freely, because it governs safeguarding rules rather than preferences. It changes interface
density, the coach's register, which gamification mechanics are legal, what data may be
collected, and which clinical guardrails apply.

| Mode | Ages | Built to solve | Cap |
|---|---|---|---|
| **Explorer** | 10–12 | Adventure, not health. Screen-break missions, coordination, classroom-safe play. Guardian account mandatory. | 3/day |
| **Teen** | 13–17 | Autonomy and identity. Revision resets, gaming recovery, private crews. No open leaderboards. | 4/day |
| **Momentum** | 18–39 | Hybrid work, commuting, early parenting. Meeting recovery and stress resets. | 6/day |
| **Balance** | 40–64 | Stiffness prevention, joint-friendly strength, posture, travel, optional menopause-aware personalisation. | 5/day |
| **Independence** | 65–79 | Balance, lower-limb strength, grip and gait. Confidence and staying independent. | 4/day |
| **Vitality** | 80–100 | Dignity and simplicity. Seated and bed-compatible, carer-assisted, voice-operated, no failure states. | 2/day |

The daily cap is a **ceiling the engine may never exceed**, not a target it pushes you toward.
The middle of life carries the most and the ends carry the least — but nobody carries nothing.

---

# 9 · Four delivery tiers — nobody is excluded by hardware

The product's reach is defined by its lowest tier, not its highest. Full app with wearables,
phone-only, lightweight over WhatsApp and SMS, and assisted delivery through a carer proxy.
The messaging and assisted tiers are first-class product tiers with their own funnels — not
charity, and not a degraded experience. This is what makes council, care-home and
public-health deployment actually possible rather than theoretical.

---

# 10 · Privacy, built in rather than bolted on

### Your calendar titles never leave your device
Events are classified **locally** into busy, free, focus and travel. Only that structure —
times and a category — is transmitted. Titles, attendees, descriptions and links are never
sent to us and never sent to any AI model.

### Eleven independent consent switches
Calendar, wearables, location context, heart rate, sleep, team participation, employer
analytics, family visibility, research, marketing and AI personalisation. Each independent,
each revocable, none required to keep using the product.

### An employer cannot see an individual — structurally
k-anonymity of 8 enforced in the query planner *and* again as a database constraint, with
intersection-attack checks across filter combinations. The individual view is not
permission-gated: it does not exist in the type system, so no role, escalation or support
ticket can produce it. Employees see exactly what their employer can see, on a permanent
transparency screen.

### Never sent to any model provider
Calendar titles and attendees, meeting descriptions, free-text health notes, precise location,
names and emails, a child's free-text conversation, and raw wearable time series. Enforced in
the AI gateway rather than in the prompt — because a prompt is a request and a gateway is a
wall.

### Children's Code by construction
Age assurance, guardian consent, high privacy defaults, no targeted advertising, no public
profiles, no location sharing, no unrestricted adult contact. A guardian sees participation,
safety flags and consent settings — and does **not** see private check-ins, mood entries or
free-text conversation with the coach. That boundary is deliberate and not configurable.

---

# 11 · Ethics, enforced as a failing build

### The Ethical Gamification Charter
Eight rules asserted in continuous integration. A build that violates them does not ship. No
paid streak restoration, no loss framing, no bottom-of-leaderboard exposure, no body-
composition language to a minor. This category runs on dark patterns; ours are banned at the
engine level rather than discouraged in a values page.

### The streak forgives
Grace tokens, Flare Mode and a Bereavement Hold are built into the engine. Loss-aversion
mechanics that punish illness, caring duties or a disability flare-up are banned. Guilt is a
churn driver, not a growth lever.

### Points reward the things that actually matter
Starting, completing, returning after a lapse, supporting a teammate, trying a new category,
consistency, completing an accessible alternative, and moving during a previously inactive
period. Never calories, weight, appearance, maximum intensity or biometric comparison.

### Food is described, never the person eating it
Seven permitted framings, exhaustively listed. "Bad", "junk", "cheat", "guilty", "sinful",
"clean" and "toxic" are banned by list rather than by tone of voice.

---

# 12 · Gamification that doesn't insult anyone

Nine game worlds — Space Explorer, Kingdom Builder, Wildlife Protector, Global Traveller,
City Rebuilder, Garden of Movement, Ocean Adventure, Future Athlete and Gentle Vitality
Journey — each improved by completed movement. Eleven reward assets including MovePoints,
Energy Crystals, Streak Shields, Diversity Seeds and Balance Crowns. Rewards celebrate
progress and return, and the celebration is short: haptics, brief particles, a light sound.
No confetti after every action.

---

# 13 · For organisations

### A wellbeing command centre that cannot see a person
SSO, department structure, employee invitation, a challenge builder, a campaign calendar,
reward management and aggregate participation analytics — office versus remote, engagement by
period, campaign performance. Employers never see health conditions, movement history, heart
rate, sleep, disability, declined activities, calendar content or an individual risk score.

### Meeting-culture insight
Which meeting structures never leave a gap. It's the most actionable thing an employer can
learn from this data, and it's about the calendar rather than about any person.

### Schools
Teacher-triggered classroom breaks that fit inside a lesson, timetable integration, class and
house challenges, revision-reset mode, parental consent workflows, and accessibility
adaptations on every routine. Aggregate school reporting only — no public child profiles, and
no pupil ever named in a ranking.

### Care and later life
Resident profiles with representative and consent controls, group sessions, a seated movement
library, smart-TV mode, voice-guided sessions, family participation, and participation records
suitable as inspection evidence. Stable-support reminders, seated defaults, slow transitions,
and pain and dizziness stop prompts throughout.

### Councils and public health
Regional and multi-site licensing, sponsored programmes, delivery to any phone that receives
a message, privacy-protected outcome reporting at cohort level, and multilingual UK support.
This is how you reach the people every other product designs out.

---

# 14 · Platform and technical credibility

### Three AI providers behind one gateway
Anthropic, OpenAI and Google Gemini. Agents never touch a vendor SDK — the gateway owns
provider selection, the fallback chain, prompt redaction, per-agent cost ceilings, timeouts
and the decision log. If a provider refuses or fails, it walks to the next. If all of them
fail, the app serves your cached plan. **A slow model must never produce a broken app.**

### Twelve agents, twenty-six deployable services
Each owns exactly one decision. Safety can only narrow. Recovery & Fatigue can veto the whole
day. Engagement Rescue exists because the second-hardest problem in this category is the week
after the novelty wears off — so it's an agent, not a feature.

### The rules live in the database
A movement outside 90–300 seconds, a prescription without a context decision, a minor without
a guardian, a minor in an adult mode, an unreviewed publication, a cohort report below the
privacy floor — all rejected by PostgreSQL itself, with a test for each that attempts the
violating write and asserts the rejection. Application code is where invariants go to be
forgotten.

### Transparent compute costs
Every expensive AI action is priced before it runs — you approve the cost, then it happens.
Balances, allowances and spend controls are visible, with a hard stop at zero that names what
still works. No surprise bills, no hidden throttling.

### Accessibility as an engineering constraint
WCAG 2.2 AA as the floor and AAA in Explorer, Independence and Vitality. Pointer targets at
48px standard and 56px in later-life modes — double the WCAG minimum. Reduced-motion
respected throughout, nothing flashes above 3Hz, and colour is never the only way information
is communicated.

### A public status page
Every service, thirty days of history, and — more usefully — what actually happens to your
day when a component fails. Safety screening, the five-variant requirement, the under-18
prohibition and the privacy floor never degrade: they fail closed.

---

# 15 · Plans

| Plan | Price | For |
|---|---|---|
| **Free** | £0 | Anyone who wants to see whether their day really does have room. No card required. |
| **Premium** | £5.99–£8.99/mo | One person who wants the full engine pointed at their actual calendar. |
| **Family** | £12.99–£17.99/mo | Up to six people, ten years old to a hundred, in one household. |
| **Organisation** | £2–£5 per person/mo | Employers, schools, care providers and councils. Minimum 10 seats, annual contract. |

Nothing is ever charged below £5. No hidden usage limits. Cancelling is one tap.

---

# 16 · The five things that make this defensible

**1 · The five-variant publishing gate.** A competitor with a standing-first video library
cannot retrofit five independently authored variants across six age modes and six cue
channels. It's 180 authored cue sets per movement, and it's a gate rather than a goal.

**2 · The Movement Opportunity Graph.** A continuously improving model linking context,
available time, sedentary duration, movement type, motivation, environment, age, capability
and outcome. Anyone can film exercises. Nobody else will know which prompt works, for whom,
in which room, after how long sitting, in which tone.

**3 · The Completion Probability Model.** It predicts what *this* person will actually finish
at *this* moment — not what's theoretically best. Optimising for completion instead of
intensity is the whole thesis.

**4 · The Inclusive Gamification Engine.** A scoring system where a child, a wheelchair user
and an octogenarian compete fairly in the same challenge. This unlocks families, schools,
care homes and whole workforces rather than only the already-fit.

**5 · Trust as architecture.** Privacy that's structural rather than promised, ethics enforced
as a failing build, and an AI coach that has to justify itself. In a category built on shame
and dark patterns, being the product that can be handed to a ten-year-old, an HR director and
a care inspector without changing the story is the position.

---

# 17 · Ready-to-use short copy

**One-liner**
> Small Moves. Powerful Change. The AI movement coach that finds the two minutes you already
> have.

**Social / organic (under 280 characters)**
> Most fitness apps ask for an hour you don't have. MoveQuest reads your actual day — work,
> commute, home — finds the two-minute gaps that are genuinely free, and puts one movement in
> them. Ages 10 to 100. Seated, standing, wheelchair, bed. Every body qualifies.

**Employer outreach opener**
> Your team isn't refusing to be healthier — they're in back-to-back meetings. MoveQuest finds
> the gaps their calendar actually has and puts two minutes of movement in them. You get
> privacy-protected participation reporting. Nobody gets an individual dashboard about anybody.

**School / care opener**
> One platform, ten years old to a hundred. Teacher-triggered classroom breaks, seated and
> bed-compatible routines, carer-assisted sessions, and participation records you can show an
> inspector. Every movement ships in five variants, so no child and no resident is ever left
> out of the activity.

**The differentiator line, for any audience**
> Every movement exists in five versions — standing, seated, chair-supported, reclined and
> single-limb — or it doesn't ship at all. That's not an accessibility feature. It's a
> publishing gate.

---

# 18 · What we never claim — read this before writing any ad

These are not suggestions. Breaching them creates regulatory exposure under UK advertising
and medical-device rules, and one false health claim in this category costs somebody money
and hope they didn't have to spare.

**Never say:**
- That it treats, cures, prevents or diagnoses any condition.
- That it replaces a doctor, physiotherapist or any professional.
- That it guarantees weight loss, or any weight loss in a stated timeframe.
- That it reduces absenteeism or increases productivity — that needs validated evidence we do
  not yet have.
- Anything about calories, BMI, body shape or appearance to an audience that includes
  under-18s.
- Before-and-after body imagery, in any campaign, for any age group.

**Always say:**
- MoveQuest is a **general wellness product, not a medical device**.
- It does not diagnose or treat, and never contacts emergency services.
- Stop and seek advice if you feel pain, dizziness or any unusual symptom.

**Disclosure:** label paid content clearly and up front (`#ad` or *Advertisement*, visible
before a viewer engages), disclose gifted subscriptions and free seats, don't target this
product's advertising at under-18s, and never present a personal result as a typical one.

Any population-health or clinical claim must be sourced, dated and signed off by the Clinical
Safety Officer against current UK guidance before publication. If a claim isn't on the
permitted list, ask before publishing it.

---

*MOVEQUEST — MoveQuest AI, your daily movement and body-balance operating system.
A general wellness product. It does not diagnose or treat any condition.*
