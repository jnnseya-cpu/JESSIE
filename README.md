# JESS MOVE

**Small Moves. Powerful Change.**

> Jess Move AI — Your Daily Movement and Body-Balance Operating System.
> An AI-powered micro-movement, food intelligence and healthy-lifestyle platform, ages 10 to 100.

Meeting a weekly exercise target does not cancel the risk of spending the rest of the day
sitting. That gap is the product. Jess Move ingests a person's schedule, context, capability
and history and answers one question no existing platform answers well:

> *Given everything true about this human right now, what is the single best two-minute movement
> they will actually do in the next 45 minutes — and how do I make them want to?*

| Surface | Name |
|---|---|
| Platform / operating system | **JESS MOVE** |
| Consumer app | **Jess Move** |
| AI coach persona | **MOVA** — Movement Optimisation and Vitality Assistant |
| Atomic unit | a **micro-movement** (90–300 seconds), delivered as a **mission** |

### The six adaptive modes

| Mode | Ages | Built to solve |
|---|---|---|
| Explorer | 10–12 | Adventure, not health. Screen-break missions, coordination, classroom-safe play |
| Teen | 13–17 | Autonomy and identity. Revision resets, gaming recovery, private crews |
| Momentum | 18–39 | Hybrid work, commuting, early parenting. Meeting recovery and stress resets |
| Balance | 40–64 | Stiffness prevention, joint-friendly strength, sustainable weight management |
| Independence | 65–79 | Balance, lower-limb strength, grip and gait — staying independent |
| Vitality | 80–100 | Dignity and simplicity. Seated, carer-assisted, voice-operated |

Mode is derived from a verified age band plus a capability profile. It is never chosen freely,
because it governs safeguarding rules rather than preferences.

---

## Repository layout

```
jessmove/
├─ apps/
│  ├─ backend/          @jessmove/backend   — NestJS API + agent runtime
│  └─ frontend/         @jessmove/frontend  — Next.js 14 (App Router) site & consoles
├─ packages/
│  ├─ shared/           @jessmove/shared        — domain model, contracts, design tokens
│  ├─ body-command/     @jessmove/body-command  — BodyCommand AI: pathways, guardian, ACU maths
│  └─ foodlens/         @jessmove/foodlens      — FoodLens 360°: evidence and confidence
├─ db/
│  ├─ migrations/       Postgres schema — invariants enforced in the database
│  └─ test/             constraint tests: every rule proven to reject bad writes
└─ docs/
   ├─ JESS-MOVE-SPEC.md    — the production specification (v1.0, JS-01)
   └─ BODY-BALANCE-AI.md   — BodyCommand AI (C6 resolved: scoped carve-out)
```

> **On C6 and body metrics.** The OS serves children and adults from one engine.
> Charter rule C6 is scoped by audience, not removed: never surfaced under 18 in any
> mode under any consent; opt-in and never competitive for adults. `bodySurfacePolicy`
> is the single gate and does not consult the consent flag below 18. See
> `docs/BODY-BALANCE-AI.md` §0.

`packages/shared` is the single source of truth. Both applications compile against it, so a
contract change breaks the build on both sides rather than at runtime.

