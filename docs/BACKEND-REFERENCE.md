# Backend reference — the detail behind each step

**Start with [`docs/BACKEND-RUNBOOK.md`](./BACKEND-RUNBOOK.md).** It is the short version
and it is enough to get running. This file is the same ground with the reasoning kept in —
read it when something behaves unexpectedly, or when you want to know why a thing was
built the way it was.

Covers the API only. `docs/GO-LIVE.md` covers domains and the website; `docs/DEPLOY.md`
covers containers.

Every step says **what to do** and **how you know it worked**. Where a step needs a key
you have not got yet, it says what happens without it — because the answer is never
"the server refuses to start".

**Nothing here requires all the AI keys.** The gateway skips providers that are not
configured, so the API starts and serves normally with none of them. Only
`POST /ai/complete` degrades.

---

## Step 1 · Run it locally

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm --filter @jessmove/backend start
```

**Done when** the log ends with:

```
JESS MOVE API listening on :4000/api
```

**Prove it:**

```bash
curl -s localhost:4000/api/health | head -c 200
bash scripts/smoke.sh http://localhost:4000/api
```

`pass=65 fail=0`, and `status: "degraded"` on health is expected — that is the AI
gateway reporting no provider, not a fault.

---

## Step 2 · Add one AI key (optional)

You said you would not add them all. One is enough, and none is survivable.

```bash
# .env — any one of these
ANTHROPIC_API_KEY=sk-ant-…
OPENAI_API_KEY=sk-…
GEMINI_API_KEY=…

AI_DEFAULT_PROVIDER=anthropic
AI_FALLBACK_ORDER=anthropic,openai,gemini
```

**Prove it:**

```bash
curl -s localhost:4000/api/ai/providers
```

Configured providers report `configured: true`; the rest report `false` and are skipped
rather than failing. With none set, `/api/health` says
`No provider configured — serving cached prescriptions only` and every other endpoint
works.

---

## Step 3 · The database

Without `DATABASE_URL` the services use in-memory stores. Everything works and nothing
survives a restart — fine for local work, not for anything real.

```bash
export DATABASE_URL='postgres://user:pass@host/jessmove?sslmode=require'
pnpm db:migrate
pnpm db:test
```

**Done when** `pnpm db:test` prints **14 rejections** — one per invariant, each proven
to reject the write that would violate it.

---

## Step 4 · SMTP

Any transactional provider works. The client speaks plain SMTP with STARTTLS on 587 or
implicit TLS on 465 — no vendor SDK, so there is nothing to swap if you change provider.

```bash
# .env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587                 # 587 STARTTLS · 465 implicit TLS
SMTP_USER=apikey              # provider-specific; often literally "apikey"
SMTP_PASS=…
SMTP_FROM=JESS MOVE <no-reply@jessmove.com>
```

> **Hostinger email works here.** `smtp.hostinger.com`, port `465`, `SMTP_USER` is the
> full mailbox address and `SMTP_PASS` is that mailbox's password. Because you own
> `jessmove.com` at Hostinger, this is the fastest route to a working sender.

**Check it is wired:**

```bash
curl -s localhost:4000/api/mail/status
```

**Render a message without sending it:**

```bash
curl -s -X POST localhost:4000/api/mail/preview \
  -H 'content-type: application/json' \
  -d '{"event":"account.registration.requested","values":{"name":"Sam"}}'
```

You get the subject, the plain-text part and the full branded HTML.

**Send a real one:**

```bash
curl -s -X POST localhost:4000/api/mail/send \
  -H 'content-type: application/json' \
  -d '{"event":"account.registration.requested","to":"you@example.com","values":{"name":"Sam"}}'
