# JESSIE-OS™
### Just Enough Somatic Stimulus Intelligence Engine
**The world's first Movement Operating System for human beings aged 10 to 100.**

---

| Field | Value |
|---|---|
| **System name** | JESSIE-OS™ |
| **Backronym** | **J**ust **E**nough **S**omatic **S**timulus **I**ntelligence **E**ngine |
| **Consumer brand** | **Jessie** (the app) |
| **AI coach persona** | **Jess** — one identity, six age-calibrated voices |
| **Author / Originating Architect** | **Jessie** |
| **Programme** | NSEYA X-EXECUTE (shared AI intelligence backbone) |
| **Document class** | Developer-Ready Production Specification |
| **Version** | v1.0 — Build Specification (JS-01) |
| **Supersedes** | KinetiQ AI-OS blueprint (absorbed in full; nothing removed) |
| **Market** | United Kingdom first · Ireland, EU-francophone, Commonwealth follow |
| **Regulatory posture** | Wellness product — **not** a medical device (see §22) |

**Signature line for every screen, invoice, export and API response header:**
`Powered by JESSIE-OS™ — movement, engineered into the gaps.`

---

## 0. THE DOCTRINE

Every product in this category has failed for the same reason: **it asks the user for time they
do not have, in a form they find humiliating.**

JESSIE-OS does not sell exercise. It sells **the reclamation of dead time**.

The atomic unit is the **Snap**: a 90-to-300-second movement prescription, delivered into a
verified gap in a real human's real day, matched to their real body, in their real environment,
at a difficulty they can actually complete.

**Law 1 — Just Enough.** The system never prescribes the optimal dose. It prescribes the
*largest dose the user will actually complete*, then escalates by ≤7% per week. Completion rate
is the north-star metric, not minutes moved.

**Law 2 — No Empty Nudges.** A notification that fires when the user cannot move is a defect,
logged as `nudge.misfire` and used to retrain the timing bandit. The system would rather stay
silent than be ignored. Target ≥62% nudge-to-Snap conversion; reminder apps sit at 4–11%.

**Law 3 — Every Body Qualifies.** Every Snap ships in five executable variants: Standing,
Seated, Chair-supported, Bed/Recliner, Single-limb/Adaptive. A movement without all five cannot
be published. This is a publishing gate, not an accessibility feature bolted on.

**Law 4 — Never Weaponise the Streak.** Loss-aversion mechanics that punish illness, caring
duties, disability flare-ups or bereavement are banned at the engine level (§13.6). Chains
forgive. Guilt is a churn driver, not a growth lever.

---

## 1. EXECUTIVE PRODUCT VISION

### 1.1 What it is
An **AI Movement Infrastructure Operating System**. It ingests calendar, location, environment,
device motion, wearable biometrics, clinical constraints and behavioural history, and answers
continuously:

> *Given everything true about this human right now, what is the single best 2-minute movement
> they will actually do in the next 45 minutes — and how do I make them want to?*

Delivered as: a consumer app; **JESSIE Workforce**; **JESSIE Schools**; **JESSIE Silver**;
**JESSIE Care**; **JESSIE Care Link** (clinical adjunct); and **JESSIE Inside**, a headless
API/white-label layer.

### 1.2 The problem
Sedentary behaviour is an independent risk factor for cardiometabolic disease, musculoskeletal
degradation and mortality — independent of whether a person also exercises. Remote and hybrid
work removed the incidental movement offices used to supply. The under-served extremes are the
largest: children 10–15 and adults 70–100. Every incumbent optimises for the 25–45
gym-adjacent middle.

> **Evidence governance:** all population-health and clinical claims in the commercial surface
> must be sourced, dated and signed off by the Clinical Safety Officer (§23) against current UK
> CMO guidance and peer-reviewed literature before publication. This document states the *shape*
> of the evidence; `docs/clinical/evidence-register.md` holds the citations.

### 1.3 Why it is different

| Everyone else | JESSIE-OS |
|---|---|
| Time-based reminder | Context-verified prescription |
| One movement library for all | 9-dimension Movement Vector → per-person prescription |
| Ages 18–55 | Six age-band operating modes, 10 → 100 |
| Able-bodied default | Five-variant publishing gate; seated is first-class |
| Wearable required | Four delivery tiers down to SMS and carer-proxy |
| Streaks that punish | Chains that forgive |
| Dashboards that surveil | k-anonymity ≥ 8 in the query planner |
| Engagement addiction | Ethical Gamification Charter, enforced in CI |

### 1.4 Why it can dominate
1. **The Completion Graph** — every Snap outcome tagged with full context becomes proprietary
   training data. The Waze effect applied to human movement.
2. **The Adaptive Library** — 2,400 movements × five variants, safety-flagged, physio-reviewed,
   filmed and localised, is a 24-month capital project.
3. **Institutional embedding** — HRIS seats, MAT timetables and CQC compliance reporting make
   switching cost organisational, not personal.

### 1.5 Positioning
> *Fitness apps compete for the hour you don't have. JESSIE-OS owns the 200 two-minute gaps you
> didn't know you had.*

---

## 2. BRAND & DESIGN SYSTEM

```
--jes-ink:    #0B1220   /* primary text, dark surfaces      */
--jes-pulse:  #00E08A   /* success, completion, live states */
--jes-ember:  #FF6B3D   /* streak, energy, calls to action  */
--jes-deep:   #12326B   /* brand navy, headers, enterprise  */
--jes-mist:   #F4F7FB   /* app background                   */
--jes-slate:  #5A6B85   /* secondary text                   */
--jes-gold:   #E9B949   /* achievement, Sparks, rewards     */
--jes-alert:  #D7263D   /* clinical / safety only           */
```

- **Type:** Inter (UI) · Söhne or Fraunces (editorial) · **minimum body 17px, 22px Silver,
  26px Centennial.**
