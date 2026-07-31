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

✅ `pass=82 fail=0`

*(`health` saying `degraded` is normal — it means no AI key, not a fault.)*

---

## 2 · Email (SMTP)

You own `jessmove.com` at Hostinger, so create a mailbox there and use it:

```bash
# .env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=jess@jessmove.com     # the full address
SMTP_PASS=<that mailbox's password>
SMTP_FROM=JESS MOVE <jess@jessmove.com>
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
below — that metadata is the whole wiring: the backend discovers the prices from Stripe
by it, so there are no price IDs to copy anywhere, and changing a price in Stripe takes
effect on its own within five minutes.

| Plan | Price | metadata `plan` |
|---|---|---|
| Premium monthly | £5.99 | `premium_monthly` |
| Premium annual | £59.99 | `premium_annual` |
| Family monthly | £12.99 | `family_monthly` |
| Family annual | £129.99 | `family_annual` |
| Org per seat | £2.00 | `organisation_seat` |

```bash
# .env — only the two keys; prices are found via their metadata
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
```

*(A `STRIPE_PRICE_*` variable still works as an explicit override if you ever need to
pin one price ID — you don't by default.)*

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

Vercel detects NestJS on its own now: it finds `src/main.ts`, builds it, and runs the
whole API as one function. Same account as the website, second project, and
`api.jessmove.com` already points at Vercel.

1. vercel.com → **Add New → Project** → pick the same `JESSIE` repository again.
2. **Root Directory: `apps/backend`** · Framework preset: **NestJS** if it's offered,
   otherwise **Other** — detection works either way. Leave build and output alone —
   `apps/backend/vercel.json` carries them.
3. **Environment variables** — paste these into this project (the website's variables
   do not carry over):

   | Name | Value |
   |---|---|
   | `CORS_ORIGINS` | `https://jessmove.com,https://www.jessmove.com` |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | your values — prices are discovered from Stripe by their `plan` metadata, no price IDs needed |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | your values |
   | one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | your value |

   *(If you added `NODEJS_HELPERS=0` earlier: it belonged to the old deployment shape.
   It is harmless — leave it or delete it, nothing changes.)*

   **Optional, when you want live wearable connections** — each pair switches one
   provider's OAuth on; until then `/wearables/providers` says exactly what is missing:

   | Provider | Variables |
   |---|---|
   | Fitbit | `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET` |
   | Oura | `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` |
   | Polar | `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET` |

   Apple Health, Health Connect and Samsung Health are on-device — the phone app pushes
   consented samples to `/wearables/ingest`, no keys needed. Garmin requires their
   partner programme and the API says so rather than pretending.

   **FoodLens photo analysis** goes live with the same AI key as everything else —
   `POST /foodlens/analyze` answers in `sandbox` mode without one, `live` with one.

   **Background notifications (Web Push)** — three variables switch them on; generate a
   keypair with `node -e "const {generateVapidKeys}=require('./apps/backend/dist/push/webpush.logic');console.log(generateVapidKeys())"`:

   | Name | Value |
   |---|---|
   | `VAPID_PUBLIC_KEY` | the generated public key |
   | `VAPID_PRIVATE_KEY` | the generated private key — secret, server-only |
   | `VAPID_SUBJECT` | `mailto:jess@jessmove.com` |

   Then any signed-in person presses **Enable notifications** on /account, and
   `POST /push/test {"userId":"u_…"}` proves delivery on a locked phone. Subscriptions
   live in Postgres (`0003_push.sql`, self-applied). On iPhone, notifications require
   the app installed to the home screen — an iOS rule, not ours.

4. **Deploy.** You get `https://<project>.vercel.app`. Prove it:

   ```bash
   bash scripts/smoke.sh https://<project>.vercel.app/api
   ```

   ✅ `pass=82 fail=0`

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

## 7 · Storage — both kinds, inside Vercel

Backend Vercel project → **Storage** tab:

Both live **inside Vercel** — same dashboard, same account, same bill. Nothing new to
sign up for.

