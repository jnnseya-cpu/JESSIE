# Production readiness — final delivery report

**Verdict: PASS WITH NON-BLOCKING ISSUES.**

Everything that could be fixed and proven from this machine has been.
What remains needs a credential, a platform setting, or a product
decision — each is named below with who can close it. Nothing is left in
a half-finished state and nothing is reported as working that was not
observed working.

Branch `claude/jessie-os-spec-doc-7audof`, head `074ebef`.

One limit stated at the top, because it bounds every claim in this
document: **outbound HTTPS to `jessmove.com` and `api.jessmove.com` is
refused by this environment's network policy.** Every result below was
produced against a local build, a real Postgres 16 and a real Chromium.
No statement here is a claim about production.

---

## 1. What was wrong, and what is now true

### Two routes took an account identifier from the caller and never checked whose

`POST /push/subscribe` wrote `user_id` straight from the request body into
`push_subscriptions`. The scheduler reads that column to decide whose
Snaps go to an endpoint, so a request naming another member registered an
attacker-controlled endpoint against them — and `ON CONFLICT (endpoint) DO
UPDATE` made an existing subscription reassignable. Its native sibling
`POST /push/device` has always carried `@SelfOnly('userId')`, beneath a
comment calling the two the same promise.

The owner now comes from the verified session. `@SelfOnly` would have been
the wrong instrument: it refuses a request with no session, and a visitor
who has not signed in may still subscribe — they get a row owned by
nobody, which is what omitting the field already did.

`POST /accounts` reached `createAccount` with no credential. That is the
function `POST /auth/register` calls *after* taking one and confirming a
guardian where required, so this was a second way in that skipped the
first one's checks. And because `createAccount` refuses an id already in
use, a stranger could take a member's chosen id and block them from ever
registering it. Now `@AdminOnly`, like the sibling
`DELETE profiles/:userId` the code already calls the developer reset.

Both were verified fixed at runtime, not only in source: a request naming
a victim now stores `user_id` as NULL in real Postgres.

### The allowlist was the vulnerability

A scan for exactly this class already existed in `admin-guard.test.ts`
and worked. Both routes were on its `DELIBERATELY_OPEN` list, with reasons
that read well and were wrong — `subscribe` "holds nothing readable back"
(it holds the owner the scheduler reads), `createAccount` "the identity
table enforces the age and guardian rules" (true, and about data validity
rather than who may call it).

An exemption with a plausible reason is harder to see than a missing
decorator. Three things changed:

- An entry naming a route that is guarded or gone now **fails**, so the
  list cannot outlive its routes. It removed the last stale entry the
  first time it ran.
- The scanner's chunks, split on `@Post(`, ran forward to the next verb,
  so a route carried the **following** route's guard. An unguarded route
  followed by a guarded one read as guarded — every route in
  `push.controller.ts` but the last had that hole beneath it.
- A decorator *named in a comment* counted as applied, so the scanner
  could be silenced by prose. Comments are stripped first.

It also only covered `userId`; `uid`, `memberId` and `accountId` name the
same thing and passed unread.

### 943 tests were never type-checked

`tsconfig.json` excludes `test/`, and the suite runs under
`--experimental-strip-types`, which removes types without reading them.
Five defects were hiding in that gap, every one a test that passed while
asserting against `undefined`:

| Where | What |
|---|---|
| `gaps.test.ts` | `CONDITIONS.appetite_suppressing_command` — a typo for `_medication` |
| `accessibility-promises.test.ts` | `Object.keys(BRAND_COLOURS.status ?? {})` — no such key, so the one loop that would catch a status colour shipped without words (WCAG 1.4.1) ran **zero times** |
| `energy-band.test.ts` | `{ coveredDays: 2 }` spread into `EnergyBandInput`, which has no such field, so one of nine banned-lexicon cases silently duplicated another |
| `seo-autopilot.test.ts` | a fixture missing `answerWords` and `faqPairs`, the two fields the FAQ thresholds read |
| `foodlens-api.test.ts` | an unsound cast |

`tsconfig.test.json` now exists in the backend and both logic packages,
wired into `pnpm typecheck`.

### Dependencies: 33 advisories, two critical, now zero

An **unauthenticated remote code execution** in Next's image optimiser
when SVG files are used (≤15.5.27), and IP spoofing via an IPv4-mapped
IPv6 trust subnet in `proxy-addr`, which decides which client address
Express trusts. Fifteen high besides, including three denial-of-service
faults in `multer`, which parses every FoodLens upload.

Next to `^15.5.28`, plus eleven overrides pinned with a major-version
selector — the tree holds two Express generations, and an unqualified
override would force v4's `body-parser` and `qs` up a major. Two existing
pins, `fast-uri` and `brace-expansion`, had gone **stale below their own
advisories**, which is why the list now carries the instruction to
re-audit after any dependency change.

### The site sent no Content-Security-Policy

