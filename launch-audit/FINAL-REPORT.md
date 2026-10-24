# Launch audit — final report

MASTER PROMPT v2, run against JESS MOVE in a local isolated environment.

---

## 1. Executive verdict

**NO-GO for public launch. CONDITIONAL GO is available for a restricted
launch** once H-1 and H-3 are confirmed.

| | |
|---|---|
| Release candidate | `55c4ba6` (audit began at `a41e5f2`) |
| Branch | `claude/jessie-os-spec-doc-7audof` |
| Environment | local isolated stack: Postgres 16 on :5433, API on :4100, site on :3100 |
| Test period | 2026-10-24 |
| Cycles run | 6 (recon, then five fix–retest–regression passes) |
| Confidence | **72 / 100** — see §6 for what that number is made of and what it excludes |
| Risk level | **Medium**, reduced from High |

**The hard reality.** The platform is better engineered than most
pre-launch products I have taken apart: the authorisation boundary is
intact across all 188 routes, 750 hostile payloads produced no 500 and
leaked nothing, the upload surface reads magic bytes rather than trusting
extensions, money is idempotent under concurrency, and the codebase
argues with itself in comments about decisions it got wrong before. It is
not, however, launch-ready — and the reason is not the code. **Five of
the nine defects found were controls that passed while testing nothing**,
including a public promise about deleting a child's health data that was
false, badged "ENFORCED BY A TEST", and backed by a test that deleted
three rows with its own SQL and never called the product. An unrestricted
GO is additionally unavailable on evidence: three mandatory gates cannot
be closed from an environment that cannot reach production, has no
staging, and holds no payment credential, and I will not issue a verdict
those gates have not earned.

---

## 2. Immediate launch blockers

| ID | Sev | Area | Defect | Impact | Evidence | Correction | Status |
|---|---|---|---|---|---|---|---|
| **D-001** | **P1** | Privacy | A confirmed account deletion left the member in every table written | A child's kcal band derived from their weight, a declared cuisine (Art. 9 special category), their activity log — all surviving an erasure request, under a public page promising otherwise | `POST /auth/me/delete` → `201 {"deleted":true}`, member present in 7 of 7 tables | migration 0035: 12 cascading FKs; claim rewritten; test replaced | **FIXED** |
| **H-1** | — | Deploy | 0035 unapplied in production | the fix above is not live | this environment cannot reach production | deploy, confirm 35 migrations | **BLOCKED — human** |
| **H-3** | — | Security | Node version unknown in production | Oct 2026 RCE-class fixes | container runs 22.22.2, below the floor | confirm 22/24/26 at or above patch | **BLOCKED — human** |

Nothing else outstanding is P0 or P1.

---

## 3. Gate results

| # | Gate | Status | Evidence / remaining risk |
|---|---|---|---|
| 1 | Build integrity | **PASS** | deterministic build from a clean clone, traceable to `55c4ba6`; 1,017 tests running and passing; typecheck clean **including the test suites**, which it was not before this audit |
| 2 | Truth & fitness for purpose | **PASS** | every claim traced; D-001's false claim corrected; no absolute claims, no vendor names. Gate 2's own question measured: **a novice reaches a usable signed-in account in 20.6s** on a 360px Android at 400kbps/400ms, unaided, against a ten-minute bar |
| 3 | Critical functionality | **PASS** | 43/43 browser journeys, smoke 88/88, no false success, no duplicate transactions |
| 4 | Security | **CONDITIONAL** | zero open P0/P1; no authz bypass; no cross-tenant leak; no secret in 1.66MB of bundle; 750 hostile payloads clean; `pnpm audit` zero at every severity. **Blocked on H-3** |
| 5 | Data integrity | **CONDITIONAL** | transactional writes, 21/21 schema constraints, restore drill proven (58 tables, 918 rows, 207 constraints). **Blocked on H-1** |
| 6 | Financial integrity | **PARTIAL** | 16/16 money-integrity against real Postgres: idempotent webhooks, one release under concurrency, zero ledger difference. **No live path tested — no key exists (H-2)** |
| 7 | Performance | **PASS** | p99 11ms alone, 51ms at 20-way, 0% errors under a 200-way spike, no soak drift; LCP 3,976ms on 3G against a 4,000ms target |
| 8 | Reliability | **PARTIAL** | dependencies fail gracefully, bounded retries, no cascade. **Rollback not drilled — no staging (H-4)** |
| 9 | Observability | **FAIL** | `x-request-id` on every response, 72 structured log sites. **No error monitoring, no APM, no alerting** — and adding one is a vendor decision the directive reserves to the owner (H-5) |
| 10 | Privacy & compliance | **CONDITIONAL** | deletion now structural and tested end to end; consent banner's hidden decline button fixed. **Blocked on H-1; Children's Code conformance unassessed (H-8)** |
| 11 | Operational readiness | **FAIL** | no incident process, no runbook for the failures injected, no named on-call. Organisational account ownership unverifiable from here |