- **Contrast:** WCAG 2.2 AA everywhere; AAA in Silver, Centennial and Kid.
- **Motion:** respects `prefers-reduced-motion`; nothing flashes above 3Hz.
- **Voice:** Jess is warm, brief, never patronising, never shaming, never references weight or
  appearance. Enforced by the Localisation Agent's lint pass.

*Canonical implementation: `packages/shared/src/design.ts`, mirrored once into
`apps/frontend/app/globals.css`.*

---

## 3. MARKET GAP

### 3.1 Competitive teardown

| Player | Structural failure JESSIE exploits |
|---|---|
| Apple Fitness+ / Watch | Hardware-locked; volume goals, not context-aware micro-dosing |
| Strava | Performance culture intimidates the deconditioned; nothing under 10 min counts |
| Fitbit / Google Health | Reminder is a dumb hourly timer; no calendar awareness, no variants |
| Peloton / Sworkit | Session-based; requires changing clothes, space, intent |
| Virgin Pulse / Wellhub / YuLife | Self-reported activity; HR dashboards create surveillance anxiety |
| Headspace / Calm | Movement is a side-product; no biomechanical safety layer |
| Stand-up reminder utilities | No intelligence; uninstalled within three weeks |
| NHS Active 10 | No personalisation, no social layer, no persistence engineering |
| Physio HEP apps | Clinician-gated, joyless, abandoned at discharge |
| Care-home activity software | Paper-derived, staff-heavy, no resident agency |

### 3.2 The fourteen unfilled gaps

| # | Gap | Answer |
|---|---|---|
| G1 | Nobody reads the calendar for *real* gaps | Schedule Intelligence Agent (§9.2) |
| G2 | Nobody verifies the user *can* move now | Context Sensing Agent (§9.2) |
| G3 | No adaptive-equivalence scoring | Effort Equivalence Model (§13.4) |
| G4 | Nothing for 10–15 outside PE | JESSIE Schools + Kid Mode (§6.1) |
| G5 | Nothing for 80–100 with falls risk | Centennial + Falls Protocol (§6.5) |
| G6 | Streaks punish the ill and the caring | Grace Tokens, Flare Mode (§13.6) |
| G7 | Employer dashboards leak health signals | k-anonymity (§16.3) |
| G8 | No pathway for the digitally excluded | WhatsApp/SMS/IVR/TV rails (§7.2) |
| G9 | No clinical escalation on deterioration | Clinical Escalation Agent (§9) |
| G10 | Static, un-personalised libraries | Movement Vector + RL prescription |
| G11 | No circadian-aware shift-worker product | Shift Pattern Model (§10.4) |
| G12 | Carers and families excluded | Proxy & Circle mode (§6.6) |
| G13 | No credible anti-cheat | Integrity Agent (§13.5) |
| G14 | No headless engine for third parties | JESSIE Inside (§21) |

---

## 4. THE DAILY LOOP

```
INGEST      calendar · location · device motion · wearable · weather · shift rota ·
            school timetable · care-plan · self-report · ambient audio*
   ↓
UNDERSTAND  Gap Detection → Availability Score → Fatigue/Recovery State →
            Safety Clearance → Environment Class → Motivation State
   ↓
PRESCRIBE   Movement Vector (9-dim) → candidate retrieval (vector DB) →
            safety filter → variant selection → dose calibration → framing
   ↓
DELIVER     Timing bandit chooses the moment · channel by tier ·
            Jess voice calibrated to age band
   ↓
VERIFY      motion signature · wearable delta · self-attest · camera pose*
            → completion event → Sparks → Chain → Crew contribution
   ↓
LEARN       outcome → Completion Graph → per-user policy update →
            cohort model update → library performance ranking

* ambient audio and camera pose are strictly opt-in, on-device only,
  never uploaded, and disabled entirely under 18. See §22.
```

---

## 5. USER ECOSYSTEM

Twenty-three user types, each with a role-scoped Command Centre: children (10–12), teens,
students, remote and office workers, shift workers, drivers, parents and carers, adaptive users,
later-life independent and supported users, family carers, HR and occupational-health leads,
teachers and MAT admins, care coordinators, clinicians, commissioners, partners, developers,
content authors and physio reviewers, platform admins, and regulators/auditors.

---

## 6. AGE-BAND OPERATING MODES

Six modes. Mode is derived from a verified age band plus capability profile — never chosen
freely, never inferred from behaviour. It governs UI density, copy register, Jess's voice,
gamification mechanics, data-collection scope, safeguarding rules and clinical guardrails.

| Mode | Band | Daily cap | Type | Contrast |
|---|---|---|---|---|
| **Kid** | 10–12 | 3 | 17px | AAA |
| **Teen** | 13–17 | 4 | 17px | AA |
| **Standard** | 18–64 | 6 | 17px | AA |
| **Silver** | 65–79 | 4 | 22px | AAA |
| **Centennial** | 80–100 | 2 | 26px | AAA |
| **Circle / Proxy** | any | — | inherits | inherits |

**6.1 Kid (10–12).** Guardian account required; the child is a linked minor profile, never
standalone. Zero social features with strangers. No leaderboards showing losses. No streak-loss
messaging. No push 20:00–07:00 or during school hours. Data minimisation: no precise location,
no biometrics, no ambient sensing, no free-text chat. Anchor: **UK Age Appropriate Design
Code** — high privacy by default, DPIA mandatory. Content is play-framed, 60–120s.

**6.2 Teen (13–17).** Self-registration with age assurance; guardian visibility configurable
and **disclosed to the teen** — no covert monitoring. Peer Crews within a school tenancy or
invite-only graph; open discovery disabled. Tone dry and low-hype. Never references weight,
calories or appearance. Ever.

**6.3 Standard (18–64).** Full surface: calendar fusion, wearables, Crews, Seasons, wallet,
employer link, marketplace.