Five headers in `vercel.json`, no CSP in either place. Now in
`next.config.mjs`, with hosts derived from `NEXT_PUBLIC_API_BASE_URL` so
the policy cannot drift from the API the bundle calls.

It is in the Next config rather than beside the other five on purpose: a
platform header exists on a deployment and nowhere else, and a CSP's
failure mode is silently refusing something a page needs. There it is
served by `next start`, so `pnpm check:csp` exercises the real policy —
nine routes in Chromium, listening on both the
`securitypolicyviolation` event and the console.

`script-src` carries `'unsafe-inline'` and says so — Next injects inline
hydration scripts and a strict policy needs per-request nonces through
middleware. The value is `connect-src` bounding where an injected script
could send anything, plus `object-src`, `base-uri` and `form-action`.

### Obsolete code removed

`AbuseService` was registered in `AuthModule` and injected by nothing. It
metered a free allowance for strangers on the paid AI surfaces; two later
decisions took its job — the product stopped serving anonymous analysis
at all, and the credential doors moved to `assertHuman`, which counts
attempts per address in `door_attempts` and so survives a restart and
spans instances. Left in place it was worse than absent: a reader of that
module would conclude the platform had a rate limiter it was not calling.

### The environment contract

Nine variables were read by the code and documented nowhere: the five
`APNS_*` and three `FCM_*` native-push credentials, and
`NEWSLETTER_AUTO_APPROVE_BY` — which is not a convenience flag but one
named individual taking standing responsibility for copy they will not
have read before it goes out. `ANONYMOUS_AI_DAILY_LIMIT` is gone with the
service that read it, and `.env.example` says why rather than leaving a
hole.

---

## 2. What was audited and found already sound

Stated because "we looked and it was fine" is a result, and re-auditing it
next month is waste.

- **Obsolete and duplicate files: none.** Every unreferenced source file
  is a test entry point, a package barrel or a framework contract.
  `agents.ts`, `native.ts` and the two `charts.tsx` appear twice each and
  are genuinely different modules.
- **Authorisation boundary: intact.** All 15 routes taking an account id
  from the URL carry `@SelfOnly` or `@AdminOnly`. FoodLens's 13 routes
  look unguarded and are not — they derive the id from the verified
  session, so nothing the caller sends is trusted.
- **Rate limiting: present**, under `assertHuman` rather than a
  decorator. Per address, per door kind, durable in `door_attempts`, with
  a security event recorded on each refusal.
- **Secrets: none in the repository**, and none in 1.66MB of client
  bundle scanned for provider keys and `AUTH_SECRET`. The frontend reads
  only `NEXT_PUBLIC_*` and `NODE_ENV`.
- **No placeholder or invented data.** `DUMMY_HASH_PROMISE` in
  `auth.service.ts` is a constant-time decoy against user enumeration.
  The one numeric claim on a public page is a target, rendered
  deliberately as a dashed outline rather than a measured bar.
- **Clinical safety control: intact.** `canTransition('draft',
  'published')` is false and tested. The newsletter's standing approval
  is defensible on its own terms — every sentence is assembled from
  human-written copy already published on the site — and records the
  approver on each issue.
- **PWA: complete.** Manifest with maskable icons, service worker
  handling install/activate/fetch/push/notificationclick, an `/offline`
  route, `viewport-fit: cover`, and a deliberate decision not to cache
  personal screens.
- **Deployment configs: correct.** No `api/` directory, no `rewrites`,
  no `functions` in the backend — all three break the NestJS preset that
  caused the eight-week outage. CI pins `node-version: 22`, which
  resolves to the latest 22.x and so satisfies the `>=22.23.4` floor
  without a workflow edit.

---

## 3. Verification — every suite, re-run against the committed build

Against a real Postgres 16 on all 34 migrations and a real Chromium.

| Suite | Result |
|---|---|
| Unit and integration | **1,005 passing, 0 failing** (950 backend, 27 body-command, 28 foodlens) |
| Typecheck | clean, **including the test suites** for the first time |
| Build | clean on Next 15.5.28 |
| Dependency audit | **no known vulnerabilities at any severity** |
| Smoke | **85/85**, signed out |
| Adversarial probe | **38/38**, 2 warnings |
| Money integrity | **16/16** |
| Recovery and deletion | **9/9** — 58 tables, 349 rows, 34 migrations, 195 constraints rebuilt from a dump and compared; then a deletion, with every text, uuid and jsonb column searched for a trace |
| Browser journeys | **43/43** in Chromium |
| Contrast | **7,376 text nodes across 28 routes**, none below AA |
| Layout | no problems at **1440px or 390px** |
| CSP | **9/9 routes served, 0 refusals**. `script-src` exercised on a build with the measurement IDs set — consent accepted on the 6 routes that offer it, both vendor hosts observed requested and allowed. Without those IDs the banner cannot render, and the audit says `script-src NOT exercised` rather than reporting a clean pass |
| Load | p99 11ms alone, 51ms at 20-way, **0% errors** under a 200-way spike, no soak drift |
| Schema constraints | **21/21** |
| Routes | **188 scanned**, 130 reached by the site or published |

