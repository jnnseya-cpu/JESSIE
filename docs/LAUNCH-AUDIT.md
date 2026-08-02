# Launch audit — Jess Move

Adversarial pre-launch audit. Everything below was **executed**, not read.
Where something could not be executed in this environment it is marked
BLOCKED and stays BLOCKED — a blocked check is never counted as a pass.

Audited at commit `4916f1f`, branch `claude/jessie-os-spec-doc-7audof`.

---

## 1 · Verdict

**NO-GO until three gates close.** No open defect remains in the code, and
every module was exercised end to end, but three things stand between here
and a launch that can be trusted:

1. **The last deploy was failing.** A TypeScript error stopped the build, so
   production has been serving older code than the repository contains.
   Fixed at `fa2d4b5`; a green deploy has to be confirmed.
2. **`AUTH_ENFORCE` is off.** Every member-facing route is open without a
   session while it is off. It must be `true` before anyone real signs up.
3. **`DATABASE_URL` must be set** on the API deployment. Without it the auth
   service reports, in its own words, that "users live in memory" — every
   account disappears on the next cold start.

Everything else that was found has been fixed and is covered by a test.

---

## 2 · What was executed

| Suite | Checks | Result |
| --- | --- | --- |
| Backend unit and contract tests | 371 | 371 pass |
| Adversarial API audit (authorisation, validation, humans-only doors, error hygiene) | 24 | 24 pass |
| End-to-end member journey against a running API | 85 | 78 pass · 6 blocked · 1 partial |
| Payments — real signed Stripe webhooks | 17 | 17 pass |
| Allowance drawdown | 6 | 6 pass |
| Metering against a stand-in model | 11 | 11 pass |
| Browser pass — real Chromium, real member journey | 23 | 23 pass |

**166 executed checks outside the unit suite. No failures remain.**

---

## 3 · Defects found and fixed during this audit

### 3.1 The build was broken, so nothing was reaching production
`TS2339` on the allowance-refusal log line. The local toolchain narrowed the
union and compiled it; the deploying one did not. A log line must never fail
a build. **Fixed `fa2d4b5`.**

### 3.2 The app on the phone was months old
This is the cause of "FoodLens 360° disappeared again" and of the four-tile
`0g LOW` panel reappearing — a shape the current code has refused to produce
since the front-of-pack rewrite.

The service worker's cache version was a hand-written constant, so `/sw.js`
was byte-identical on every deploy. A browser only reinstalls a worker when
the worker's own bytes change, so the update was never found, `activate`
never ran, and the shell and asset caches outlived every release. An
installed app kept serving the JavaScript it first downloaded.

- the version is stamped from the commit at build time, so each deploy is a
  new worker and `activate` deletes what came before
- registered with `updateViaCache: 'none'`, and asked for an update on load,
  hourly, and whenever the app returns to the front
- a waiting update is applied when the app goes to the background — nobody
  is interrupted, and nobody comes back to old code
- the traffic-light panel now refuses to draw a set of zeros wherever it
  comes from, including a restored draft

**Fixed `6281bb4`.** Existing installs self-heal on their next visit, because
`/sw.js` finally differs.

### 3.3 The coach was free
`MovaService` has accepted a payer since metering went in, but
`MovaController` never handed it one. Every coach conversation — the
most-used model call on the platform — was a provider bill against nobody's
balance. FoodLens was billed; the coach was not.

This is exactly what "the ACUs don't get down" was pointing at, and it was
correct. **Fixed `1621d13`**, with a regression test.

### 3.4 The raw gateway was open to the internet
`POST /ai/complete` had no door on it. Any request from anywhere could name
any agent, any model and 128,000 tokens, and the platform paid. It was also
a way around every under-18 protection, because the age register and the
published refusals live in the module endpoints, not in the gateway.

Both gateway routes are staff-only now, and staff use is metered like
everyone else's. Which providers a deployment has configured is staff
information too. **Fixed `1621d13`.**

### 3.5 One subject could end up with two wallets
`POST /acu/wallets` created unconditionally. Grants and spends go through
`forSubject`, so the money stayed in the first wallet while a caller holding
the second id saw an empty balance — and once two exist, which one
`forSubject` finds is decided by iteration order. **Fixed `1621d13`.**

### 3.6 A signed-out tab put fifty requests a minute into the API
Measured in a real browser: 274 failed saves of `ui.preferences` in one
sitting, growing for as long as the tab stayed open.

The attempt clock was only updated after a *successful* save, so a failing
save always looked overdue, which skipped the debounce and retried at once —
and because callers pass a fresh object each render, the re-render caused by
the failure scheduled the next immediate retry. **Fixed `4916f1f`.** Same
page, measured again: fifty requests in twelve seconds became one.

### 3.7 A bag of apples was flagged for sugar
Below a day of food, "days of X against days of food" is arithmetic on
almost nothing. A flag now needs a real shop behind it and a nutrient with
real weight. **Fixed `6281bb4`.**

---

## 4 · Evidence by area

### Accounts and sessions
Registration, login, wrong password, logout, deletion, and the humans-only
doors all behave. The session is an httpOnly cookie and never appears in a
response body — verified by inspecting the body, not by assuming.

- registering without the dated challenge → 400
- submitting within three seconds → 400
- the honeypot field filled → 400
- the wrong password → 401, with one flat sentence and no oracle
- deleting an account ends the session immediately (`/auth/me` → 401)