**6.4 Silver (65–79).** 22px default, high contrast, max four tap targets per screen.
Prescription bias to the falls-prevention stack: balance, lower-limb strength, grip, gait,
dual-task cognition. Chair-supported is the default; standing is opt-up, not opt-out. Weekly
Steady Check; deterioration notifies the Circle and, if enabled, Care Link.

**6.5 Centennial (80–100).** 26px, voice-first, one action per screen, no anxiety-inducing
timers, no failure states. **Falls Protocol:** any Snap flagged `balance_risk` requires a
confirmed stability anchor before start; standing balance work is disabled unless cleared by a
clinician or coordinator. Rails: large-format tablet, care-home TV cast, smart speaker, or
coordinator-run group session. Intergenerational Crews pair a resident with a grandchild in Kid
Mode — one of the highest-retention mechanics in the system. Session logging produces
**CQC-ready activity evidence** automatically.

**6.6 Circle / Proxy (any age).** A carer, family member or coordinator runs Snaps on behalf of
or alongside a person, with consent recorded. Proxy sessions are marked `proxy=true`, excluded
from competitive leaderboards, included in health and compliance reporting.

**6.7 Adaptive Layer (cross-cutting).** Not a mode — a permanent capability profile: seated
permanent/temporary, single-limb, limited grip, low vision, deaf/HoH, cognitive load ceiling,
chronic pain/fatigue (ME/CFS, long COVID, fibromyalgia, MS), post-surgical restriction,
pregnancy/postnatal stage. Every flag maps to hard filters in candidate retrieval and to Effort
Equivalence scoring.

---

## 7. ACCESSIBILITY & THE FOUR DELIVERY TIERS

**7.1 Non-negotiable.** WCAG 2.2 AA everywhere (AAA in Silver/Centennial/Kid); full
VoiceOver/TalkBack semantics; no colour-only state; captions on 100% of video; **BSL-signed**
versions for the 200 highest-usage Snaps; Easy Read variants; dyslexia-friendly type; complete
keyboard operability; no unextendable time limit.

**7.2 The tiers.** Nobody is excluded by hardware.

| Tier | Data | Channel | Verification |
|---|---|---|---|
| **T1 — Fused** | Wearable + phone + calendar | App push, watch haptic | Wearable delta + motion signature |
| **T2 — Phone-only** | Phone motion, calendar | App push | On-device motion signature |
| **T3 — Lightweight** | Self-reported schedule | **WhatsApp Business API / SMS** | Reply-to-confirm + optional voice note |
| **T4 — Assisted** | Carer/coordinator input | Large-format tablet, TV cast, smart speaker, IVR | Proxy attestation |

T3 and T4 are first-class product tiers with their own conversion funnels, not charity. In the
diaspora expansion track, T3 is the *primary* rail.

**7.3 Localisation.** Launch English (UK). Phase 2: French, Polish, Urdu, Punjabi, Bengali,
Romanian, Somali, Lingala. Easy Read and BSL are first-class locales, not add-ons.

---

## 8. AI COMMAND CENTRES

Every user type receives a role-scoped Command Centre defining what it sees, what it may do
autonomously, and what it must escalate. The Workforce Console is structurally blocked from
anything that could re-identify an individual. The Studio Console **cannot publish** — physio
sign-off is a hard gate. The Super Control Centre requires dual authorisation for break-glass
PII access.

---

## 9. THE AGENT REGISTRY — 26 AGENTS

**Orchestration:** LangGraph state machines over a NestJS agent runtime. Every agent is a typed
node with a declared input contract, output contract, tool allow-list, permission scope, cost
ceiling in ACU, timeout, fallback path and escalation route. **No agent may call a tool outside
its allow-list — enforced at the runtime, not by prompt.**

**Model routing policy:**

| Workload | Model class | Where |
|---|---|---|
| Motion classification, gap detection, on-device ranking | SLM / TFLite / Core ML | **On device** |
| Prescription reasoning, framing copy, coach dialogue | Mid-tier LLM (Claude Sonnet class) | Server, cached |
| Clinical reasoning, escalation triage, policy documents | Frontier LLM (Claude Opus class) | Server, low volume, logged |
| Movement retrieval embeddings | Embedding model | Server, pre-computed |
| Timing decisions | Contextual bandit (LinUCB/Thompson) — **not** an LLM | Server + on-device cache |

| # | Code | Agent | Escalates to |
|---|---|---|---|
| 1 | ONB | Onboarding | COMP |
| 2 | SIA | Schedule Intelligence | CTX |
| 3 | CTX | Context Sensing | RX |
| 4 | RX | Movement Prescription | SAFE |
| 5 | SAFE | Safety Guardrail | CLIN |
| 6 | ADA | Adaptive & Equivalence | RX |
| 7 | JESS | Coach Persona | GUARD |
| 8 | HAB | Habit Formation | NUDGE |
| 9 | NUDGE | Timing Bandit | — |
| 10 | GAM | Gamification | GOV |
| 11 | CREW | Crew & Social | GUARD |
| 12 | FUSE | Wearable Fusion | INS |
| 13 | INS | Progress & Insight | CLIN |
| 14 | CLIN | Clinical Escalation | Human CSO |
| 15 | GUARD | Safeguarding | Human T&S |
| 16 | WORK | Workforce Analytics | COMP |
| 17 | STUDIO | Content Studio | Human physio |
| 18 | LOC | Localisation & Register | — |
| 19 | GROW | Growth & Lifecycle | PRICE |
| 20 | PRICE | Pricing & Monetisation | Human |
| 21 | PAY | Payments & Wallet | FRAUD |
| 22 | FRAUD | Integrity & Fraud | Human |
| 23 | COMP | Compliance & Privacy | Human DPO |
| 24 | SRE | Reliability & Auto-Repair | Human on-call |
| 25 | GOV | AI Governance | Human |
| 26 | STEW | Data Steward | COMP |

