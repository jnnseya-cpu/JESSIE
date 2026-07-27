# Body Balance AI / BodyCommand AI

**Adaptive Healthy-Weight, Body-Composition and Behaviour Intelligence Module**

> **Status: DECIDED and built. Option C — scoped carve-out. See §0.**

---

## 0. RESOLVED — Option C, scoped carve-out

**Decision:** the OS serves children and adults from one engine, because the problem
affects both. Charter rule C6 was **scoped by audience rather than removed.**

> *"this OS is for both children and adults as this issues affects both of them,
> please build them as it described"* — author, directing the resolution

### What C6 now says

| Audience | Rule |
|---|---|
| **Under 18** | An absolute prohibition on *surfacing* weight, BMI, calorie or appearance framing. A centile assessment may exist for safety and escalation, but a child is never shown a number, a target, a score or a comparison. **Unchanged in strength from the original.** |
| **Adults** | Available, opt-in, never a default, never a comparison between named individuals, never a leaderboard. |
| **Everyone** | Body-composition leaderboards, lowest-BMI rankings, public weight ranking, child weight-loss contests, fasting competitions, calorie-minimisation games and exercise-to-erase-food messaging remain banned outright, at every age, consent or no consent. |

### How it is enforced rather than promised

`bodySurfacePolicy(age, optedIn)` in `packages/shared/src/gamification.ts` is the single
gate. Under 18 it returns `mayDisplay: false` and `mayTarget: false` **for every value of
`optedIn`** — the consent switch is not consulted. `BodyService.assess()` calls it before
returning, so metrics come back `null` rather than being filtered downstream.

Verified end to end: an eleven-year-old requesting `REDUCE` with `optedIntoBodyMetrics:
true` receives `pathway: "CHILD_GROWTH"`, `metrics: null`, and
`powersExercised: ["activate_child_safe_mode", "block_weight_loss_plan"]`.

`charter.test.ts` grew from 11 to 14 assertions. Three are new and all concern C6: that a
minor is never shown a body number whatever the consent state, that adults get it opt-in
and off by default, and that the competitive mechanics stay banned for everyone.

### What this cost, stated plainly

The original C6 was simpler to defend in procurement: *"we never do this, at any age."*
The scoped version requires explaining a boundary rather than asserting an absence. That
is a real trade, and it was the author's call to make. The child-facing half of the
protection did not weaken.

---

## 0b. The original conflict, for the record

This module is specified against **MoveQuest AI OS**, not JESSIE-OS™, and it collides
head-on with a shipped, CI-enforced guardrail.

**JESSIE-OS Ethical Gamification Charter, rule C6:**

> *No appearance, weight, BMI or calorie framing at any age, in any mode, in any locale.*

C6 is asserted in `apps/backend/test/charter.test.ts`. A build that violates it fails the
pipeline. That is deliberate — it is the mechanism §13.6.8 of the JESSIE-OS specification
requires.

Body Balance AI is built on BMI, waist-to-height ratio, weight trend, body-composition
trend and calorie-range estimation. **These two things cannot both ship inside one
product.** Three resolutions exist:

| Option | Consequence |
|---|---|
| **A — Separate product** | Body Balance ships as MoveQuest, outside JESSIE-OS. The Charter is untouched. No code change to the existing build. |
| **B — Amend C6** | JESSIE-OS absorbs Body Balance. C6 must be rewritten and `charter.test.ts` amended with it. Under §6 Rule M0 this is a change of product category and needs documented, named sign-off. |
| **C — Scoped carve-out** | C6 holds for Kid, Teen, Silver and Centennial modes; Body Balance is available only in Standard mode for consenting adults. The CI test becomes mode-aware rather than absolute. |

**No code has been written against this module, and C6 has not been weakened.** Weakening
a safety guardrail is not a decision to take silently on the author's behalf.

Note that this module's own safety design already agrees with the substance of C6 for
minors — §2 Agent 2 forbids adult BMI categories under 18, and §9 prohibits child
weight-loss rankings and lowest-calorie competitions. The conflict is narrower than it
first appears, which is what makes Option C viable.

---

## 1. Mission