```

**Done when** the response reads `"status":"sent"` and it arrives.

Without credentials it reads `"status":"sandbox"` and the message is rendered in full
but not delivered — so the flow is testable before you have a mailbox, and a missing
credential never becomes an exception in a background job.

### Deliverability — do this before sending to real people

Three DNS records at Hostinger, or your mail lands in spam:

| Type | Name | Value |
|---|---|---|
| `TXT` | `@` | `v=spf1 include:<your provider's SPF host> ~all` |
| `TXT` | `<selector>._domainkey` | the DKIM value your provider gives you |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@jessmove.com` |

Start DMARC at `p=none` and read the reports for a fortnight before tightening to
`quarantine`.

---

## Step 5 · Stripe

You add the keys; the code is written and tested. **No Stripe SDK** — the three calls
this platform makes are ordinary form posts, and the webhook signature is verified with
`node:crypto`, which is why it can be unit-tested offline.

### 5a · Create the products

Stripe dashboard → **Products**. Create one price per plan and copy each Price ID:

| Plan | Price | Environment variable |
|---|---|---|
| Premium, monthly | £5.99/mo | `STRIPE_PRICE_PREMIUM_MONTHLY` |
| Premium, annual | £59.99/yr | `STRIPE_PRICE_PREMIUM_ANNUAL` |
| Family, monthly | £12.99/mo | `STRIPE_PRICE_FAMILY_MONTHLY` |
| Family, annual | £129.99/yr | `STRIPE_PRICE_FAMILY_ANNUAL` |
| Organisation, per seat | £2.00/mo | `STRIPE_PRICE_ORG_SEAT` |

**On each price, add metadata `plan` = the key above** (`premium_monthly` and so on).
The webhook reads that metadata to decide the ACU allowance. Without it the invoice is
recorded and **no allowance is granted** — the response says so rather than failing
silently.

### 5b · Keys

```bash
# .env
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_PREMIUM_MONTHLY=price_…
# … one per plan
```

**Check what is still missing:**

```bash
curl -s localhost:4000/api/stripe/status
```

It names every Price ID that is not yet set, and reports `mode` as `test`, `live` or
`none`. With no key, checkout returns a 400 that explains itself and the rest of the API
is unaffected.

### 5c · The webhook, locally

```bash
stripe login
stripe listen --forward-to localhost:4000/api/stripe/webhook
```

`stripe listen` prints a `whsec_…` — **that is a different secret from the dashboard
one**. Put it in `.env` and restart the API.

Then, in a second terminal:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

**Done when** each returns 200 and the response body says what it did:

```json
{ "id": "evt_…", "type": "invoice.paid", "outcome": "applied",
  "detail": "Granted 1200 ACU to u_demo for premium_monthly (£5.99 paid)." }
```

The three outcomes are `applied`, `duplicate` and `ignored`. All three are 200s.

### 5d · Prove the webhook is actually safe

These four behaviours are the difference between a webhook and an open endpoint. All
four are asserted in `apps/backend/test/billing.test.ts`, and you can reproduce them:

| Send | Expect |
|---|---|
| A correctly signed event | `200`, `outcome: applied` |
| **The same event id twice** | `200`, `outcome: duplicate` — nothing repeated |
| An event type we do not model | `200`, `outcome: ignored` — never a 4xx |
| A body edited after signing | `400`, `no signature matched` |
| A timestamp older than 300s | `400`, `outside the 300s tolerance` |

> **Why an unknown type must be a 200.** A 4xx makes Stripe retry for three days and
> then disable the endpoint — so refusing an event you have not modelled eventually
> stops the ones you have.

> **Why the raw body matters.** The signature covers the exact bytes Stripe sent.
> `main.ts` creates the app with `rawBody: true`; without it every signature check fails
> and the cause is invisible, because the JSON looks correct.

### 5e · The webhook, deployed

Stripe dashboard → **Developers → Webhooks → Add endpoint**:

```
https://api.jessmove.com/api/stripe/webhook
```

Subscribe to exactly these ten:

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

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on the deployed service.
It is **not** the same as the `stripe listen` secret.

### 5f · A real test payment

```bash
curl -s -X POST localhost:4000/api/stripe/checkout \
  -H 'content-type: application/json' \
  -d '{"userId":"u_demo","plan":"premium_monthly",
       "successUrl":"http://localhost:3000/get-started?paid=1",
       "cancelUrl":"http://localhost:3000/get-started"}'
```

Open the returned `url`, pay with `4242 4242 4242 4242`, any future expiry, any CVC.

**Done when** `invoice.paid` arrives at your webhook and the response says the allowance
was granted.

Cards worth trying before you go live: `4000 0000 0000 9995` (declined),
`4000 0025 0000 3155` (requires 3-D Secure), `4000 0000 0000 0341` (attaches, then
fails on charge).

---

## Step 6 · Accounts, profiles and autosave

No configuration. Worth walking through, because the rules are the product.

```bash
B=localhost:4000/api

# A minor cannot activate without a guardian.
curl -s -X POST $B/accounts -H 'content-type: application/json' \
  -d '{"userId":"teen1","kind":"minor","age":15}'
# 400 · a Minor account cannot activate without a linked guardian

curl -s -X POST $B/accounts -H 'content-type: application/json' \
  -d '{"userId":"teen1","kind":"minor","age":15,"guardianId":"g1"}'

# Autosave a safe field.
curl -s -X POST $B/accounts/profiles/teen1/autosave -H 'content-type: application/json' \
  -d '{"age":15,"basedOnVersion":1,"patch":{"displayName":"Robin"}}'