*Implementation: `packages/shared/src/agents.ts`.*

### 9.2 The agents that define the product

**ONB — Onboarding.** Converts a stranger into a scored, safe, correctly-moded user in under
180 seconds. Any red flag from screening (chest pain on exertion, uncontrolled BP, recent
surgery, syncope) restricts the mode to `seated_gentle`, notifies CLIN, and tells the user
plainly — without alarm — to speak to their GP. Target: 71% complete first Snap same-day.

**SIA — Schedule Intelligence.** Builds a 15-minute-resolution availability lattice for the next
36 hours. Each cell scored on freeness, historical completion probability, physiological need,
environmental suitability and social context. **Calendar titles and attendees are never sent to
any LLM** — only structural metadata leaves the device by default. Full-title analysis is a
separate, explicit, revocable opt-in with its own consent record.

**CTX — Context Sensing.** Never nudge a person who cannot move. Hard blocks: `driving`,
`on_call` (unless the Snap is a call-safe silent seated variant), `in_lesson`, `sleep_window`,
`clinically_flagged_rest`. Outputs `movability {verdict, confidence, environment_class,
privacy_class}` where `privacy_class ∈ {alone, semi_public, public}` — this determines whether
Jess offers a star jump or a discreet ankle circle. **This is the single most defensible
component. Every incumbent fails here.**

**RX — Movement Prescription.** Hybrid retrieval plus policy: build the query embedding, retrieve
the top 200 candidates, apply hard filters, score with a learned ranker optimising
`P(complete) × health_value × novelty − fatigue_cost`, select the variant via ADA, calibrate the
dose to ≤ RPE 4 for beginners with ≤7%/week progression, then hand framing to JESS.

**SAFE — Safety Guardrail.** Deterministic, not an LLM. A contraindication matrix maps
`safety_flag → forbidden_movement_tags`. It never silently blocks — it substitutes and, where
useful, explains. Every allow/block decision is written immutably to `safety_decisions` with the
rule ID that fired. **This log is the legal defence artefact.**

**NUDGE — Timing Bandit.** Contextual multi-armed bandit (Thompson sampling). Reward =
completion within 20 minutes, penalised by dismissal and heavily penalised by
notification-disable. After three ignores the system goes quiet for 24h and sends a single
"want to change how often I check in?" control message — **not more nudges. Going quiet rather
than escalating is what will keep JESSIE installed for years.**

**GAM — Gamification (with GOV veto).** Currencies: Sparks, Chain, four progress meters, badges,
Season Rank. **Banned in code:** loss-framed push copy; streak-expiry countdowns; paid streak
restoration; variable-ratio loot for minors; bottom-rank leaderboards; named-individual
comparison for under-18s; body-composition framing at any age.

---

## 10. CORE INTELLIGENCE ENGINES

### 10.1 The Movement Vector (9 dimensions)

| Dim | Contents | Source |
|---|---|---|
| D1 Capability | strength/mobility/balance/endurance bands, RPE tolerance | onboarding + outcomes |
| D2 Constraints | safety flags, contraindications, clinician restrictions | screening, Care Link |
| D3 Environment | setting, space, noise, privacy class | CTX |
| D4 Time budget | gap distribution across the day | SIA |
| D5 Energy & recovery | sleep, HRV/RHR trend, self-report, PEM risk | FUSE + PROMs |
| D6 Motivation | archetype and current state | HAB |
| D7 Social | crew membership, solo/paired/team preference | CREW |
| D8 Circadian & rota | chronotype, shift pattern, timetable | SIA |
| D9 History | Completion Graph slice | outcomes |

### 10.2 Prescription scoring

```
score(s) = w1·P_complete(s | vector, context)
         + w2·health_value(s | deficits)
         + w3·novelty(s | recent_history)
         + w4·crew_relevance(s)
         − w5·fatigue_cost(s | D5)
         − w6·repetition_penalty(s)
         − ∞ · safety_violation(s)     // hard filter
```

Weights are per-archetype and learned. **Safety is never a weight.**

### 10.3 Habit ladder
Ignition (d1–7): 1–2 Snaps/day, ≤90s, near-certain completion. Anchoring (d8–28): fixed cues,
introduce Chain and Crew. Expansion (d29–66): 3–5/day, category diversity, first strength
progression. Autonomy (d67+): user-initiated Snaps exceed prescribed Snaps — the true success
metric. Any 5-day lapse returns to Phase 1 dosing with zero shame copy.

### 10.4 Shift Pattern Model
Adjusts circadian assumptions, avoids high-arousal Snaps in the final 90 minutes of a night
shift, prioritises alertness Snaps at the circadian nadir, and respects fatigue-risk policy in
safety-critical roles.

### 10.5 Falls-Prevention Stack
Seated strength → supported standing → dynamic balance → dual-task → gait. Progression gated by
a Steadiness Check and, in care settings, coordinator confirmation. **Content and progression
rules require physiotherapist sign-off before release.**

---

## 11. THE SNAP LIBRARY

Launch target 600 base movements × 5 variants = 3,000 executable items. Year-2 target 2,400 base
movements. Thirty-four metadata fields per movement.

**Publishing gate (hard).** A movement cannot reach `published` without (a) all five variants,
(b) captions, audio script and Easy Read, (c) a named physio reviewer and date,
(d) contraindication tags set, (e) an LOC copy-lint pass. **Enforced in the API, not by process
discipline.**

*Implementation: `evaluatePublishGate()` in `packages/shared/src/movements.ts`;
`MovementsService.publish()` in the backend. There is no `force_publish` flag.*

---

## 12. PLATFORM MODULES

