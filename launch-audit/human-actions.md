# Human Action List

Everything only a person can do. Each item says what is needed, why it
blocks, and what I will do the moment it is supplied.

---

## Blocking an unrestricted launch

### H-1 — Deploy and confirm migration 0035 applied

**Owner:** whoever can read the Vercel dashboard or `/api/db/status`
**Blocks:** Gate 5 (data integrity), Gate 10 (privacy)

Migration 0035 is the fix for **D-001**, where a confirmed account
deletion left a child's health data in the database. It has been applied
and verified against a real Postgres 16 **here**, and never against
production — this environment cannot reach `api.jessmove.com`
(`CONNECT tunnel failed, 403`, by network policy).

What is needed: deploy, then confirm `/api/db/status` reports **35
migrations**.

Two things to know before you do. The migration clears orphan rows before
each `ALTER`, so it cannot fail on an orphan — all sixteen candidate
tables had zero here, and the `DELETE` is there because an `ALTER` that
finds one takes the deployment down with it. And it runs under the
existing advisory lock on first boot, so a concurrent deploy will not
apply it twice.

**The moment it is confirmed:** I re-run `pnpm verify:recovery` against
that deployment and record the result in `STATE-OF-PLAY.md`.

### H-2 — Stripe keys, or a decision not to take money yet

**Owner:** whoever holds the Stripe account
**Blocks:** Gate 6 (financial integrity) on the live path

`STRIPE_SECRET_KEY` and the endpoint's `whsec_` are unset
(`/api/health` reports `off=stripe`). No payment can be taken — and, by
design, nothing can grant allowance either, so this is a safe state
rather than a broken one.

What this audit **could** prove: 16/16 money-integrity checks against real
Postgres — a repeated webhook creating no repeated money, a due deposit
released exactly once under concurrency, unbilled compute recorded once.
What it **could not**: a single real charge, refund, chargeback, or
Stripe-signed webhook, because there is no sandbox key here.

**The moment sandbox keys exist:** I run the full 6.12 battery — success,
cancel, abandon, timeout, duplicate and forged webhooks, partial and full
refunds, upgrade, downgrade, failed renewal, grace, and a ledger
reconciliation that must come to zero.

### H-3 — Confirm the Node version on both Vercel projects

**Owner:** whoever can read the Vercel project settings
**Blocks:** Gate 4 (security)

October 2026 brought high-severity Node fixes, the worst allowing code
execution on the server. The patched releases are 22.23.4, 24.22.1 and
26.12.1. `/api/health` publishes the verdict without the version, on
purpose — a precise patch number on an unauthenticated endpoint is what
somebody probing for that fault wants.

This container runs 22.22.2, which is **below** the floor. Production's
version is unknown from here.

**The moment it is confirmed as 22, 24 or 26 at or above those patches:**
`checks.runtime` on `/api/health` reads `ok` and `/status` turns that row
green with no code change.

---

## Blocking a *verified* launch, not the launch itself

### H-4 — A staging environment

**Owner:** whoever owns the Vercel account
**Blocks:** Gate 8 (reliability — rollback tested)

None exists. Section 4.6 of the brief says that if staging does not
exist, creating a safe isolated environment is the first fix: I created
one locally (Postgres 16 on :5433, API on :4100, site on :3100) and every
result in this audit comes from it. What a local stack cannot give is a
**deploy → smoke → rollback → redeploy** drill against a real target.

Backup and restore *is* proven: 58 tables, 918 rows, 35 migrations and
207 constraints rebuilt from a dump into an empty database and compared,
restore completing in 1.3s.

### H-5 — Error monitoring and alerting, which means a vendor decision

**Owner:** the product owner
**Blocks:** Gate 9 (observability)

There is no error monitoring, no APM, no tracing and no alerting. What
exists is good and unwatched: `x-request-id` on every response, 72
structured log sites across 40 services, and a `/status` page that
already tells the public most components have nothing watching them.

This is **not** something I should fix unasked. The directive permits no
vendor beyond Vercel and Firebase, with Meta Pixel and Google Tag added
deliberately — and it says adding a third is a new decision, not a
precedent those two set. Sentry or equivalent is exactly that decision.

**The moment a choice is made:** I wire it, trigger controlled failures,
and prove each alert fires and carries enough context to act on.

### H-6 — Wearable OAuth credentials

**Owner:** whoever can apply to the provider programmes
**Blocks:** nothing else; it is the last member-facing route with no caller

`POST /wearables/callback` is the one member-facing route of 188 that
nothing reaches. It needs registered client credentials for Fitbit,
Garmin, Oura and Polar; two of the four are partner programmes with an
application queue. Until then `/wearables/providers` names exactly what
is missing rather than pretending the provider is available, which is the
right behaviour.

### H-7 — A named reviewer for the newsletter, or leave it in review

**Owner:** the person who would be accountable

`NEWSLETTER_AUTO_APPROVE_BY` is unset, so the weekly scheduler composes
the issue and stops. Setting it to a name means that person takes
standing responsibility for copy they will not have read before it goes
out, and their name is recorded on every issue sent.

It is defensible here and the code argues it well: newsletter copy is
assembled from `LINK_TARGETS`, which is human-written and already
published, so approving the mechanism once is approving the output. It is
still a person accepting accountability, not a configuration value.

The blog is different and must stay different: `canTransition('draft',
'published')` is `false` and tested, because an agent writes original
health prose there.

### H-8 — Legal sign-off on the public claims

**Owner:** a lawyer, not an engineer

The surface is present and checked: company identity, refund and
cancellation, cookies, under-18 and guardian rules, ICO and supervisory
authority, complaints, VAT. No absolute claims survive — no "100%
secure", no "clinically proven", no fabricated testimonial, and no AI
vendor or model name on any public page.

Two things need a lawyer rather than a scan. The **D-001 wording** now
states that four financial tables are retained after deletion under UK
GDPR Article 17(3)(b) and UK company and tax law — that reasoning should
be confirmed by somebody who can be held to it. And this platform
processes **children's health data from age 10**, which engages the ICO
Children's Code; nothing in this audit assessed conformance with it.

---

## Not blocking, recorded for a decision

- **Ten tables declare `user_id uuid`** while `app_users.user_id` is
  text, so they cannot hold a member id (`acu_wallets`, `agent_actions`,
  `capability_profiles`, `chains`, `consents`, `context_decisions`,
  `nudges`, `prescriptions`, `sessions`, `sparks_ledger`). A dead
  identity scheme. Migrating the column type and wiring them up, or
  dropping them, is a data decision — and dropping tables is
  irreversible, so I did neither. **D-002.**
- **`/pricing`, `/safety`, `/careers` and `/press` return 404.** Prices
  themselves are published on the landing page from `PLANS`, the same
  source that drives Stripe, so this is navigational rather than legal.
  **D-003.**
- **Eleven controllers verify the session a second time** though the
  global guard has already attached it. Duplication, not a defect — and
  the reason a decorator audit could not see either authorisation hole.
  The right time to converge on `@CurrentSession` is when one of those
  files is being changed for its own reasons.
- **No linter.** Adding ESLint across four packages is the owner's call.
  Four structural tests now cover the class of bug that actually bit.
- **The half-hourly nudge cron** is withheld pending the Vercel plan;
  Hobby allows daily only.
- **CI does not run** the browser audits, the adversarial probe, money,
  recovery or load — they need a built frontend, a running server and
  Chromium. Worth adding; not done here because a workflow change cannot
  be tested from this machine.