**Four gates do not pass. Three of those four cannot be closed from this
environment at all.**

---

## 4. Truth audit summary

28 public routes rendered and read; every claim traced to the code meant
to keep it.

| Status | Count | Notes |
|---|---|---|
| REAL | majority | including specific technical promises that checked out — the `ON DELETE CASCADE` coverage of the four tables it names, the k-anonymity floor of 8, `MIN_TRANSACTION_GBP` |
| PARTIAL → corrected | **1** | **D-001.** "Deleting an account deletes everything derived from it" was true of 5 tables and false of 16 |
| STUBBED | **0** | no fake dashboard, no hard-coded demo data, no AI feature returning canned text, no button without a handler |
| ABSENT | **0** | nothing claimed in the present tense that does not exist. SMS, WhatsApp, smart-TV, voice, the public API and organisation analytics are all named **"In build"** on `/status`, not advertised |

Also checked and clean: no absolute claims ("100% secure", "clinically
proven", "guaranteed"), no AI vendor or model name on any public page, no
invented statistic — the one numeric comparison on the landing page is
rendered as a dashed outline labelled `target` precisely because it has
never been measured.

**Prices are published**, from `PLANS` in `packages/shared`, the same
source that drives Stripe checkout: Free £0, Premium £5.99/month, Family
£12.99/month, Organisation from £2 per employee/month.

---

## 5. Novice-user findings

Mind 2, on a 360×760 Android over 400kbps/400ms, in a cold browser.

**Time to value: 20.6 seconds** to a usable signed-in account, unaided.

| Found | Severity | Status |
|---|---|---|
| Plan-card CTAs read "Start free" and went to a brochure | P2 | **FIXED** (D-004) |
| "Start free" opened a form headed "Sign in", asking for a password a new user does not have | P2 | **FIXED** (D-005) |
| The register form then arrived **eight seconds** after the person did, on slow 3G | P3 | **FIXED** (D-005b) |
| The consent banner's "No thanks" was invisible at **1.05:1** | P2 | **FIXED** (D-009) |

Clean on the same pass: no horizontal scroll at 360px; a 48×48 menu
toggle with 61px links, `aria-expanded` maintained and Escape closing it;
two clear routes to register from the mobile menu; errors in plain
language; names with accents and apostrophes accepted.

---

## 6. Coverage

| Suite | Result |
|---|---|
| Unit and integration | **1,017 passing, 0 failing** (962 backend, 27 body-command, 28 foodlens) |
| Typecheck | clean, including test suites |
| Build | clean |
| Dependency audit | **zero known vulnerabilities at any severity** |
| Smoke (signed out) | **88/88** |
| Adversarial probe | **38/38**, 2 warnings |
| Hostile payload sweep | **750 requests across 50 write endpoints, 0 failures** |
| Injection corpus | **11/13 blocked**, 0 false positives on two member corpora, fence 5/5 |
| Money integrity | **16/16** against real Postgres |
| Recovery and deletion | **11/11** |
| Schema constraints | **21/21** |
| Browser journeys | **43/43** in Chromium |
| Contrast | **7,456 nodes / 28 routes**, none below AA, *with the consent banner rendering* |
| Layout | clean at 1440px and 390px |
| CSP | 9/9 routes, 0 refusals, `script-src` exercised through the consent path |
| Load | 0% errors under a 200-way spike |
| Upload attacks | SVG, HTML, ELF, ZIP, PHP, GIF/JS polyglot, traversal — all refused |
| Routes | **188 scanned**, 1 member-facing with no caller |

**Not covered, and the reason:** live payments (no key), production
anything (network policy), rollback (no staging), alert firing (no
monitoring), model behaviour under a fenced injection payload (no
provider), Children's Code conformance (needs a lawyer).

---

## 7–14. Findings by area

Full records with reproduction steps, root cause and retest evidence are
in **`launch-audit/defects.md`**. Summary:

| ID | Sev | Area | Status |
|---|---|---|---|
| D-001 | **P1** | Deletion left a member's health data in 16 tables | FIXED |
| D-004 | P2 | Plan CTAs routed converting visitors to a brochure | FIXED |
| D-005 | P2 | "Start free" opened a sign-in form | FIXED |
| D-005b | P3 | The register form arrived 8s late on slow 3G | FIXED |
| D-006 | P3 | A string arrived where a trolley belonged | FIXED |
| D-007 | P2 | 9 of 13 public injection payloads reached the model | FIXED |
| D-008 | P2 | My own CSP blocked the API without the env var | FIXED |
| D-009 | P2 | The consent banner hid its own decline button | FIXED |
| D-002 | P3 | 10 tables cannot hold a member id | RECORDED |
| D-003 | P4 | `/pricing` 404s; prices are on the landing page | RECORDED |

**Architecture.** No duplicate implementations, no shadow integrations,
no dead code beyond D-002. Single points of failure: Postgres (degrades
to five read routes rather than dying, proven), the AI gateway (falls
back across providers then serves cached prescriptions). Both Vercel
projects' account ownership is unverifiable from here.

**Fraud and abuse.** Credential doors rate-limited per address in
`door_attempts` — durable, so it survives a restart and spans instances —
with a security event on each refusal and a proof-of-work token age that
a script cannot buy. No anonymous path to paid AI exists at all.

---

## 15. Fixes implemented

Nine defects fixed across six commits, each with a failing test written
first and **each verified by reverting the fix and watching the check
fail**:

| Commit | What |
|---|---|
| `d3d90d3` | migration 0035 — deletion made structural; claim corrected; test replaced; coverage guard added |
| `aac3a3b` | plan-card CTA; register intent; join-button scan |
| `48da371` | basket DTO; 750-payload sweep |
| `8ea84cc` | eight injection patterns; public corpus pinned as a test |
| `3d4eeb6` | CSP origin set; three guard defects |
| `8f15475` | consent banner contrast; banner-measured note |
| `55c4ba6` | server-rendered register form |

---

## 16. Unresolved risks

**Accepted:** two injection payloads reach the model fenced rather than
refused — markdown image exfiltration (no surface renders member text as
markup) and `Disregard the above. New task:` (blocking it would refuse
"ignore the previous advice", which is a member describing clinical
advice). Both pinned by a test with the reasoning.

**Deferred:** D-002's dead tables; the eleven double-verifying
controllers; no linter; the half-hourly cron; CI not running the browser
and adversarial suites.

**Blocked:** everything in §17.

**Assumption stated:** that production's schema matches this one. I have
no way to check it.

---

## 17. Human Action List

In **`launch-audit/human-actions.md`**, with owner, why it blocks, and
what I do the moment it is supplied.

**Blocking:** H-1 deploy and confirm 0035 · H-2 Stripe keys or a decision
not to charge yet · H-3 confirm production's Node version.

**Blocking a *verified* launch:** H-4 a staging environment · H-5 error
monitoring, which is a vendor decision the directive reserves to the
owner · H-6 wearable OAuth credentials · H-7 a named newsletter reviewer
· H-8 legal sign-off, including Children's Code conformance.

---

## 18–19. Pre-launch plan and launch configuration

**Before any launch:** H-1, H-3.
**Before a restricted beta:** H-2 or an explicit decision not to charge;
H-5 or an accepted blind spot written down.
**Before public launch:** H-4, H-8, and Gate 11 — an incident process, a
runbook and a named on-call.
**Within 7 days:** add the browser and adversarial suites to CI; decide
D-002.
**Within 30 days:** converge the eleven controllers on `@CurrentSession`;
decide on a linter.

**Restricted launch configuration, if taken:** invite-only; UK only;
Stripe surfaces hidden while `off=stripe`; wearables continuing to name
what is missing; the blog's human review gate untouched;
`NEWSLETTER_AUTO_APPROVE_BY` left unset so issues stop in review; rollback
trigger = any P0/P1 or a `/api/health` database row not `ok`; kill switch
= `AUTH_ENFORCE` and the feature flags already in `packages/shared`.

---

## 20. Final decision

> **This release is not approved for public launch.**

It is approvable for a **restricted launch** — invite-only, UK, no
payments — once H-1 and H-3 are confirmed, with H-5 accepted in writing
as a known blind spot.

The engineering is sound and the nine defects are fixed, tested and
pushed. What stands between this and a GO is not more code: it is three
gates that need production access, a staging environment and a monitoring
decision, and I will not sign off gates that have not been earned with
evidence.

---

## The pattern worth more than any single fix

**Five of the nine defects were controls that passed while testing
nothing.**

- A deletion test that deleted three rows with its own SQL, never called
  the product, and chose the only three tables where survival is correct
  — cited on a public page as "ENFORCED BY A TEST".
- A guard allowlist whose two exemptions carried plausible reasons that
  did not describe the risk they were excusing.
- A guard scanner that read a decorator named in a comment as applied,
  and whose chunks ran forward so an unguarded route inherited the next
  route's guard.
- A CSP verified under one configuration — the only one where its bug is
  invisible.
- A contrast sweep that had never rendered the component with the
  failures, because one environment variable was unset.

And while fixing them I wrote four more of the same: a consent button
matched by a guessed name, a "nothing refused" that never established
anything was tried, a comment-stripper that ate every URL, and a slice
that ran backwards and compared an empty array to an empty array. Three
were caught by sanity checks I had just added. One was caught by the
repository's own member corpus.

Two habits found all of them, and both are now in the suites rather than
left to whoever looks next:

1. **Assert that the scan found something before asserting it found
   nothing wrong.** `check:csp` fails when no policy was served; the
   guard scan fails below 100 routes parsed; the contrast audit says when
   it never drew the banner; the probe says out loud when it could not
   make its assertion.
2. **Revert the fix and watch the check fail.** A check never observed
   failing is a check with no evidence behind it. Every fix in §15 was
   verified this way.

A green suite that checks nothing is the one failure a test suite cannot
report on itself.