### Under-18 protection
- a child cannot register without a guardian → 400
- a child's account is created pending guardian confirmation, not active
- energy is withheld from a minor's food analysis; `withheld: true`
- no swap ladder is offered to a minor
- macros are absent, not zeroed
- a child is never shown a weight-loss warning, even on a losing trend
- body-measurement wearable scopes are refused for a 15-year-old

### Authorisation
- every admin route refuses a stranger **and** an ordinary member, with
  enforcement on or off — this was the P0 fixed at `290cfa1`
- member routes refuse without a session
- the raw AI gateway refuses without a staff session

### Payments
Seventeen checks against real HMAC-signed webhooks with a known secret:

- a correctly signed `invoice.paid` grants exactly the plan's allowance
  (0 → 1200 ACU, verified by reading the balance)
- a retried event is a duplicate and grants nothing a second time
- a body altered after signing → 400
- an hour-old signature → 400 (outside the 300s tolerance)
- a signature from another secret → 400
- an unsigned request → 400
- an event with no id → 400
- an event type the platform does not act on → 200 `ignored`, so Stripe does
  not disable the endpoint
- an invoice with no `plan` metadata grants nothing and says so
- a £10 top-up credits the wallet; a failed payment credits nothing
- a cancelled subscription records `Entitled: false`
- every plan is priced in sterling; a top-up under £5 is refused

### The allowance
- a spend is charged, names its bucket, and the balance falls by exactly
  what was charged
- a spend beyond the balance is refused with what is left stated, and takes
  nothing
- with a model answering: 120 ACU → ask the coach → 119 → send a photograph
  → 118 → read the dashboard → still 118

### FoodLens
Against a stand-in model, with real figures returned:

- the front-of-pack table is built and every row states its basis
- the wheel is filled where there is evidence and `null` where there is not
- energy is a range (269 – 571 kcal), never a single fabricated number
- with no model configured the refusal is honest: `mode: sandbox`, no items,
  and no invented table

### The trolley
Six products, one with an unreadable pack size:

- five weighed, one left out rather than guessed at, and the note says so
- a bar per nutrient with its days-of-intake height and its top contributors
- the flag fires on the right thing: *"This basket carries 4.8 days of
  saturates against 3.1 days of food. Mature Cheddar carries the most of it."*
- a modest basket raises nothing

### BodyCommand
- four readings make a trend: −0.5 kg a week across 21 days
- the daily plan is six actions and no more, each with its reason, and
  safety-approved before it is issued
- losing 4.8% of body weight a week raises a caution with an action
- a BMI below 18.5 stops the reduction pathway and points to a GP
- what the member did is shown beside the trend, never as its cause

### Groups
- the k-anonymity floor is published as 8
- an organisation below the floor reports `suppressed: true` with every
  figure `null`, and no member name appears anywhere in the response
- a household report shows participation, not check-ins

### Autosave
- a draft saves and comes back on reload
- consent is refused by name: *"consent is not a key this platform saves
  automatically"*
- an oversized document is refused
- a draft can be cleared

### The browser
Real Chromium, 420 × 900, through the whole journey:

- every public page loads and draws its charts as elements — 78 shapes on
  the landing page
- registration from the form signs the member in
- a Snap can be taken, and the console paints charts with real figures
- no model or vendor name appears on any member screen or public page
- every form field is labelled; nothing crashed

---

## 5 · Not proven here — and not counted as passed

| What | Why | How to close it |
| --- | --- | --- |
| Live vision and coach against the real providers | No provider key in this environment. Proven against a stand-in model instead. | One photograph and one coach question on production after the deploy lands. |
| Barcode lookup against the open label database | Outbound network is restricted here. | Scan one real barcode on production. |
| A real Stripe checkout session | No secret key here. The webhook side — the half that moves money — is fully proven. | One live-mode £5 top-up, refunded. |
| Web push delivery | No VAPID keys. | Set the three VAPID variables, then send yourself a test. |
| Anything on jessmove.com | The sandbox cannot reach it (gateway answers 403 to CONNECT). | Re-run the journey against production. |
| k-anonymity **above** the floor of 8 | The registration rate limit prevents making nine accounts here. Below-floor suppression is proven. | Nine members in one organisation, then read the report. |
| Postgres-backed persistence | No `DATABASE_URL` here; everything ran in memory. | Set it, restart, confirm an account survives. |

---

## 6 · Before launch — configuration you hold

- [ ] Confirm the deploy is green at `4916f1f` or later
- [ ] `AUTH_ENFORCE=true`
- [ ] `DATABASE_URL` set on the API deployment
- [ ] Audit production wallets for any allowance granted through the
      pre-`290cfa1` admin hole
- [ ] Stripe live mode: `plan` metadata on every price, and
      `STRIPE_WEBHOOK_SECRET`
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- [ ] Blob store connected for profile media
- [ ] SPF, DKIM and DMARC at Hostinger

---

## 7 · One observation, not a defect

The member console paints noticeably fewer charts than the marketing pages —
13 drawn shapes against 78 on the landing page. Nothing is broken; the
console simply carries less of the visual language the landing page sells.
It is worth a design pass before launch, because the gap between what the
site promises and what the console delivers is the first thing a new member
sees.