Twenty-eight modules, M01–M28: Identity, Onboarding & Screening, Movement Vector Profile,
Calendar & Schedule, Snap Player, Prescription Feed, Wearables, Gamification, Crews & Social,
Leagues, Insights, Circle, Care Link, Rewards Marketplace, Billing, Workforce Console, Schools
Console, Care Console, Partner/White-label, Developer Centre, BitriPay Gateway, Notifications,
Content Studio, Trust & Safety, Compliance Centre, Audit Log, Super Control Centre, Observability.

---

## 13. GAMIFICATION & SOCIAL ARCHITECTURE

**13.1 Currencies.** **Sparks** earned per completed Snap. **Chain** counts consecutive *active
days*, not perfect days — one Snap holds it. **Four meters** (Steadiness, Strength, Mobility,
Energy) — deliberately no single composite score, because composite scores create losers.
**Seasons** are 6-week arcs.

**13.2 Social units.** Pair (2) · Crew (3–12) · House (20–300) · Tenancy League · Open Seasons
(adults only, moderated).

**13.3 Snap Together.** Synchronous two-minute co-session, presence indicators only. A
grandparent in Centennial Mode and a grandchild in Kid Mode running matched-variant Snaps
simultaneously. Requires guardian approval for any minor pairing, within a verified relationship
link only.

**13.4 Effort Equivalence Model.**

```
equivalent_effort = duration_s × rpe_reported_or_estimated × capability_normaliser(profile)
sparks            = round(equivalent_effort × category_weight × integrity_confidence)
```

`capability_normaliser` derives from the user's own baseline, so a wheelchair user, a
post-operative user and a marathon runner share a leaderboard without condescension or
advantage. Normalisers recalculate monthly, are never displayed as a "disability handicap", and
are described to users only as **"your personal baseline"**.

**13.5 Anti-cheat.** Device attestation, motion-signature plausibility, wearable-shake
detection, impossible-progression flags, collusion graphs, and `integrity_confidence ∈ [0,1]` on
every Sparks award. Low-confidence sessions still count personally but do not contribute to
prize-bearing leagues.

**13.6 The Ethical Gamification Charter** *(enforced by GOV, asserted in CI)*

1. Chains **forgive**: 2 Grace Tokens per month; **Flare Mode** freezes the Chain on
   declaration, no proof required; **Bereavement/Carer Hold** pauses everything for up to 60
   days with one tap.
2. No loss-framed copy. No countdown to expiry.
3. **No paid streak restoration. Ever.**
4. No bottom-of-leaderboard exposure.
5. No variable-ratio reward mechanics for under-18s.
6. No appearance, weight, BMI or calorie framing at any age, in any mode, in any locale.
7. Quiet is a legitimate user goal — "check in less" is one tap from any notification.
8. `charter.spec.ts` asserts these. **A build that violates the Charter fails the pipeline.**

*Implementation: `packages/shared/src/gamification.ts`; `apps/backend/test/charter.test.ts`.*

---

## 14. WEARABLES & DATA INGESTION

Apple HealthKit + watchOS; Android **Health Connect** + Wear tile; Fitbit, Garmin, Withings,
Oura, Whoop, Polar, Suunto, Samsung via direct OAuth or **Terra/Rook** aggregation; phone-only
via Core Motion / Activity Recognition; smart TV cast; smart speaker skills; weather.

**Fusion rules:** provenance per datapoint; deduplication by source priority and time-window
overlap; conflicts resolved to the highest-trust source; every derived metric explainable back to
its raw inputs.

---

## 15. BITRIPAY INTEGRATION GATEWAY

A first-class gateway module usable by JESSIE, by tenants, and by external platforms: merchant
onboarding, scoped rotatable keys, sandbox/production separation, wallet, QR (including
offline-validated), payment links, card, bank transfer, mobile money, squad wallets, Sparks
payout rail, T+n settlement, splits at authorisation, refunds and disputes, transaction
monitoring and AML hooks, and SDKs.

**Dual-rail policy.** Stripe for UK/EU consumer card and employer invoicing. BitriPay for wallet,
Sparks payouts, squad wallets and diaspora/francophone-Africa corridors. Reconciliation runs
through a single internal double-entry ledger; rails are adapters behind one `PaymentProvider`
interface.

Sparks are an internal loyalty unit, **not e-money**. The ledger design and redemption terms
must be reviewed against UK e-money and consumer-protection boundaries before any cash-out
feature ships (open decision O4).

Webhooks are signed HMAC-SHA256 with a 5-minute tolerance, at-least-once delivery, exponential
backoff over 24h, replayable from the Developer Centre.

---

## 16. WORKFORCE INTELLIGENCE WITHOUT SURVEILLANCE

**16.1 The principle.** An employer buys **outcomes**, not visibility. If an HR director can see
that one named person stopped moving in March, the product is a liability — legally, ethically
and commercially.

**16.2 What employers get.** Participation, sustained-engagement, aggregate break frequency,
self-reported energy/pain/WHO-5 trends, meeting-density correlation, cohort comparisons,
sector benchmarks, and a modelled ROI **with explicit confidence bounds and stated assumptions**.

**16.3 How it is structurally guaranteed.**
- **k-anonymity ≥ 8 enforced in the query planner.** Any grouping resolving to fewer than eight
  contributing users returns `SUPPRESSED`, and filter combinations are checked for intersection
  attacks.
- Differential-privacy noise on all small-cohort aggregates.
- **No individual endpoints exist** on the Workforce API surface — not permission-gated, *absent*.
- Free-text PROM responses never reach employers.
- Employees see exactly what their employer can see, on a permanent transparency screen.
- Annual independent privacy attestation, published.

This is a sales weapon, not a constraint: JESSIE Workforce is the only wellbeing product an
employee representative body can endorse without reservation.

*Implementation: `suppressBelowThreshold()` in `packages/shared/src/api.ts`.*

---

## 17. CONNECTOR ECOSYSTEM

