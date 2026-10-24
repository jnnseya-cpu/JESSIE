# Defect register

One record per defect. Severity: P0 catastrophic · P1 critical · P2 high ·
P3 medium · P4 low.

---

## D-001 — A confirmed account deletion leaves the member's health data in the database

| | |
|---|---|
| **Severity** | **P1 (critical)** |
| **Blocker** | **YES** |
| **Area** | Privacy / data protection / data integrity |
| **Phase** | 6.1 truth audit → 6.10 data integrity → 6.15 privacy |
| **Environment** | local isolated stack, RC `a41e5f2`, real Postgres 16, 34 migrations |
| **Role** | any member (adult or minor) |
| **Status** | **FIXED and retested** |

### Preconditions
A registered member who has used the product enough to have a kcal band,
a declared cuisine, activity rows, reachable windows and app state.

### Steps to reproduce
1. `POST /auth/challenge`, wait 4s (the door's `minTokenAgeSeconds` is 3).
2. `POST /auth/register` with a real email, password, `age: 34`.
3. Write the rows the services write, into
   `member_energy_band`, `member_food_constraints`, `member_state`,
   `member_activity`, `member_windows`, `app_wallets`, `stripe_customers`.
4. `POST /auth/me/delete` with the session cookie and the real password.
5. Search every `text`, `varchar`, `uuid` and `jsonb` column in the schema
   for the member id.

### Expected
No trace of the member, except records with a stated lawful basis for
retention.

### Actual
```
POST /auth/me/delete -> 201 {"deleted":true}

FAIL — the member survives deletion in 7 of the 7 tables written:
   app_wallets.id  (1 row)
   app_wallets.subject_id  (1 row)
   member_state.user_id  (1 row)
   member_activity.user_id  (1 row)
   stripe_customers.customer_id  (1 row)
   stripe_customers.user_id  (1 row)
   member_windows.user_id  (1 row)
   member_energy_band.user_id  (1 row)
   member_food_constraints.user_id  (1 row)

Removed correctly from: (none)
```

Frequency: **100%, every run.**

### Impact

- **`member_energy_band`** holds a kcal floor and ceiling derived from the
  member's weight and BMI. Health data.
- **`member_food_constraints`** holds a declared cuisine. A declared
  cuisine can reveal religion, which is **special-category data under UK
  GDPR Article 9**.
- **`member_activity`** holds what the member did and when.
- **`member_windows`** holds when they are reachable.

The platform onboards children from the age of ten, so some of these rows
are children's health data. A confirmed erasure request that does not
erase is a **UK GDPR Article 17** failure, and the ICO Children's Code
treats children's data as warranting the highest protection.

It is also a **false public claim**. `/assurance` stated: *"Deleting an
account deletes everything derived from it ... Foreign keys with ON DELETE
CASCADE from app_users cover conditions, the food ledger, growth results
and strength checks, so deletion is a database guarantee rather than a
callback somebody has to remember."* — badged **ENFORCED BY A TEST**.

### Root cause

Three compounding causes, not one:

1. **`deleteAccount` deletes three things.** An in-memory profile, the two
   push tables, and `app_users` — which cascades to whatever has a foreign
   key. Only 5 tables did. **16 member-keyed tables had none**, so for
   those, deletion was precisely "a callback somebody has to remember" and
   nobody had.

2. **The claim described the mechanism for four tables and generalised it
   to all.** The named four genuinely cascade. The sentence after them does
   not hold.

3. **The cited test tested itself.** `scripts/verify-recovery.mjs` seeded
   three rows, deleted them *with its own three `DELETE` statements*, then
   searched the schema and found nothing. It never invoked the product's
   deletion path. Worse, the three rows it chose (`app_wallets`,
   `stripe_customers`, `annual_deposits`) are the financial ones that are
   *meant* to be retained — so even had it called the real endpoint, it was
   looking in the only places where survival is correct.

### Fix

**`db/migrations/0035_deletion_is_structural.sql`** — twelve foreign keys
with `ON DELETE CASCADE` to `app_users`, covering the body
(`member_energy_band`, `member_food_constraints`, `member_activity`), the
day (`member_windows`, `member_state`, `nudge_runs`), the ways the
platform can reach them (`push_subscriptions`, `device_push_tokens`,
`newsletter_sends`) and who they did it with (`challenge_members`,
`challenge_activity`, `group_members`). Orphans are removed before each
`ALTER`, as migration 0015 established, because an `ALTER` that finds one
fails the migration and takes the deployment with it.

Structural rather than more code, for the reason migration 0015 already
wrote: *"so no future deletion path can forget."* That was applied to five
tables and stopped. Code-level deletion has now been demonstrated to fail
here precisely because it is a list somebody maintains.

**Four tables are deliberately not cascaded**, and this is now stated
publicly instead of omitted:
`app_wallets` (also polymorphic — `subject_type` is user, family or
organisation, so `subject_id` cannot carry a foreign key at all),
`annual_deposits`, `stripe_customers`, `stripe_subscriptions`. UK company
and tax law requires records of money that moved; **UK GDPR Article
17(3)(b)** permits retention to meet a legal obligation.
`security_events` keeps its row with the member severed (`ON DELETE SET
NULL`) — an audit trail a deletion can erase is not an audit trail.

**`packages/shared/src/assurance.ts`** — the public claim rewritten to
match what the database does, naming the four retained tables and why.

**`scripts/verify-recovery.mjs`** — the deletion section replaced. It now
registers through the real API (waiting out the anti-bot token age), seeds
the five body tables, deletes through `POST /auth/me/delete`, then
searches. Plus a meta-check — *"the deletion check actually exercised the
product"* — that fails when no member was registered, because the previous
version would have passed on an empty database.

**`apps/backend/test/deletion-coverage.test.ts`** — the guard against
recurrence. The failure mode is not broken code; it is a **new table**,
added next quarter by someone who has never read `deleteAccount`, holding
a `user_id` and no constraint. It parses the embedded migration SQL and
fails unless every member-keyed `text` column either has a cascading
foreign key or appears on an explicit `RETAINED` list with a lawful basis
of its own. Three further tests keep that list honest: a reason must be
longer than a label, must not read "legacy"/"for now"/"TODO", and the list
is pinned by name so a health table cannot quietly join it.

### Files changed
- `db/migrations/0035_deletion_is_structural.sql` (new)
- `apps/backend/src/db/embedded-sql.ts` (re-embedded)
- `packages/shared/src/assurance.ts`
- `scripts/verify-recovery.mjs`
- `apps/backend/test/deletion-coverage.test.ts` (new)

### Migration
Yes — 0035. Additive, idempotent (`DROP CONSTRAINT IF EXISTS` then `ADD`),
and verified against a database with **zero orphan rows** in all sixteen
candidate tables before being written.

### Retest result

Cascading foreign keys from `app_users`: **5 → 17**.

```
POST /auth/me/delete -> 201 {"deleted":true}
Removed correctly from: member_energy_band, member_food_constraints,
                        member_state, member_activity, member_windows
Still present: app_wallets, stripe_customers   ← retained by design
```

`pnpm verify:recovery` → **11/11 passed**, including *"no trace of the
deleted member survives anywhere in the schema"* and *"the deletion check
actually exercised the product"*.

**Guard proven to fail on the defect:** the `member_energy_band` cascade
was removed from the migration, re-embedded, and
`deletion-coverage.test.ts` reported
`member_energy_band (user_id)` and failed. Restored; green.

### Regression
`pnpm typecheck` clean · **1,009 tests passing, 0 failing** (954 backend,
27 body-command, 28 foodlens) · `pnpm build` clean · `pnpm db:test` 21/21 ·
smoke 85/85 · restore drill 58 tables / 918 rows / 35 migrations / 207
constraints.

### Residual risk

The migration has **not** run against production — this environment cannot
reach it. On a database with orphan rows the `DELETE` statements clear them
first, so the `ALTER` cannot fail on that account, but the production row
counts are unknown from here. The first production boot after deploy
applies 0035 under the existing advisory lock; `/api/db/status` will report
35 migrations when it has.

### Owner
Engineering (fixed). Deployment verification requires production access —
see `human-actions.md`.

---

## D-002 — Ten tables declare `user_id uuid` and cannot hold a member id

| | |
|---|---|
| **Severity** | **P3 (medium)** |
| **Blocker** | No |
| **Area** | Architecture / dead schema |
| **Status** | **RECORDED, not fixed** |

`app_users.user_id` is `text`, holding values of the form
`u_71cc93d4-00c`. These ten tables declare the column as `uuid`, which
cannot store that value:

`acu_wallets`, `agent_actions`, `capability_profiles`, `chains`,
`consents`, `context_decisions`, `nudges`, `prescriptions`, `sessions`,
`sparks_ledger`

Proven while attempting to seed them:
```
could not write capability_profiles: invalid input syntax for type uuid: "u_71cc93d4-00c"
could not write consents: invalid input syntax for type uuid: "u_71cc93d4-00c"
```

They are a **dead identity scheme** — an earlier design that used raw
UUIDs — and are structurally unreachable by the running product. This
extends the previously recorded `acu_grants` finding: `acu_wallets` is dead
beside the live `app_wallets`.

Two consequences worth stating:

- `capability_profiles` and `consents` are the tables a reader would expect
  to hold capability and consent records. They hold nothing, and the real
  data lives elsewhere. A future engineer will write to them.
- They are correctly **excluded** from D-001's cascade work, because a
  table that cannot hold a member cannot leak one. The deletion-coverage
  guard filters on column type for exactly this reason, and says so.

Not fixed here because deciding between "migrate the column type and wire
them up" and "drop them" is a product and data decision, not a cleanup,
and dropping tables is irreversible. Recorded for the owner.

---

## D-003 — No `/pricing` page exists, while Stripe subscriptions do

| | |
|---|---|
| **Severity** | **P2 (high)** |
| **Blocker** | For a public launch that takes money: **yes** |
| **Area** | Fitness for purpose / legal-commercial surface |
| **Status** | **RECORDED** — pending Section 6.6 and 6.22 completion |

`/pricing`, `/safety`, `/careers` and `/press` all return 404. The platform
has Stripe checkout, four price environment variables
(`STRIPE_PRICE_PREMIUM_MONTHLY`, `_ANNUAL`, `FAMILY_*`, `ORG_SEAT`), a
`MIN_TRANSACTION_GBP` floor and an ACU wallet — but no page a prospective
member can read to find out what anything costs before signing up.

UK consumer law requires price, including tax, to be clear before a
purchase. Whether this is a missing page or a deliberate
invite-only/sales-led model is a product decision; either way the current
state is a product that charges with no published price. Carried into the
final report pending the pricing surfaces check.

---

## D-004 — The plan cards sent converting visitors to a brochure

| | |
|---|---|
| **Severity** | **P2 (high)** |
| **Blocker** | No — but it is a direct conversion loss |
| **Area** | Fitness for purpose / funnel |
| **Phase** | 6.6 novice walkthrough |
| **Status** | **FIXED and retested** |

### Actual
`apps/frontend/app/page.tsx` — every non-organisation plan card carried a
button reading **"Start free"** pointing at `/get-started`, a marketing
page describing onboarding. Every other "Start free" on the site pointed
at `/account`, where registration is.

A visitor reading the plan cards is the one furthest down the funnel — they
have the price in front of them. They were the people being sent to read a
page instead of to sign up.

### Root cause
`JoinCta` in `apps/frontend/app/ui.tsx` had already written the rule:

> `/account` rather than `/get-started`, deliberately. A page describing
> onboarding is not onboarding, and putting one in front of the other is
> how a funnel acquires a step that only loses people.

The rule was right and one call site did not follow it. The existing
`funnel.test.ts` could not see it: `primaryCta()` returns `/account`
immediately when a page contains `<JoinCta`, so the landing page was
declared sound and its other buttons were never read.

### Fix
Plan-card CTA now points at `/account?new=1`. A new test,
*"every button offering to start goes to the account, not to a page about
it"*, scans **every** join button on every marketing page rather than only
the primary one, and handles both shapes the site uses — `<JoinCta
action="...">` and a hand-written `<Link>` whose `href` is a ternary, with
every branch of the ternary checked.

Its own sanity check caught the first version of it: counting only literal
`<Link>` text found **2 buttons across eighteen pages** and would have
passed while testing almost nothing. It now asserts at least 6 before
asserting anything about them.

### Retest
Guard proven to fail on the defect: reverting the href to `/get-started`
produced
`page.tsx: "{p.key === 'organisation' ? 'Talk to us' : 'Start free'}" -> /get-started`.
Restored; 25/25 funnel tests pass.

---

## D-005 — "Start free" opened a password prompt

| | |
|---|---|
| **Severity** | **P2 (high)** |
| **Blocker** | No — but it is friction on the one screen the whole funnel converges on |
| **Area** | Novice usability |
| **Phase** | 6.6 novice walkthrough, Mind 2 |
| **Status** | **FIXED and retested** |

### Steps
1. On a 360×760 Android over slow 3G, load `/`.
2. Tap the hero's primary button, labelled **"Start free"**.
3. Read what the screen asks for.

### Actual
`/account` rendered the **sign-in** form: email, password, a "Sign in"
submit, and "I need an account" as a secondary button below it. A person
who has never used the product, who was just promised they could start
free, was asked for a password to an account they did not have.

```
/account
   fields: email, password
   submit: "Sign in"
   toggle: ["I need an account"]
```

### Impact
Not a dead end — "I need an account" is visible and 50px tall, so a
determined person finds it in one tap. It is friction at the single point
where every CTA on the site converges, and the kind a first-time user on a
patchy connection abandons rather than investigates. Mind 1 would never
find it: an automated test knows which button to press.

### Root cause
`const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')`
— hardcoded, with no way for a caller to say which form it wanted.

### Fix
The panel now reads a register intent from the URL — `?new=1`,
`?mode=register` or `#register` — and every button that *offers to start*
carries it: the hero, the plan cards, `JoinCta`, the header CTA, the mobile
menu's primary button and the invite landing page. Links that say
**"Sign in"** still point at the sign-in form, because that is what they
promise.

Read after mount rather than through `useSearchParams`, because `/account`
is statically prerendered: reading the query during render would force the
route dynamic or need a Suspense boundary, and reading `window` in the
state initialiser would render sign-in on the server and register on the
client — a hydration mismatch.

### Retest
```
/account          submit: "Sign in"        toggle: ["I need an account"]
/account?new=1    submit: "Create account" fields: email, password, name, age
```
Verified in Chromium at 360px. Regression: 1,011 tests passing,
typecheck clean, build clean, 43/43 browser journeys, 7,376 text nodes
within AA, no layout problems at 1440px or 390px.

---

## D-003 — superseded: prices are published

Downgraded to **P4**. The original record assumed no published price
because `/pricing` returns 404. It was wrong: the prices are on the
landing page, rendered from `PLANS` in `packages/shared` — the same source
that drives Stripe checkout — and read **Free £0 · Premium £5.99/month ·
Family £12.99/month · Organisation from £2 per employee/month**, under a
heading that says *"Published, not quoted"* and beside the
`MIN_TRANSACTION_GBP` floor.

What remains is navigational, not legal: there is no `/pricing` route, so a
visitor who looks for one, or follows a link to one, gets a 404.
`/safety`, `/careers` and `/press` likewise. Recorded, not fixed — whether
those pages should exist is a product decision.

---

## Discounted after investigation — recorded so they are not re-found

**A 400 on a JavaScript chunk.** A cold load reported
`400 GET /_next/static/chunks/3748-e2ef9af4476ec160.js` while the build on
disk held `3748-038eafb852ff60ec.js`. This was **my own stale `.next`
directory** across repeated local rebuilds, not a product defect: a clean
`rm -rf .next && pnpm build:frontend` cleared it, and Vercel deployments
are immutable and atomic so the skew cannot arise there. Not a finding.

**The header CTA is 0×0 on mobile.** `.nav__cta`, `.nav__signin` and
`.nav__links` are `display: none` under 860px **by design** — mobile gets a
48×48 menu toggle instead. The menu was tested and is sound: 9 links at
61px, `aria-expanded` maintained, Escape closes it, and two clear routes to
register. The first novice script reported a dead end because it clicked a
hidden element; that was the script, not the product.

**"Get started" leads to a brochure.** True, and it is a *footer* link
under "Product", not a primary CTA. `/get-started` carries `JoinCta` at the
bottom, so it does lead onward. The first novice script found it by
scanning the whole page bottom-up rather than tapping the primary button a
person would.

**The logo link is 26px tall.** Below the platform's own `standard: 48`
figure in `TARGET_SIZE_PX`, and **above** the WCAG 2.2 AA floor of 24px
that `wcagMinimum` names and `accessibility-promises.test.ts` enforces. A
deviation from an internal standard on one non-essential target, not an
accessibility violation. **P4**, not fixed.

---

## D-006 — A string arrived where a trolley belonged

| | |
|---|---|
| **Severity** | **P3 (medium)** |
| **Blocker** | No |
| **Area** | API input handling |
| **Phase** | 6.9 adversarial API testing |
| **Status** | **FIXED and retested** |

### Steps
```
POST /foodlens/basket  {"products": "AAAA…200 chars"}
```

### Actual
```json
{"products": 200, "weighed": 0, "totals": [],
 "note": "200 items had no readable pack size and are left out rather than guessed at."}
```

A string is iterable, so `basketFrom` walked its characters and reported
that the member's shopping held two hundred items.

### Impact
Low in consequence, specific in kind. Nothing is written, no money is
involved and no data leaks — it is a stateless calculator. What it did was
answer a question about somebody's food with a confident wrong number,
which is the one thing this product's own copy says it will not do.

### Root cause
The handler's body was an **inline type**:
`basket(@Body() body: { products?: BasketProduct[] })`. TypeScript erases
that at compile time, and `class-validator` needs a class to validate
against, so the global `ValidationPipe` — `whitelist`,
`forbidNonWhitelisted`, `transform` — had nothing to check.

This was the **only** endpoint of the fifty with no DTO, and it was the
only payload of 750 that got past the pipe. The two facts are the same
fact.

### Fix
`BasketProductDto` and `BasketDto` in `foodlens.dto.ts`, matching the
file's existing conventions (`@ValidateNested`, `@Type`, bounded strings).
`@ArrayMaxSize(200)` as well as typed, because an unbounded array of
nested objects on an unauthenticated endpoint is a cost somebody else
chooses for you.

### Retest
```
{"products":"AAAA"}                      -> 400  "products must be an array"
{"products":[{barcode,name,quantity,…}]} -> 201  312 kcal for 400g at 78/100g
{}                                       -> 201  empty trolley
```

Covered two ways, because the DTO has decorators and so cannot be
imported under `--experimental-strip-types`: a source assertion in
`foodlens-api.test.ts` that the handler takes a class and the DTO still
declares its array, nesting and bound; and three live cases in
`scripts/smoke.sh` that send the string and expect the 400.

---

## Phase 6.9 — adversarial API testing: PASS

750 hostile requests across 50 write endpoints — 15 payload classes each:
empty, null, array-for-object, string-for-object, SQL injection, XSS,
prototype pollution, mass assignment (`kind: platform_staff`, `isAdmin`,
`balance`), type confusion, a 200KB string, 120-level nesting, negative
and `MAX_SAFE_INTEGER` numbers, null bytes and RTL override characters,
path traversal, and `NaN`/`Infinity` as strings.

Checked for: a 500, a stack frame, a `node_modules` or `/home/` path, a
connection string, SQL in the response, `sk_live`/`whsec_`, ORM internals,
`ECONNREFUSED`, a 2xx for an impossible operation, and a hang.

**Result after D-006: 0 failures, 0 warnings.** No 500s, nothing leaked,
no invalid payload accepted, nothing slower than 8s.

Two endpoints are body-independent and excluded from the
"accepted-an-invalid-payload" rule rather than counted as failures:
`POST /auth/logout` clears a cookie, needs no input, and must stay
idempotent — a browser that has lost its session still has to be able to
sign out; and `POST /foodlens/basket` with `{}` is a valid question about
an empty trolley. Both are asserted positively in `scripts/smoke.sh`
instead, so the exclusion is not a gap.