**Every fix was verified by reverting it and watching the check fail.**
That is the only evidence that a passing check is doing anything, and this
session produced three separate examples of checks that passed while
testing nothing.

---

## 4. Non-blocking issues, and who can close each

### Needs a credential or a platform setting

| Item | Who closes it |
|---|---|
| **Stripe is the only unconfigured production capability** (`off=stripe`). `STRIPE_SECRET_KEY` and the endpoint's `whsec_` go in the Vercel dashboard. Until then no payment can be taken — and, by design, nothing can grant allowance either | whoever holds the Stripe account |
| **`POST /wearables/callback`** is the single member-facing route with no caller. It needs registered OAuth client credentials for Fitbit, Garmin, Oura and Polar; two of the four are partner programmes with an application queue | whoever can apply to those programmes |
| **The Node runtime.** This container runs 22.22.2, below the 22.23.4 that carries the October 2026 fixes, and `/api/health` reports the verdict without the version on purpose. The Vercel projects' Node major needs confirming as 22, 24 or 26 so the check reads `ok` | whoever can read the Vercel project settings |
| **Native push** cannot be configured until the app is in a store. The eight `APNS_*`/`FCM_*` variables are now documented; `/push/status` reports the transport as unconfigured rather than claiming it | whoever holds the Apple and Firebase accounts |

### Needs a product decision

- **The half-hourly nudge cron** (`0,30 * * * *`) is withheld because a
  Vercel Hobby plan allows daily schedules only. Recorded in
  `docs/DEPLOY.md`; restoring it needs the plan confirmed.
- **The ten blog drafts** await a named human reviewer. There is no
  draft-to-published edge and there must not be one.
- **`NEWSLETTER_AUTO_APPROVE_BY`** is unset, so the weekly issue stops in
  review. Setting it is a person accepting standing responsibility.

### Recorded deliberately, not fixed

Each of these is a decision with a reason, written up in
`docs/STATE-OF-PLAY.md` rather than left for someone to rediscover.

- **Eleven controllers verify the session a second time.** `SessionGuard`
  is a global `APP_GUARD` that already attaches `req.session`; eleven
  controllers re-verify through a local helper, and one uses the
  `@CurrentSession` decorator the guard exists to feed. Three mechanisms
  for one question — and the reason a decorator audit could not see
  either hole in §1. It is duplication, not a defect: both paths call the
  same `auth.verify`. Rewriting eleven working controllers on live
  request paths is the sweep that causes regressions; the right time is
  when one is being changed for its own reasons.
- **No linter.** Adding ESLint across four packages is the owner's call,
  not a cleanup. Four structural tests now cover the class of bug that
  actually bit.
- **`acu_grants`** is a dead constrained table beside the live
  `app_wallets.data` jsonb.
- **`FalsePrecisionError` and `ForbiddenClaimError`** are declared and
  never thrown.
- **Nineteen BodyCommand agents** are specified and none runs.
- **`pnpm test` and CI do not run** the browser audits, the adversarial
  probe, money, recovery or load. Those need a built frontend, a running
  server and Chromium. Adding them to CI is worthwhile and was not done
  here because a workflow change cannot be tested from this machine.

### Two findings about the harness rather than the product

- **`next start` serves none of `vercel.json`'s headers.** Those five
  are only ever live on Vercel, so every local check of them measures
  nothing. This is why the CSP went in the Next config.
- **The API's CORS default allows `localhost:3100` but not
  `127.0.0.1:3100`** — the same host, a different origin string. A
  journeys run against the loopback address needs `CORS_ORIGINS` set,
  which is what that variable is for.

---

## 5. The thing worth taking away

Four separate times this session, a check that looked green was testing
nothing:

- a WCAG colour-and-label loop iterating an empty object;
- a guard scanner silenced by a decorator named in a comment, and blind
  to an unguarded route followed by a guarded one;
- two allowlist exemptions whose stated reasons did not describe the risk
  they were excusing;
- and, while writing the CSP audit, a consent button matched by a guessed
  name, then a "nothing refused" that had never established anything was
  tried.

None of them failed a build, a typecheck or a test run. The common shape
is a check whose subject is absent — an empty collection, an unmatched
selector, a request never made — reported as a pass.

Two habits caught all of them, and both are now built into the suites
rather than left to whoever looks next. **Assert that the scan found
something** before asserting it found nothing wrong: `check:csp` fails
when no route served a policy, the guard scan fails below 100 routes
parsed, and the probe says out loud when it could not make its assertion.
And **revert the fix to watch the check fail** — a check never observed
failing is a check with no evidence behind it.