BodyCommand AI is the intelligence and orchestration layer connecting every capability in
the platform to help each user move towards — and sustainably remain within — the most
appropriate **personal** health range.

It learns continuously from movement, sedentary time, cooked and packaged food, portions,
sleep, recovery, stress, work and school schedules, wearable data, weight, waist, strength,
mobility, food-buying behaviour, accepted and rejected recommendations, and environmental
and social triggers.

**The central product decision:** position this as a *Body Balance* system, **not a
BMI-reduction machine.** It must first determine whether the user needs to reduce weight,
maintain, gain, protect muscle, reduce central adiposity, or obtain professional support.

### Clinical framing

BMI is useful for population-level screening but **cannot distinguish muscle from fat**.
NICE recommends considering waist-to-height ratio alongside BMI for adults with BMI below
35. Children require an age- and sex-adjusted centile assessment, never adult thresholds.

> **Evidence governance:** every clinical claim above and below must be sourced, dated and
> signed off against current NICE and NHS guidance before it reaches any user-facing or
> commercial surface. This document states the *shape* of the evidence, not the citations.

---

## 2. The agent team (15)

| # | Agent | Role |
|---|---|---|
| 1 | **Body Balance Orchestrator** | Central decision-maker. Selects pathway, sequences actions, sets pace, decides which agents activate and how ACUs are spent. Produces daily, weekly, recovery, plateau, travel, social-event, restart and maintenance plans. |
| 2 | **Healthy-Range Classification** | Determines the operating mode. **Must not use adult BMI categories under 18** — uses age, sex, height, weight, growth trajectory and age-adjusted centile, with guardian permissions and escalation rules. For older adults, weights muscle preservation, strength, balance, appetite, hydration, unplanned loss and frailty above weight reduction. |
| 3 | **Personal Target Architect** | Translates assessment into a safe objective. May recommend a safer alternative than the user selected: *"Your selected target requires rapid weight loss. A slower target is more likely to protect muscle, improve adherence and reduce rebound risk."* |
| 4 | **Energy-Balance Intelligence** | Estimates *direction* of energy balance with lower/likely/upper bounds. Trend-based, never a single obsessive daily number. |
| 5 | **Food Adjustment** | Connected to FoodLens. Applies the **Minimum Effective Change Principle** — change the smallest number of behaviours capable of meaningful progress. Does not rebuild every meal. |
| 6 | **Movement Prescription Support** | Four-level ladder: Break Sitting → Increase Daily Movement → Protect Muscle → Build Fitness. |
| 7 | **Muscle Protection** | Weight reduction is never the only goal. Monitors protein distribution, resistance activity, rapid weight change, strength, fatigue, older-adult risk, and voluntarily declared GLP-1 use. |
| 8 | **Sleep and Recovery** | Learns how sleep drives hunger, cravings, completion and evening snacking; adjusts the next day automatically. |
| 9 | **Behaviour Root-Cause** | Maps Trigger → Behaviour → Immediate Reward → Long-Term Cost → Better Replacement → Reinforcement. |
| 10 | **Habit Formation** | Habit stacking, implementation intentions, reduced friction, pre-commitment, identity-based motivation, relapse recovery. |
| 11 | **Plateau Detective** | **Does not immediately reduce food.** First distinguishes a real plateau from normal fluctuation, missing data, poor measurement consistency, muscle gain, lower adherence, or over-restriction followed by compensation. |
| 12 | **Relapse and Restart** | A missed day does not reset to zero. Responds with reduced goals, a three-day restart, a single anchor habit, and temporary pause of competitive elements. |
| 13 | **Health Risk and Escalation** | **Blocks inappropriate automated weight plans.** Triggers: pregnancy, suspected or declared eating disorder, rapid unexplained loss, very low intake, repeated faintness, chest pain, severe breathlessness, child safeguarding concern, frailty, medication concern, requests for extreme loss, purging or compensatory-exercise signals. |
| 14 | **Motivation Personalisation** | Learns motivational identity and adapts language, chart density, notification frequency, challenge style, reward type and goal duration. |
| 15 | **ACU Efficiency** | Routes each request to cached analysis, deterministic rules, on-device processing, low-cost model, premium reasoning, batch, or no AI at all. |