---

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in at least one AI provider key
pnpm build                  # shared → backend → frontend
pnpm dev                    # backend :4000 · frontend :3000
```

Node ≥ 20.11, pnpm 10.

### Per-package

```bash
pnpm build:shared
pnpm build:backend
pnpm build:frontend
pnpm typecheck              # across the workspace
pnpm --filter @jessmove/backend test    # the Charter CI gate
```

---

## The AI Gateway

One interface, three providers. Agents never talk to a vendor SDK directly — the gateway owns
provider selection, the fallback chain, prompt redaction, the per-agent ACU cost ceiling, the
request timeout and the decision log.

| Provider | Package | Mid-tier default | Frontier default |
|---|---|---|---|
| Anthropic | `@anthropic-ai/sdk` | `claude-sonnet-5` | `claude-opus-5` |
| OpenAI | `openai` | `gpt-4.1-mini` | `gpt-4.1` |
| Google Gemini | `@google/genai` | `gemini-2.5-flash` | `gemini-2.5-pro` |

Routing follows the agent registry: each of the 26 agents declares a `modelClass`, so
`CLIN` and `STUDIO` route to the frontier tier while `CTX` stays on-device and `NUDGE` is a
contextual bandit rather than a language model at all.

```
AI_DEFAULT_PROVIDER=anthropic
AI_FALLBACK_ORDER=anthropic,openai,gemini
```

Unconfigured providers are skipped rather than failing. If a provider declines a request
(`stop_reason: refusal` on Anthropic, `content_filter` on OpenAI, `SAFETY` on Gemini) the
gateway walks to the next link in the chain. When every provider fails it throws
`AiGatewayError`, and the caller falls back to the cached prescription plan — **the user must
never see a broken app because a model is slow.**

Adding a fourth provider means implementing `ModelProvider` and registering it. No call site
anywhere else in the platform changes.

---

## API

Base path `/{API_PREFIX}` (default `/api`). Every response is wrapped in the standard envelope
and carries the signature line.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness plus AI-gateway status |
| `GET` | `/system` | The operating system's invariants, machine-readable |
| `GET` | `/ai/providers` | Provider configuration and resolved models |
| `POST` | `/ai/complete` | Gateway completion, agent-scoped |
| `GET` | `/movements` · `/movements/gate` | Library and the publishing contract |
| `POST` | `/movements/:id/check` · `/publish` | Gate dry-run and publish attempt |
| `POST` | `/prescriptions/next` | **The core call** — the next best Snap |
| `POST` | `/body/assess` · `/body/plan` | Pathway, safety and the daily plan (all ages) |
| `GET` | `/body/pathways` · `/scorecard` · `/agents` | The nine pathways, the weighting, the nineteen agents |
| `GET` | `/acu/policy` · `POST /acu/quote` | Published economics; price an action before running it |
| `POST` | `/acu/wallets/:id/spend` | Cost Governor — 4× rule, bucket precedence, hard stop |

`POST /prescriptions/next` returns either a Snap or an explicit hold. It is never a hard error:

```jsonc
// user is driving
{ "held": true, "reason": "The user cannot move right now.",
  "blocks": ["driving"], "retryAfterSeconds": 900 }
```

---

## The four laws, in code

| Law | Where it lives |
|---|---|
| **1 — Just Enough** | `MAX_WEEKLY_ESCALATION = 0.07`; dose calibration in `PrescriptionsService` |
| **2 — No Empty Nudges** | `ContextService` returns `blocked`/`defer`; a Snap cannot be built without a `contextDecisionId` |
| **3 — Every Body Qualifies** | `evaluatePublishGate()` — five variants × six cue sets × passed screening, no bypass |
| **4 — Never Weaponise the Streak** | `NON_PENALISING_OUTCOMES`, Grace Tokens, Flare Mode, Bereavement Hold |

### The Charter is a failing test

The Ethical Gamification Charter (§13.6) is asserted in `apps/backend/test/charter.test.ts`.
A build that violates it fails the pipeline — no paid streak restoration, no loss framing, no
bottom-of-leaderboard exposure, no body-composition language at any age, in any mode.

```bash
pnpm test                   # every package
# charter 14/14 · body-command 25/25 · foodlens 11/11
```

### The database enforces it too

The schema is not a passive record. A Snap outside 90–300 seconds, a prescription without a
context decision, a minor without a guardian, a cohort report below k=8, or an ACU debit
charging under 4× provider cost are all rejected by Postgres itself.

```bash
DATABASE_URL=postgres://... pnpm db:migrate && pnpm db:test
# 14 invariants, each proven to reject the write that violates it
```

### Privacy is architecture, not policy

`suppressBelowThreshold()` enforces k-anonymity of 8 on every cohort value. There is no
override role and no privileged path — an employer-facing individual view does not exist in the
type system, let alone the API.

---

## Design system

Canonical tokens live in `packages/shared/src/design.ts` and are mirrored once into the
`:root` block of `apps/frontend/app/globals.css`. Do not introduce hex values outside it.

| Token | Hex | Meaning |
|---|---|---|
| `--jm-navy` | `#102A43` | Trust, depth, authority. Navigation, headers, dark mode |
| `--jm-teal` | `#00A99D` | Health, momentum. Primary buttons, completion, progress |
| `--jm-lime` | `#B7E436` | Energy, achievement. Rewards, streaks, celebration |
| `--jm-blue` | `#3487F7` | Intelligence, clarity. AI, wearables, data, links |
| `--jm-purple` | `#7656E8` | Personalisation. BodyCommand, specialist pathways |
| `--jm-coral` | `#FF6B5E` | Attention without danger. Challenges, missed-action recovery |
| `--jm-orange` | `#F59E3D` | FoodLens, nutrition, meal insight |
| `--jm-sky` | `#67C5EB` | Hydration, sleep, breathing, recovery |
| `--jm-magenta` | `#D84F9A` | Strength, muscle protection, recomposition |