Calendar (Microsoft Graph, Google, CalDAV) · SSO (Entra, Google Workspace, Okta, Apple, Wonde) ·
age assurance (Yoti, Persona, VerifyMy) · HRIS (Workday, HiBob, BambooHR, SAP SF, Personio) ·
school MIS (Wonde, Groupcall Xporter) · care systems (Person Centred Software, Nourish, Log my
Care) · clinical (NHS FHIR, EMIS/TPP) · wearables (Apple, Health Connect, Terra, Rook) ·
payments (**BitriPay**, Stripe, Adyen) · KYC/AML (Sumsub, Persona, ComplyAdvantage) · comms
(Twilio, MessageBird, Brevo, APNs/FCM) · **AI models (Anthropic Claude, OpenAI, Google Gemini,
Mistral)** · vector DB (pgvector default) · graph (Neo4j) · video (Mux, Cloudflare Stream) ·
storage (R2, S3) · weather (Met Office DataHub) · analytics (PostHog) · observability (Grafana,
Sentry).

---

## 18. TECHNICAL ARCHITECTURE

### 18.1 Stack (NSEYA X-EXECUTE canonical)

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo) + native Core Motion / Health Connect; watchOS + Wear OS companions |
| Web consoles | **Next.js 14** (App Router), TypeScript, TanStack Query |
| API / services | **NestJS** modular monolith → extracted services at scale |
| Agent runtime | **LangGraph** behind gRPC, typed state, checkpointed |
| Primary DB | **PostgreSQL 16** + **pgvector** + PostGIS + TimescaleDB |
| Cache / queue | Redis, BullMQ |
| Event bus | **Apache Kafka** (Redpanda early) |
| Graph | Neo4j |
| Object storage | Cloudflare R2 (+ Stream) |
| Warehouse | ClickHouse + Iceberg + dbt |
| Feature store | Feast |
| ML | PyTorch + ONNX; on-device TFLite / Core ML |
| Infra | Kubernetes, Terraform, ArgoCD, GitHub Actions |
| Edge | Cloudflare (WAF, DDoS, bot management, Turnstile) |
| Secrets | Vault / cloud KMS, envelope encryption |
| Observability | OpenTelemetry → Grafana, Sentry, PagerDuty |
| Region | **UK primary (London)**, EU secondary; contractual residency for NHS/school tenancies |

### 18.3 Kafka topics (core)

```
user.registered · consent.changed · schedule.gaps.computed · context.evaluated
nudge.sent · nudge.dismissed · nudge.misfire · snap.prescribed · snap.started
snap.completed · snap.abandoned · integrity.scored · sparks.awarded · chain.updated
crew.event · wearable.sample.ingested · prom.submitted · clinical.flag.raised
safeguarding.flag.raised · payment.event · acu.consumed · model.decision.logged
agent.action.logged · audit.privileged.action
```

Retention: 7 days hot → ClickHouse 25 months → Iceberg cold. Every event carries `tenant_id`,
`subject_pseudonym`, `schema_version`, `consent_basis`.

### 18.4 Offline & resilience
The Snap Player works fully offline against a 24-hour pre-cache. Sessions queue locally and
reconcile with idempotency keys. If the agent runtime is unavailable, the last valid prescription
plan is served from cache. **The user must never see a broken app because an LLM is slow.**

---

## 19. AI & DATA INTELLIGENCE LAYER

The **Completion Graph** is the proprietary asset: every prescription plus full context, outcome
and abandon-minute. Supporting components: pgvector index, Neo4j knowledge graph, Feast feature
store, a four-tier memory model (working, episodic, semantic, procedural — all consent-scoped
and user-erasable), decision-intelligence logging replayable for audit, a versioned model
registry with fairness slices, and bias monitoring that pages the AI Governance owner on drift.

---

## 20. DATABASE SCHEMA

All tables carry `id uuid pk`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`, and
row-level security by tenancy. Core groups: identity and profile; schedule and context; library;
prescription and sessions; health data; gamification and social; tenancy; clinical; commerce;
governance.

Hot tables are `sessions` and `biometric_samples` — partitioned by month, covering
`(user_id, started_at DESC)`. `prescriptions(status, expires_at)` drives the expiry sweeper.
Vector index `ivfflat(lists=200)` on `movement_embeddings`. **The Workforce API role has no grant
on `sessions` — only on `workforce_reports`.**

`safety_decisions` is WORM and never updated. `audit_log` is append-only with a WORM bucket
mirror.

---

## 21. API — JESSIE INSIDE

Base `https://api.jessie-os.com/v1`. Bearer or OAuth 2.1 + PKCE. `X-Jessie-Tenant` required;
`Idempotency-Key` required on writes.

**The core call** is `POST /v1/prescriptions:next`. A blocked prescription is **never a hard
error** — it returns a safe alternative or an explicit hold:

```json
{ "prescription_id": "rx_91bb",
  "movement": { "id": "mv_seated_ankle_pumps", "variant": "seated" },
  "safety": { "verdict": "substitute",
              "substituted_from": "mv_single_leg_balance",
              "reason_code": "FALLS_RISK_UNSUPPORTED_SINGLE_LEG",
              "rule_id": "SAFE-BAL-003" } }
```

Errors: `400 · 401 · 403 · 404 · 409 · 422 safety_block · 429 · 451 consent_missing · 5xx`.
Rate limits 600/min/tenant, 60/min/user, with a separate quota for `/prescriptions:next`.
Versioning is date-pinned with an 18-month deprecation policy. The sandbox provides synthetic
users across all six modes and all capability profiles, time-travel, forced safety blocks and
webhook replay.

---

## 22. SECURITY, PRIVACY & COMPLIANCE