---

## 3. The Digital Twin

A structured behavioural and lifestyle model — **not a medical replica**. Carries objective,
BMI context, waist-to-height context, weight trend, movement profile, food pattern, sleep,
recovery, sedentary pattern, strength activity, accepted and rejected recommendations,
trigger periods, completion probability, confidence levels and safety restrictions.

| State | Meaning |
|---|---|
| **Green** | Progressing safely and consistently |
| **Amber** | Inconsistent, or a supporting behaviour is deteriorating |
| **Red** | Significant disengagement, unsafe behaviour, or professional input needed |
| **Blue** | Maintenance mode |
| **Purple** | Specialised pathway — child, pregnancy, disability, eating-disorder exclusion, older adult |

---

## 4. Trajectory engine

Never promises an exact completion date. Produces three trajectories — **Conservative**
(lower adherence), **Expected** (present behaviour), **Optimised** (if selected behaviours
improve). Updates weekly rather than reacting to daily weight fluctuation.

---

## 5. Body Balance Score

**Not a BMI score.** Multi-dimensional, 0–100:

| Dimension | Weight |
|---|---|
| Movement consistency | 15% |
| Food-pattern quality | 15% |
| Sedentary interruption | 10% |
| Protein and fibre support | 10% |
| Sleep regularity | 10% |
| Strength protection | 10% |
| Waist or body-risk trend | 10% |
| Goal adherence | 10% |
| Recovery and sustainability | 5% |
| Behavioural stability | 5% |

BMI is shown **separately**, as one assessment indicator. **BMI must not be presented as a
beauty score.**

Colour logic: Emerald (strong sustainable progress) · Green (on track) · Amber
(inconsistent) · Orange (intervention recommended) · Red (safety or major-pattern concern) ·
Blue (maintenance) · Purple (specialised pathway).

---

## 6. Dashboards

Body Balance Ring · BMI and Waist Context Graph · Weight Trend Smoothing Graph (individual
weigh-ins, 7-day moving average, monthly trend, expected range) · Behaviour Influence
Waterfall (helping vs blocking) · Food Pattern Heatmap · Movement Opportunity Graph ·
Progress Forecast **Fan Chart** (a range, never one promised outcome) · Habit Network ·
**Non-Scale Victory Board** (energy, sleep, walking, strength, waist, clothing comfort,
mobility, sitting time, meal confidence, vegetable variety).

---

## 7. Daily plan engine

No more than a manageable number of actions per day:

- **Anchor** — the one action that happens even on a difficult day
- **Food** — one specific meal improvement
- **Movement** — one planned movement or sitting-break objective
- **Recovery** — sleep, hydration or stress support
- **Optional bonus** — gamified extra

---

## 8. Weekly AI review

Four sections: **What Improved · What Blocked Progress · What the AI Learned · Next Week's
Changes.** The learning section is the differentiator — *"morning movement has low
completion; lunchtime walks have high completion; vegetable swaps are accepted;
portion-reduction recommendations are often rejected."*

---

## 9. Gamification

**Reward healthy behaviour, not weight fluctuation.** Rewarded: completing movement,
preparing meals, scanning food, making corrections, food diversity, maintaining strength,
consistent sleep, returning after disengagement, completing professional referrals,
maintaining a healthy range.

Elements: Balance Energy · Momentum Points · Habit Shields · Recovery Tokens · Strength
Gems · Food Diversity Garden · Weekly Boss Challenges · Family Support Bonuses · Team
Journey Maps.

**Prohibited mechanics** — public body-weight leaderboards; lowest-calorie competitions;
fasting competitions; child weight-loss rankings; punishment for eating;
exercise-to-cancel-food messaging; shame notifications.

> These prohibitions are substantively the same instinct as JESSIE-OS Charter C6. They are
> the basis on which Option C in §0 could be made to work.

---

## 10. Pathways

`REDUCE` · `MAINTAIN` · `GAIN` · `WAIST_REDUCTION` · `CHILD_GROWTH` ·
`OLDER_ADULT_STRENGTH` · `LIMITED_MOBILITY` · `PROFESSIONAL_SUPPORT`