Health-state colours (`excellent`, `positive`, `monitor`, `action`, `critical`, `information`,
`specialist`, `unavailable`) are separate from the brand ramp. **Two rules are absolute:**

1. Colour is never the only way information is communicated — every status travels with an icon
   or a label.
2. Red is for safety, allergy conflict, account security and critical system warnings. It is
   never used because somebody missed a movement or ate an energy-dense meal.

Type is Inter for the interface and Manrope for display, with Nunito Sans in Explorer Mode.
Minimum body size is 16px, rising to 18px in Independence and 20px in Vitality. WCAG 2.2 AA is
the floor and AAA is required in Explorer, Independence and Vitality. Pointer targets clear the
24 × 24 px WCAG minimum by a wide margin — 48px standard, 56px in later-life modes. All motion
respects `prefers-reduced-motion`, and nothing flashes above 3Hz.

### Unit economics — internal

`packages/shared/src/economics.ts` prices the whole stack: AI inference, Google Cloud and
Firebase, SMS and WhatsApp, Stripe, VAT, and the human cost of support, content, clinical
review, compliance and safeguarding. `PROFIT_MULTIPLE = 2` — net revenue must be at least
twice fully-loaded cost — and it sits on top of the AI provider-protection rule rather than
replacing it. `MIN_TRANSACTION_GBP = 5.00`: `assertChargeable()` throws rather than taking a
payment that loses a disproportionate share to fixed fees.

```bash
pnpm economics            # the full model, in the terminal
pnpm economics --json     # machine-readable
```

**This is not published.** Per-user cost, supplier unit rates, overhead composition,
contribution and margin are commercially sensitive and appear on no public page. What
customers see is the part that affects them: prices, the £5 floor, the ACU allowance, and a
quote before any expensive action runs.

### Public site

24 statically rendered routes: the landing page, one per OS surface (`/mova`,
`/micro-movement`, `/foodlens`, `/body-balance`, `/challenges`, `/wearables`), plus
`/how-it-works`, `/industries`, `/for-children`, `/for-adults`, `/get-started`, `/about`,
`/blog`, `/developers`, `/growth`, `/contact`, `/status`, `/policies`, `/terms` and
`/privacy`.
Every chart is hand-drawn SVG with no external dependency, no runtime fetch and no randomness,
so server output and client hydration are byte-identical.

---

## Regulatory posture

JESS MOVE is a **general wellness product — not a medical device.** It does not diagnose or
treat, does not replace clinical care, and never contacts emergency services. Any move toward
clinician-prescribed rehabilitation with therapeutic claims (Care Link Pro) triggers a formal
medical-device classification review **before** release. That is a hard gate on the roadmap.

Every population-health and clinical claim in the commercial surface must be sourced, dated and
signed off by the Clinical Safety Officer against current UK CMO guidance before publication.
This repository states the *shape* of the evidence; the Clinical Evidence Register holds the
citations.

---

*Authored by Jess Move. Engineered under NSEYA X-EXECUTE.*