1. **Create a Postgres database** and connect it to the backend project:
   `DATABASE_URL` injects itself. Press **Redeploy** (Deployments → ⋯ → Redeploy).

   **That's it — there is no terminal step.** The backend applies its own schema on
   startup and records what it did. Open these in your browser to see the proof:

   | Open | Expect |
   |---|---|
   | `https://api.jessmove.com/api/db/status` | `"upToDate": true` and both migrations listed |
   | `https://api.jessmove.com/api/db/verify` | `"passed": 21, "allEnforced": true` |

   The second one replays every safeguarding rule against the live database — an
   under-18 cannot hold an adult account, a minor without a guardian is refused, a
   duplicate email is refused regardless of case, a report under k=8 is refused —
   and rolls itself back, so it never touches real data.

2. **Create a Blob store** and connect it: `BLOB_READ_WRITE_TOKEN` injects itself, and
   profile pictures start landing in Vercel Blob instead of memory. Every upload has
   its dimensions read from the bytes, its EXIF (including GPS) stripped before
   storage, and starts in `pending` moderation.

Check the rest from the browser too:

```
https://api.jessmove.com/api/accounts/storage/status   → driver: vercel-blob
https://api.jessmove.com/api/auth/status               → userStore: postgres
```

*(For developers with a local database: `pnpm db:migrate && pnpm db:test` still exist,
now pure Node — no psql needed.)*

---

## 8 · Auth

Two environment variables on the backend project:

| Name | Value |
|---|---|
| `AUTH_SECRET` | 32+ random characters — `openssl rand -base64 48` makes one |
| `COOKIE_DOMAIN` | `.jessmove.com` |

That enables `/account` on the site: register, sign in, sign out. The rules it
enforces, all server-side:

- **Age decides the kind.** Under 18 registers as a minor; the signup form cannot ask
  for, and the database cannot store, an under-18 adult. Elevated kinds (staff, org
  admin) are never self-service.
- **A minor needs a guardian email and starts dark** until the guardian confirms.
- **One login error message.** Wrong email and wrong password are the same sentence and
  take the same time, so the form does not leak which emails exist.
- **The session is an httpOnly cookie** signed with `AUTH_SECRET` — page JavaScript
  never sees the token. Passwords are scrypt-hashed with per-user salts.

`AUTH_ENFORCE=true` additionally locks the protected endpoints to signed-in sessions —
leave it off while /try and /console are in use, and turn it on before real users.
`/auth/status` always reports which mode you are in.

---

## Done when

- [ ] `pnpm -r test` → 295 pass
- [ ] `scripts/smoke.sh` → 82/82
- [ ] `/api/stripe/status` → no missing Price IDs
- [ ] `/api/mail/status` → `configured: true`
- [ ] A test email arrives, not in spam
- [ ] `stripe trigger invoice.paid` → `applied`, then `duplicate` on a repeat
- [ ] SPF, DKIM, DMARC set
- [ ] `CORS_ORIGINS` matches the site's exact origin

---

## What is still in memory

Honest ledger, updated:

- ~~Object storage~~ **Done.** Uploads are sniffed, stripped of EXIF/GPS, and stored in
  Vercel Blob (memory locally). Pending moderation, always.
- ~~Authentication~~ **Done.** Registration, login, sessions, guardian gating — users in
  Postgres when `DATABASE_URL` is set, and registration survives restarts.
- ~~ACU wallets~~ **Done.** Every grant and spend writes through to Postgres
  (`app_wallets`, `0004_state.sql`) — a granted balance survives restarts and instance
  recycling. Proven by granting 500 ACU, killing the process and reading the balance
  back from a fresh one.
- ~~Webhook duplicate-event memory~~ **Done.** Processed Stripe event ids land in
  `processed_events`; a replayed event grants nothing twice, whichever instance
  receives it. `invoice.paid` and top-ups now actually credit the wallet, not just
  describe doing so.
- ~~Guardian confirmation email~~ **Done.** A minor's registration emails the guardian
  a 7-day signed link; clicking it activates the account, resolves a pending guardian
  to their real account, and notifies them. `/auth/me` reports `guardianConfirmed`.
- **Still memory:** profiles' editable display fields and demo/try personas — cosmetic
  state that reseeds in seconds. Everything with money, safety or identity attached is
  durable. Two instances can, in a rare race, overwrite each other's wallet snapshot;
  SQL-transactional spending is the hardening step beyond pilot scale.
