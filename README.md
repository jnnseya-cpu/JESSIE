# JESSIE-OS™

**Just Enough Somatic Stimulus Intelligence Engine**

> Movement, engineered into the gaps. Ten to a hundred. Every body qualifies.

An AI Movement Infrastructure Operating System. It ingests a person's calendar, context,
capability and history, and answers one question no existing platform answers well:

> *Given everything true about this human right now, what is the single best two-minute movement
> they will actually do in the next 45 minutes — and how do I make them want to?*

| Surface | Name |
|---|---|
| Platform / operating system | **JESSIE-OS™** |
| Consumer app | **Jessie** |
| AI coach persona | **Jess** |
| Atomic unit | **the Snap** (90–300 seconds) |

---

## Repository layout

```
JESSIE/
├─ apps/
│  ├─ backend/          @jessie-os/backend   — NestJS API + agent runtime
│  └─ frontend/         @jessie-os/frontend  — Next.js 14 (App Router) site & consoles
├─ packages/
│  ├─ shared/           @jessie-os/shared        — domain model, contracts, design tokens
│  ├─ body-command/     @jessie-os/body-command  — BodyCommand AI: pathways, guardian, ACU maths
│  └─ foodlens/         @jessie-os/foodlens      — FoodLens 360°: evidence and confidence
├─ db/
│  ├─ migrations/       Postgres schema — invariants enforced in the database
│  └─ test/             constraint tests: every rule proven to reject bad writes
└─ docs/
   ├─ JESSIE-OS-SPEC.md    — the production specification (v1.0, JS-01)
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
pnpm --filter @jessie-os/backend test    # the Charter CI gate
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

Canonical tokens live in `packages/shared/src/design.ts` and are mirrored once into
`apps/frontend/app/globals.css`. Do not introduce hex values outside that block.

Minimum body type is 17px, rising to 22px in Silver Mode and 26px in Centennial Mode. WCAG 2.2
AA is the floor and AAA is required in Kid, Silver and Centennial. All motion respects
`prefers-reduced-motion`, and nothing flashes above 3Hz.

---

## Regulatory posture

JESSIE-OS is a **general wellness product — not a medical device.** It does not diagnose or
treat, does not replace clinical care, and never contacts emergency services. Any move toward
clinician-prescribed rehabilitation with therapeutic claims (Care Link Pro) triggers a formal
medical-device classification review **before** release. That is a hard gate on the roadmap.

Every population-health and clinical claim in the commercial surface must be sourced, dated and
signed off by the Clinical Safety Officer against current UK CMO guidance before publication.
This repository states the *shape* of the evidence; the Clinical Evidence Register holds the
citations.

---

*Authored by Jessie. Engineered under NSEYA X-EXECUTE.*