The system does **not** treat every user as someone who needs to lose weight.

---

## 11. ACU consumption

**Included, not metered:** weight entry, waist entry, BMI calculation, standard charts,
habit tick-off, water logging, saved meal viewing, standard movement playback, reminders.

| AI action | Indicative ACUs |
|---|---|
| Initial Body Balance assessment | 40–100 |
| Personal 7-day plan | 30–80 |
| Daily adaptive plan | 5–15 |
| Weekly progress review | 30–75 |
| FoodLens meal analysis | 15–80 |
| Behaviour root-cause analysis | 40–100 |
| Plateau investigation | 75–180 |
| 30-day trajectory analysis | 75–200 |
| Personal meal-rebuild plan | 20–60 |
| Travel or event survival plan | 20–50 |
| AI restart programme | 20–60 |
| Professional summary report | 100–250 |

The ACU Cost Governor maintains the rule that **every £1 of direct provider cost produces at
least £4 of customer revenue.**

> Reconciliation note: JESSIE-OS §25.2 targets a 66% blended gross margin. The 4× rule
> implies 75%. The 4× rule is the stricter constraint and therefore satisfies both, but the
> two figures should be reconciled in one document.

---

## 12. Onboarding

Objective → Profile → **Safety Screen** (pregnancy, eating-disorder history, unexplained
weight change, symptoms, medication, long-term conditions, mobility limitations,
professional supervision) → Data Connections → **Seven-Day Calibration** (learn normal
eating, activity, schedule, sleep, preferred foods and prompt response — **avoid aggressive
changes during calibration**) → First Personal Structure.

---

## 13. Decision flow

```
Create profile → Age and safety classification
  → Determine adult / child / older-adult / specialist pathway
  → Collect BMI and complementary indicators
  → Connect movement, food, sleep and calendar data
  → Seven-day calibration → Build Digital Twin → Select primary target
  → Generate minimum-effective-change plan → Deliver daily actions
  → Track completion → Behaviour-learning update → Weekly review
  → Continue, adapt, maintain, escalate or restart
```

---

## 14. Data structures

```ts
interface BodyBalanceProfile {
  userId: string;
  pathway:
    | "REDUCE" | "MAINTAIN" | "GAIN" | "WAIST_REDUCTION"
    | "CHILD_GROWTH" | "OLDER_ADULT_STRENGTH"
    | "LIMITED_MOBILITY" | "PROFESSIONAL_SUPPORT";

  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  bmi?: number;
  waistToHeightRatio?: number;

  targetType: string;
  targetRange?: { minimum?: number; maximum?: number };

  safetyStatus: "CLEARED" | "LIMITED" | "REVIEW_REQUIRED" | "BLOCKED";
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
}

interface BehaviourSignal {
  signalId: string;
  userId: string;
  type: "FOOD" | "MOVEMENT" | "SLEEP" | "STRESS"
      | "SEDENTARY" | "RECOVERY" | "ADHERENCE";

  trigger?: string;
  behaviour?: string;
  context?: string;
  impactDirection: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  confidenceScore: number;
  detectedAt: string;
}

interface DailyBalancePlan {
  planId: string;
  userId: string;
  date: string;
  anchorAction: PlanAction;
  foodAction?: PlanAction;
  movementAction?: PlanAction;
  recoveryAction?: PlanAction;
  optionalAction?: PlanAction;
  totalEstimatedACUs: number;
  adaptationReason?: string;
}
```

*`PlanAction` is referenced but not defined in the source specification — see open items.*

---

## 15. Privacy

Users control visibility of weight, waist, family sharing, employer sharing, professional
sharing, wearable access, meal-image storage, health-data retention, AI personalisation and
research consent.

**Employers must never receive** employee BMI, weight, waist, meal images, food logs,
individual health targets, individual adherence or medical information. Organisation
dashboards show only privacy-protected aggregate engagement — consistent with the
k-anonymity architecture already implemented in `packages/shared/src/api.ts`.

---

## 16. Positioning

> It does not give users another diet. It learns their entire life pattern and continuously
> reorganises food, movement, sleep and behaviour around a safer personal trajectory.