**22.1 Regulatory frame (UK-first).** UK GDPR / DPA 2018 — health data is special category, so
an Article 9 condition is required; lawful basis is **explicit consent** for consumers, and
**never** employer-instructed processing of individual health data. Age Appropriate Design Code
for Kid and Teen modes. PECR separation of marketing from service messaging. **MHRA / UK MDR:
the product is a general wellness product and must not diagnose, treat or make disease-specific
claims** — any move toward clinician-prescribed rehab with therapeutic claims triggers a formal
medical-device classification review **before** release. NHS DTAC and DCB0129/0160 for NHS
deployments. CQC KLOEs for Care Console evidence. KCSIE safeguarding for schools. PCI-DSS SAQ-A
— card data never touches JESSIE infrastructure. Equality Act and WCAG 2.2 AA. Cyber Essentials
Plus → ISO 27001 → SOC 2 Type II.

**22.2 Security.** Zero Trust, mTLS between services, workload identity. Passkeys plus MFA,
risk-based step-up, session binding. TLS 1.3 in transit, AES-256 at rest, **field-level envelope
encryption** for health, clinical, safeguarding and identity fields, with per-tenant key
separation for enterprise and NHS tenancies. Full OWASP ASVS L2 coverage with object-level authz
tested per endpoint. Quarterly pen tests, continuous SAST/DAST/dependency and container
scanning, signed builds and SBOM. **Break-glass production PII access requires dual
authorisation, is time-boxed, session-recorded and auto-notified to the DPO.**

**22.3 Privacy engineering — the differentiator.**
- **Consent ledger:** every purpose separately granted, versioned, revocable in one tap, with
  revocation cascading to deletion of derived features.
- **On-device first:** motion classification, gap scoring and candidate pre-ranking run locally.
  Raw sensor streams never leave the device.
- **Calendar redaction by default:** titles and attendees stripped client-side.
- **No prompt leakage:** identifiers, names, calendar titles, clinical notes and free-text PROMs
  are redacted or tokenised before any external model call; zero-retention model endpoints are
  contracted; no customer data trains third-party models. **Model calls are logged with input
  hashes, not inputs.**
- **Retention:** raw sensor 30d → derived features 25 months → aggregates indefinite. Minors get
  tighter defaults and automatic re-consent at 13, 16 and 18.
- **DSAR automation** within 30 days, with deletion-cascade proof.
- **Published annual transparency report.**

*Implementation: `AiGatewayService.redact()` and `NEVER_SEND_TO_MODEL`.*

**22.4 Threat model highlights.** Employer coercion → k-anon plus absent individual endpoints.
Grooming via social features → verified-adult-only invitations for minors, GUARD scanning, no
open discovery under 18. Prompt injection → structured tool contracts, no free-text-to-tool
escalation, allow-listed tools, output validation. Insurer misuse → contractual ban on
individual underwriting plus technical suppression. Model drift harming a disability cohort →
fairness slices monitored, auto-rollback on parity breach.

---

## 23. CLINICAL SAFETY & CARE GOVERNANCE

A **Clinical Advisory Panel** (MSK physiotherapist, geriatrician or falls specialist, paediatric
physical-activity specialist, occupational health physician, adaptive movement specialist, and a
lived-experience panel). A **Clinical Safety Officer** owns the DCB0129 hazard log. Red-flag
screening at onboarding and quarterly thereafter restricts the prescription space and prompts —
never diagnoses — a GP conversation.

**Emergency posture:** JESSIE never calls emergency services and never claims to detect a medical
emergency. It surfaces clear self-directed guidance and, where consented, notifies the Circle or
the Care Link clinician.

**Incident process:** any adverse event creates a P1 clinical incident, freezes the implicated
movement across the estate within 15 minutes via the kill-switch, and triggers root-cause review.

---

## 24. ADMIN SUPER CONTROL CENTRE

Twelve panes, all audited, all destructive actions dual-authorised: Live Pulse · User Ops ·
Tenancy Ops · Library Ops (global movement kill-switch) · Agent Ops (per-agent kill-switch,
decision replay) · Model Ops (canary, rollback, fairness slices) · Safety & Clinical ·
Trust & Safety · Payments & Ledger · Compliance (72h breach clock) · Reliability · Commercial.

---

## 25. MONETISATION

Ten revenue lines: B2C subscription (Jessie Plus £4.99/mo, Family £8.99/mo); B2B Workforce
(£2.50–£5.50 per employee per month); Schools (£595–£2,950/yr, **free above a free-school-meals
threshold**); Care (£3.50 per resident per month); Clinical/ICB; JESSIE Inside API; white-label;
BitriPay gateway revenue; rewards marketplace (**no HFSS food, alcohol, gambling or weight-loss
products, ever**); and aggregate insights at k ≥ 50 — **never individual data, never sold to
insurers for underwriting.**

**ACU economy.** 1 ACU is a normalised unit of AI work. Indicative: cached prescription 0.2 ACU ·
full LLM re-plan 1.5 · weekly insight narrative 4 · clinical escalation packet 12 · workforce
report 25. **Target blended gross margin 66%+**, achieved by on-device inference for ~70% of
decisions, aggressive prescription caching, SLM routing, batch narrative generation, and a hard
per-user daily ACU ceiling enforced by the agent runtime.

---

## 26. OBSERVABILITY & RELIABILITY

**SLOs:** API availability 99.95% · `/prescriptions:next` p95 < 400ms cached, < 1.8s full agent
path · notification delivery p95 < 20s · zero data loss on session writes. Error budgets gate
releases.

**Auto-repair** may restart pods, shift traffic, roll back on SLO burn and scale on predicted
load — but is **never permitted to act autonomously on the safety-decision or clinical
services.** DR: RPO 5 min, RTO 60 min, quarterly game-days, documented degraded modes.

---

## 27. TESTING & QUALITY

