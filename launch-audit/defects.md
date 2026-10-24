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
