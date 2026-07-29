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

> ⚠️ **It will not work yet.** `api.jessmove.com` currently points at Vercel, and the API
> is not deployed. Do Step 5 first, then come back. While developing, use the local
> address in Step 4 instead.

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

✅ `pass=65 fail=0`

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

## 5 · Deploy the API, then use the live URL

The webhook needs a public API. Follow **Steps 5–6 of [`docs/GO-LIVE.md`](./GO-LIVE.md)**
— Cloud Run, then map `api.jessmove.com`.

Two things to fix first, both in Hostinger DNS:

- **`api` currently points at Vercel.** Delete that record. Cloud Run gives you a `CNAME`
  to `ghs.googlehosted.com`.
- **`jessmove.com` still points at Hostinger's parking page** (`2.57.91.91`), which is why
  `www` shows *Not secure*. Replace it with the IPv4 Vercel shows you.

Once `https://api.jessmove.com/api/health` returns 200, add the endpoint in Stripe, copy
**that** endpoint's signing secret to `STRIPE_WEBHOOK_SECRET` on Cloud Run, and subscribe
to these ten events:

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
- [ ] `scripts/smoke.sh` → 65/65
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