# state: saved, version: 2

# A consent flag will not autosave.
curl -s -X POST $B/accounts/profiles/teen1/autosave -H 'content-type: application/json' \
  -d '{"age":15,"basedOnVersion":2,"patch":{"optedIntoBodyMetrics":true}}'
# 400 · needs a confirmed submit rather than autosave

# A date of birth is not editable here at all.
curl -s -X POST $B/accounts/profiles/teen1/autosave -H 'content-type: application/json' \
  -d '{"age":15,"basedOnVersion":2,"patch":{"dateOfBirth":"2011-01-01"}}'
# 400 · these fields are not editable here

# A fifteen-year-old cannot upload a photograph.
curl -s -X POST $B/accounts/media/check -H 'content-type: application/json' \
  -d '{"slot":"avatar","age":15,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}'
# ok: false — and it returns the illustrated avatars offered instead

# The same photograph from an adult.
curl -s -X POST $B/accounts/media/check -H 'content-type: application/json' \
  -d '{"slot":"avatar","age":30,"mimeType":"image/jpeg","bytes":400000,"widthPx":800,"heightPx":800}'
# ok: true, moderation: pending
```

Useful reference endpoints: `/accounts/kinds`, `/accounts/policy?age=15`,
`/accounts/media/rules`, `/accounts/autosave/policy`.

> **Storage is not wired.** `media/check` and `media` validate, strip-on-upload is
> specified and moderation state is tracked — but the bytes are not yet written to
> object storage. Point it at a bucket before real uploads: the only missing piece is
> the put, and the validation in front of it is already done.

---

## Step 7 · The full environment

```bash
# ---- core ----
PORT=4000
API_PREFIX=api
NODE_ENV=production
CORS_ORIGINS=https://jessmove.com          # exact origin, no trailing slash

# ---- database ----
DATABASE_URL=postgres://…?sslmode=require

# ---- AI (any subset; unconfigured providers are skipped) ----
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
AI_DEFAULT_PROVIDER=anthropic
AI_FALLBACK_ORDER=anthropic,openai,gemini

# ---- SMTP ----
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=JESS MOVE <no-reply@jessmove.com>

# ---- Stripe ----
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PREMIUM_MONTHLY=
STRIPE_PRICE_PREMIUM_ANNUAL=
STRIPE_PRICE_FAMILY_MONTHLY=
STRIPE_PRICE_FAMILY_ANNUAL=
STRIPE_PRICE_ORG_SEAT=
```

On Cloud Run these go in Secret Manager, never in `--set-env-vars`:

```bash
printf '%s' "sk_live_…"   | gcloud secrets create stripe-secret  --data-file=-
printf '%s' "whsec_…"     | gcloud secrets create stripe-webhook --data-file=-
printf '%s' "$SMTP_PASS"  | gcloud secrets create smtp-pass      --data-file=-

gcloud run services update jessmove-api --region europe-west2 \
  --set-secrets "STRIPE_SECRET_KEY=stripe-secret:latest,STRIPE_WEBHOOK_SECRET=stripe-webhook:latest,SMTP_PASS=smtp-pass:latest"
```

---

## Step 8 · The checklist

- [ ] `pnpm -r test` → **279 pass, 0 fail**
- [ ] `bash scripts/smoke.sh <base>` → **65/65**
- [ ] `pnpm db:test` → 14 rejections
- [ ] `/api/health` returns 200
- [ ] `/api/stripe/status` lists no missing Price IDs
- [ ] `/api/mail/status` reads `configured: true`
- [ ] A test email arrives, and not in the spam folder
- [ ] `stripe trigger invoice.paid` → `outcome: applied`
- [ ] The same event id twice → `outcome: duplicate`
- [ ] A tampered body → `400`
- [ ] SPF, DKIM and DMARC records exist
- [ ] `CORS_ORIGINS` names the exact origin the site is served from
- [ ] Secrets are in Secret Manager, not in environment variables

---

## What is still not built

Said plainly, because a runbook that hides gaps is worse than none.

- **Object storage for profile media.** Validation, EXIF-stripping policy and moderation
  state are done; the bytes are not yet written anywhere.
- **The repository layer.** `MovementsService`, `WalletService` and `ProfilesService`
  hold state in memory. The Postgres schema is written and its invariants are tested,
  but the services do not read from it yet — so a restart loses runtime state.
- **Authentication.** There is no login, no session and no token. Every endpoint is
  currently open, which is correct for a private pilot and is not acceptable in front of
  real users.

The first two are plumbing. The third is a gate before any public launch.