≥85% coverage on prescription, safety, ledger and k-anon paths. An exhaustive contraindication
matrix suite (every flag × every movement family, golden-file asserted). `charter.spec.ts` as a
build gate. Property-based k-anonymity tests attempting intersection re-identification. A
2,000-case agent eval golden set with an adversarial prompt-injection suite. Automated axe plus
**manual audit with disabled users each release**. Moderated age-band testing with 10–12, 13–17,
65–79 and 80–100 cohorts every quarter. Chaos drills for calendar, wearable, model and payment
outages.

---

## 28. BUILD ROADMAP

| Phase | Weeks | Scope | Objective |
|---|---|---|---|
| **P0 Foundations** | 1–6 | Monorepo, IaC, auth, tenancy, event bus, design system, consent ledger, 120-movement seed library × 5 variants | Build the rails right |
| **P1 MVP** | 7–16 | Calendar gaps, CTX, RX, SAFE, Snap Player, Chain/Sparks, phone-only tier, Stripe | 1,000 beta users; ≥55% nudge conversion |
| **P2 Beta** | 17–26 | FUSE, Crews, Seasons, Snap Together, Adaptive layer, Silver Mode, WhatsApp T3 | 15,000 users; D30 ≥ 25%; 3 pilot employers |
| **P3 Commercial** | 27–40 | Workforce Console + k-anon engine, billing, BitriPay, rewards, Kid/Teen + Schools, safeguarding | £250k ARR; Cyber Essentials Plus |
| **P4 Enterprise** | 41–60 | SSO/SCIM, HRIS + MIS, Care Console + CQC, Centennial, white-label, JESSIE Inside, ISO 27001 | £1.2M ARR |
| **P5 Clinical** | 61–90 | Care Link Pro (**post medical-device classification review**), DTAC, DCB0129/0160, FHIR, ICB pilots, localisation, SOC 2 | £4M+ ARR |
| **P6 Autonomy** | ongoing | Self-optimising loop, per-cohort policy learning, predictive deterioration models | Category ownership |

---

## 29. COMPETITIVE ADVANTAGE

1. It is the only system that **verifies movability before asking**.
2. The **five-variant publishing gate** cannot be retrofitted into a standing-first library.
3. **10-to-100 span** — one engine sells to a family, a school, an employer, a care group and an
   ICB.
4. **Privacy as a sales weapon** — structural k-anonymity accelerates procurement with unions,
   works councils, DPOs and NHS IG.
5. **The Completion Graph compounds.** Reminder timers do not improve; this does.
6. **Ethics enforced in CI** — the Charter is a failing test, not a values page.
7. **Payment rails already owned** via BitriPay.
8. **Institutional lock-in** through timetables, rotas, CQC evidence and HRIS seats.

---

## 30. PRODUCTION READINESS GATE

- [ ] P1 SLOs instrumented and alerting; error-budget policy signed
- [ ] Contraindication matrix 100% test-covered; hazard log reviewed by the CSO
- [ ] DPIAs completed and signed (separate for minors and for workforce)
- [ ] k-anonymity property tests passing; independent re-identification review
- [ ] Pen test complete, criticals and highs closed
- [ ] Accessibility audit passed with disabled-user panel sign-off
- [ ] Charter CI suite green; external dark-pattern review
- [ ] Ledger reconciliation proven across BitriPay and Stripe for 30 consecutive days
- [ ] DR game-day executed within RPO/RTO
- [ ] Model cards published; fairness slices within tolerance
- [ ] Runbooks, on-call rota, incident comms, 72h breach drill
- [ ] Terms, privacy notice and employer/school/care DPAs legally approved
- [ ] Rollback verified for every P1 service; movement kill-switch tested in production

---

## 31. OPEN DECISIONS

| ID | Decision | Owner | Impact |
|---|---|---|---|
| O1 | Age assurance vendor and method | DPO + Product | Children's Code exposure |
| O2 | Direct wearable integrations vs Terra/Rook | CTO | COGS, time-to-market |
| O3 | Whether Care Link Pro's claims cross the medical-device line | CSO + counsel | **Gates P5 entirely** |
| O4 | Sparks cash-out: loyalty scheme vs regulated e-money | CFO + counsel | Rewards architecture |
| O5 | Video production: in-house vs licensed physio library | Content lead | £250k–£600k capex swing |
| O6 | On-device model size ceiling for low-end Android | ML lead | Reach vs accuracy |
| O7 | Employer clause banning aggregate data in performance management | Legal | Trust positioning |
| O8 | Free-school-meals threshold for the free Schools tier | Founder | Mission economics |

---

## 32. AUTHORSHIP & IDENTITY

**JESSIE-OS™** — *Just Enough Somatic Stimulus Intelligence Engine.*

The name carries the author's identity into the system's function: **JESSIE** is both the person
who conceived it and the operating principle it runs on — *just enough*, delivered
intelligently, to a body that is somatically real and specifically theirs.

| Surface | Name |
|---|---|
| Operating system | **JESSIE-OS™** |
| Consumer app | **Jessie** |
| AI coach persona | **Jess** |
| Workplace product | **JESSIE Workforce** |
| Schools product | **JESSIE Schools** |
| Later-life product | **JESSIE Silver** (80+ tier: **Centennial**) |
| Care-setting product | **JESSIE Care** |
| Clinical adjunct | **JESSIE Care Link** |
| Embeddable engine | **JESSIE Inside** |
| Atomic unit | **the Snap** |
| Currency · streak · team | **Sparks · Chain · Crew** |

> **JESSIE-OS™ — Authored by Jessie. Engineered under NSEYA X-EXECUTE.**
> *Movement, engineered into the gaps. Ten to a hundred. Every body qualifies.*

---

*End of specification v1.0 (JS-01). Companion documents available on request: ERD pack,
OpenAPI 3.1 file, 26 agent contract cards, DPIA templates, clinical hazard log, investor deck,
and the Snap Library taxonomy workbook.*