**Promise:** *Know what is happening. Understand what is blocking progress. Take the next
best action. Repeat until healthier behaviour becomes normal.*

---

## 17. BodyCommand AI — the superseding revision

A later revision renames this module **BodyCommand AI — The Autonomous Body-Balance and
Healthy-BMI Operating System** and expands the agent force from 15 to **19**. Where the two
revisions differ, BodyCommand is authoritative.

### What BodyCommand adds

**An explicit Objective Engine.** Onboarding produces a *Personal Body Objective* in one of
eight modes: Reduce · Waist · Maintain · **Strength Recomposition** · Gain Safely · Child
Growth · Older-Adult Independence · Professional Support.

> **The system must never assume a lower BMI is always better.**

**A Required-Level Engine** replacing any single "ideal weight" with a *Personal Health
Range*: Current Position · Appropriate Direction · Personal Operating Range · First
Milestone · **Maintenance Zone** (where the AI switches from active change to stabilisation)
· Confidence Level · Missing Information.

**An eight-state Digital Twin** (Emerald · Green · Amber · Orange · Red · Blue · Purple ·
Grey) — finer-grained than the five states in §3, separating *Amber: friction detected* from
*Orange: intervention required*, and adding *Grey: insufficient data*.

### The four genuinely new agents

| Agent | Why it matters |
|---|---|
| **Environment Architect** (10) | The strongest single idea in this revision. Most weight products target motivation and ignore surroundings. This agent learns home food availability, supermarket habits, canteen options, delivery-app use, family preferences, kitchen equipment, budget, preparation time, commute, neighbourhood walkability, weather and social commitments — then **changes the environment rather than repeatedly telling the user to use more willpower.** Actions: shopping-list redesign, visible healthy-item placement, emergency meal preparation, takeaway shortlist, workplace lunch planning, portion containers, calendar-based preparation windows. |
| **Predictive Risk** (15) | Forecasts high-risk situations — Friday takeaway, holiday travel, payday, low-sleep workday, family celebration, deadline week, school holiday, recovery after illness — and builds preventive plans *before* the event. |
| **Human Escalation** (18) | *"BodyCommand must not attempt to automate every situation."* Prepares a **user-controlled** summary for GP, dietitian, physiotherapist, trainer, pharmacist, specialist service, parent or carer. The user chooses what is shared. |
| **Schedule and Friction** (11) | Embeds the plan into the existing calendar rather than asking the user to build a new routine around it. |

**Agent 17 — Safety and Escalation Guardian — has authority over every other agent.** It can
block weight-loss plans, suspend calorie targets, disable competitive features, restrict food
scoring, force maintenance mode, and activate child-safe, frailty or eating-disorder
safeguards. This is the correct architecture: safety is a supervisor, not a peer.

**Adherence ranking** is formalised:

```
rank = (health_value × safety × completion_probability) ÷ friction
```

Note this is the same shape as the JESSIE-OS prescription scoring function (§10.2), where
safety is likewise a multiplier that can zero the result rather than a weight that can be
outvoted.

### Scorecard weighting change

BodyCommand rebalances the ten dimensions — Food-pattern quality and Movement consistency
rise to 15% each, Behavioural stability rises to 10%, and **Measurement confidence** (5%)
replaces the earlier Recovery/sustainability split. BMI remains visible but **does not
dominate the score**.

### Additional dashboards

Body-Trajectory **Fan Chart** (conservative / expected / optimised) · FoodLens Nutrition
Radar · Behaviour Heatmap by day, hour, location, meal, emotional and work context.

---

## Open items before build

1. **§0 governance decision** — A, B or C. Everything else is blocked on this.
2. `PlanAction` interface is undefined.
3. Eating-disorder screening instrument not named; escalation routing not specified.
4. Child centile data source not named (UK-WHO vs UK90).
5. Relationship to the JESSIE-OS six-mode model — Body Balance pathways and age modes are
   two different taxonomies over the same users and must be reconciled.
6. Whether the safety-escalation agent constitutes a medical-device function under UK MDR.
   This is the same class of question as JESSIE-OS open decision **O3**, and would gate
   release the same way.
