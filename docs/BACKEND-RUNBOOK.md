# Backend — the short version

Copy, paste, check. The long explanations moved to
[`docs/BACKEND-REFERENCE.md`](./BACKEND-REFERENCE.md); you only need them if something
breaks.

**You do not need every key.** No AI key, no SMTP and no Stripe key each produce a clear,
recorded outcome instead of a crash. The API always starts.

---

## Your webhook URL

```
https://api.jessmove.com/api/stripe/webhook
```

Paste that into **Stripe → Developers → Webhooks → Add endpoint**.

> ⚠️ **It works after Step 5** (a ten-minute, click-only deploy on Vercel). While
> developing, use the local address in Step 4 instead.

---

## 1 · Run it

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm --filter @jessmove/backend start
```

✅ `JESS MOVE API listening on :4000/api`

```bash
bash scripts/smoke.sh http://localhost:4000/api
```

✅ `pass=69 fail=0`

*(`health` saying `degraded` is normal — it means no AI key, not a fault.)*

---

## 2 · Email (SMTP)

You own `jessmove.com` at Hostinger, so create a mailbox there and use it:

```bash
# .env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=no-reply@jessmove.com     # the full address
SMTP_PASS=<that mailbox's password>
SMTP_FROM=JESS MOVE <no-reply@jessmove.com>
```

Restart, then:

```bash
curl -s localhost:4000/api/mail/status

curl -s -X POST localhost:4000/api/mail/send \
  -H 'content-type: application/json' \
  -d '{"event":"account.registration.requested","to":"you@example.com","values":{"name":"Sam"}}'
```

✅ `"status":"sent"` and it arrives.

Without credentials you get `"status":"sandbox"` — rendered in full, not delivered. Useful
for testing before the mailbox exists.

**Before emailing real people**, add these at Hostinger or you land in spam:

| Type | Name | Value |
|---|---|---|
| `TXT` | `@` | `v=spf1 include:_spf.hostinger.com ~all` |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:you@jessmove.com` |
| `TXT` | `hostingermail._domainkey` | the DKIM value Hostinger shows you |

---

## 3 · Stripe keys

**Create 5 prices** in Stripe → Products. On each one set metadata **`plan`** to the key
below, or invoices arrive and grant nothing.

| Plan | Price | metadata `plan` | .env variable |
|---|---|---|---|
| Premium monthly | £5.99 | `premium_monthly` | `STRIPE_PRICE_PREMIUM_MONTHLY` |
| Premium annual | £59.99 | `premium_annual` | `STRIPE_PRICE_PREMIUM_ANNUAL` |
| Family monthly | £12.99 | `family_monthly` | `STRIPE_PRICE_FAMILY_MONTHLY` |
| Family annual | £129.99 | `family_annual` | `STRIPE_PRICE_FAMILY_ANNUAL` |
| Org per seat | £2.00 | `organisation_seat` | `STRIPE_PRICE_ORG_SEAT` |

```bash
# .env
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PREMIUM_MONTHLY=price_…
# …one per plan
```

```bash
curl -s localhost:4000/api/stripe/status
```

✅ `missingPriceIds` is empty.

---

## 4 · Test the webhook locally

```bash
stripe login
stripe listen --forward-to localhost:4000/api/stripe/webhook
```

It prints a `whsec_…`. **That is a different secret from the dashboard one.** Put it in
`.env`, restart, then in another terminal:

```bash
stripe trigger invoice.paid
```

✅

```json
{ "outcome": "applied", "detail": "Granted 1200 ACU to u_demo for premium_monthly (£5.99 paid)." }
```

Run `stripe trigger invoice.paid` again — ✅ `"outcome": "duplicate"`. Nothing is granted
twice.

---

## 5 · Deploy the API — on Vercel, no CLI, no new vendor

The API runs as one Vercel function (`apps/backend/api/index.js`). Same account as the
website, second project, and `api.jessmove.com` already points at Vercel.

1. vercel.com → **Add New → Project** → pick the same `JESSIE` repository again.
2. **Root Directory: `apps/backend`** · Framework preset: **Other**. Leave build and
   output alone — `apps/backend/vercel.json` carries them.
3. **Environment variables** — paste these into this project (the website's variables
   do not carry over):

   | Name | Value |
   |---|---|
   | `NODEJS_HELPERS` | `0` ← **required** — without it the Stripe webhook cannot see the raw body |
   | `CORS_ORIGINS` | `https://jessmove.com,https://www.jessmove.com` |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the 5 `STRIPE_PRICE_*` | your values |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | your values |
   | one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | your value |

4. **Deploy.** You get `https://<project>.vercel.app`. Prove it:

   ```bash
   bash scripts/smoke.sh https://<project>.vercel.app/api
   ```

   ✅ `pass=69 fail=0`

5. Project → **Settings → Domains** → add `api.jessmove.com`. The DNS record already
   points at Vercel, so it attaches and the certificate is automatic.

> **What serverless changes, honestly.** Function instances are created and recycled,
> so the in-memory stores — demo accounts, wallets, the webhook's duplicate-event
> memory — reset when an instance does, and two instances do not share them. Right for
> a pilot; before real customers the database layer (Neon works from Vercel) makes
> state and idempotency durable.

Once `https://api.jessmove.com/api/health` returns 200, add the endpoint in Stripe →
Webhooks:

```
https://api.jessmove.com/api/stripe/webhook
```

Copy **that** endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on the backend
Vercel project and redeploy. Subscribe to these ten events:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
charge.refunded
charge.dispute.created
payment_intent.succeeded
payment_intent.payment_failed
```

*Firebase is not needed for any of this — nothing in the platform uses it. Docker,
Cloud Run and a VPS remain documented in `docs/GO-LIVE.md` for later scale.*

---

## 6 · Take a test payment

```bash
curl -s -X POST localhost:4000/api/stripe/checkout \
  -H 'content-type: application/json' \
  -d '{"userId":"u_demo","plan":"premium_monthly",
       "successUrl":"http://localhost:3000/get-started?paid=1",
       "cancelUrl":"http://localhost:3000/get-started"}'
```

Open the `url`, pay with `4242 4242 4242 4242`, any future expiry, any CVC.

✅ `invoice.paid` arrives at your webhook and says the allowance was granted.

---

## 7 · Database (optional for now)

Without `DATABASE_URL` everything works in memory and nothing survives a restart.

```bash
export DATABASE_URL='postgres://…?sslmode=require'
pnpm db:migrate && pnpm db:test
```

✅ 14 rejections.

---

## Done when

- [ ] `pnpm -r test` → 279 pass
- [ ] `scripts/smoke.sh` → 69/69
- [ ] `/api/stripe/status` → no missing Price IDs
- [ ] `/api/mail/status` → `configured: true`
- [ ] A test email arrives, not in spam
- [ ] `stripe trigger invoice.paid` → `applied`, then `duplicate` on a repeat
- [ ] SPF, DKIM, DMARC set
- [ ] `CORS_ORIGINS` matches the site's exact origin

---

## Not built yet

Three gaps, said plainly:

1. **Object storage for profile pictures.** Validation, EXIF-stripping and moderation
   state are done; the bytes are not written anywhere yet.
2. **The repository layer.** Services keep state in memory. The Postgres schema exists and
   its invariants are tested, but the services do not read from it.
3. **Authentication.** No login, no sessions, no tokens. Fine for a private pilot,
   **not acceptable in front of real users.**

The first two are plumbing. The third is a gate before any public launch.
