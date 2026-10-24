# Cycle 0 — scope, access and safety baseline

**Release candidate:** `a41e5f2d54bd00193a58301dcb01eaa69bb2efb9`
**Audit started:** 2026-10-24
**Environment under test:** local isolated stack (this container)

---

## Section 3 — platform context, derived

Section 3 arrived unfilled. Everything below is `[INFERRED]` from the
repository unless marked otherwise, with its source.

| Field | Value | Source |
|---|---|---|
| Platform name | JESS MOVE™ | `package.json` description, `packages/shared/src` BRAND |
| Value promise | "Just Enough Somatic Stimulus" — micro-movement, food intelligence and body balance for ages 10–100 | BRAND.descriptor, marketing pages |
| Platform type | SAAS + HEALTH/EDTECH hybrid, with AI agents and subscription billing | code structure |
| Production URL | `https://jessmove.com` (site), `https://api.jessmove.com` (API) | `vercel.json`, `apiBase()` |
| Staging URL | **none exists** | no config found |
| Repository | `jnnseya-cpu/JESSIE`, branch `claude/jessie-os-spec-doc-7audof` | git remote |
| Frontend | Next.js 15.5.28, React 19 | `apps/frontend/package.json` |
| Backend | NestJS 11 on Node 22 | `apps/backend/package.json` |
| Database | PostgreSQL (16 locally), self-migrating via `DbService.onModuleInit` | `db/migrations/`, `embedded-sql.ts` |
| Auth provider | **own implementation** — `jm_session` cookie or Bearer, `AUTH_SECRET`-signed, users in Postgres | `apps/backend/src/auth/` |
| Hosting / CDN / DNS | Vercel (two projects: `jessie-move`, `jessie-backend`) | `vercel.json`, deployment records |
| File storage | Vercel Blob, with a Postgres `media_objects` fallback and an in-memory fallback | `storage.service.ts` |
| Payments | Stripe (cards + subscriptions). **No mobile money.** | `apps/backend/src/stripe/` |
| Email / SMS / WhatsApp | SMTP only (Hostinger per `.env.example`). SMS and WhatsApp are declared *in build*, not implemented | `mail/`, `/status` page |
| AI providers | Anthropic, OpenAI, Google Gemini via an own gateway with a fallback chain | `ai/ai-gateway.service.ts` |
| Other third-party APIs | Open Food Facts (barcode), Fitbit/Garmin/Oura/Polar (OAuth, unconfigured), Meta Pixel, Google Tag | `foodlens/`, `wearables/`, `tracking.ts` |
| User roles | `adult`, `minor`, `platform_staff` (+ guardian relationship) | `auth/token.ts`, `AuthGuard` |
| Regions / languages / currencies | UK-first; `lang: en-GB`; GBP (`MIN_TRANSACTION_GBP=5`) | `manifest.ts`, `packages/shared` |
| Sensitive data | Health data (weight, BMI, conditions, food logs, movement), **children's data from age 10**, email, payment metadata, photographs of meals and faces | schema + `conditions.ts` |
| Expected traffic | **not specified anywhere** — logged as a launch risk | — |
| Critical journeys | register → verify → onboard → assess pathway → receive Snap → scan food → see band/programme → subscribe | derived from route map |

### Regulatory exposure implied by the above

This is a **health product processing children's data from age 10** in the
UK. That places it under UK GDPR Art. 9 (special-category data), the
ICO Age Appropriate Design Code (Children's Code), and PECR for the two
measurement vendors. Health claims additionally engage ASA/CAP rules and,
depending on wording, MHRA medical-device guidance. Section 6.15 and
6.22 test against these.

---

## Access actually available

| Capability | Status | Consequence for the verdict |
|---|---|---|
| Repository (read/write/push) | **YES** | fixes are possible |
| Terminal | **YES** | execution is possible |
| Real browser (Chromium + Playwright) | **YES** | UI and novice testing possible |
| Database | **YES — local Postgres 16 only** | integrity testing possible; production schema state unverifiable |
| CI definition (read, via `gh api`) | **YES** | can audit the workflow; cannot run Actions |
| Production environment | **NO — network policy refuses** (`CONNECT tunnel failed, 403`) | no claim about production is possible |
| Staging environment | **NO — none exists** | deploy/rollback drill impossible against a real target |
| Cloud console (Vercel) | **NO** | env vars, Node version, plan, domains unverifiable |
| Monitoring / APM / alerting | **NO** | alert-firing cannot be proven |
| Payment sandbox keys | **NO** (`off=stripe`) | no live-path payment test possible |
| Email/SMS sandbox | **NO** | delivery unprovable; template logic testable |
| Wearable OAuth credentials | **NO** (partner-gated) | provider callback untestable |

### Safety posture (Section 4.6)

- No production data is reachable, so destructive testing cannot touch it.
- All payment work is static/logic-level; **no charge of any kind is possible**
  because no key exists.
- No outbound mail is possible; SMTP is unconfigured, so notification tests
  assert on rendered output, not delivery.
- Isolated environment: created locally — Postgres 16 on `:5433`, API on
  `:4100`, site on `:3100`. This is the safe environment Section 4.6
  requires, since no staging exists.
- Secrets: `AUTH_SECRET` used locally is a throwaway string, never committed.

### Verdict ceiling, stated before testing begins

Mandatory gates 6 (financial integrity, live path), 9 (observability —
alerts firing), and 21 (deploy/rollback drill) **cannot be closed from
here**. Under Section 7 that caps the achievable outcome at **NO-GO or
CONDITIONAL GO**, regardless of how much passes. An unrestricted GO is not
available to this audit and will not be issued.
