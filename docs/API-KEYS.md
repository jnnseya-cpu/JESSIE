# Every key and secret the platform needs

Derived from the code, not from memory: every `process.env.X` and
`ConfigService.get('X')` in `apps/backend`, `apps/frontend`,
`packages/*` and `apps/mobile`, including the four names the wearables
service builds at runtime.

**Where these go.** The Vercel dashboard, under Settings →
Environment Variables, on **both** projects — `jessie-backend` and
`jessie-move`. Nowhere else: not in the repository, not in a frontend
bundle, not in a log, not in a URL. `.env.example` is the shape of the
file and holds no values.

**Which project.** Everything is backend-only except the three
`NEXT_PUBLIC_*` variables, which belong to the frontend project and are
**inlined into the browser bundle at build time** — changing one needs a
redeploy, not a restart, and anything put there is public by definition.

**How to tell whether it worked.** One command names every capability
that is still off and the variable that would switch it on:

```
bash scripts/verify-live.sh https://api.jessmove.com/api
```

It ends with a line like `RESULT commit=abc1234 off=push,mail,stripe`.
`off=none` is the goal.

---

## 1. Required — the platform does not work without these

| Variable | What it is | Without it |
|---|---|---|
| **`AUTH_SECRET`** | 32+ random characters, yours, generated once | Registration and sign-in return **400**: "authentication is not configured on this deployment". `configured()` tests `length >= 32`, so a 31-character value fails silently closed. Changing it invalidates every existing session. |
| **`DATABASE_URL`** | The Postgres connection string | The API still answers, and every durable store falls back to memory: accounts, wallets, the food ledger and **uploaded photographs** live in one instance and vanish when it recycles. `/api/accounts/storage/status` reports `durable: false`. |
| **`ADMIN_EMAILS`** | Comma-separated emails allowed to hold a staff account | **There is no administrator.** This is the only route to `platform_staff`, and every `@AdminOnly` route — the member directory, allowance grants, comms, security triage, `/db/verify` — refuses everybody. See §6 for the bootstrap. |
| **`CRON_SECRET`** | 16+ random characters | Every scheduled job refuses: no nudges, no blog autopilot, no newsletter. Fail-closed by design and compared in constant time, so an endpoint that pushes notifications at people is never open by default. |

`AUTH_SECRET` and `CRON_SECRET`: generate with
`openssl rand -base64 48`, and never reuse one for the other.

---

## 2. Required for the product to do what it advertises

| Variable | What it is | Without it |
|---|---|---|
| **`STRIPE_SECRET_KEY`** | `sk_live_…` from the Stripe dashboard | No payment can be taken. Checkout returns 400 with an explanation and everything else keeps working — and, by design, **nothing can grant allowance either**, so this is a safe state, not a broken one. |
| **`STRIPE_WEBHOOK_SECRET`** | The `whsec_…` of the **dashboard endpoint** | Payments complete at Stripe and the platform never hears. **Not** the secret `stripe listen` prints — those are different values for different environments, and using the CLI one in production means every real webhook fails its signature check. |
| `STRIPE_PRICE_PREMIUM_MONTHLY` / `_ANNUAL` / `STRIPE_PRICE_FAMILY_MONTHLY` / `_ANNUAL` / `STRIPE_PRICE_ORG_SEAT` | One price id per plan | Set `metadata.plan` on each price **in Stripe**, or `invoice.paid` records the payment and grants no allowance. |
| **One of** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | A provider key | Every AI surface serves cached prescriptions only. The gateway walks `AI_FALLBACK_ORDER`, so one key is enough to work and two or three are what make the fallback chain real. |
| **`VAPID_PUBLIC_KEY`**, **`VAPID_PRIVATE_KEY`**, **`VAPID_SUBJECT`** | Your own keys — no vendor, no account: `npx web-push generate-vapid-keys`. Subject is a `mailto:` or `https:` URL the push service can contact you at | The platform cannot speak first. `/push/status` reports unconfigured rather than offering a button that fails. **Generate once and keep them** — changing them invalidates every existing subscription. |
| **`SMTP_HOST`**, **`SMTP_PORT`**, **`SMTP_USER`**, **`SMTP_PASS`**, **`SMTP_FROM`** | Your mailbox | No verification email, no password reset, no guardian confirmation — so **an under-18 account can never activate**. Messages still render and are recorded as sandbox, so the flow stays testable. Port 587 negotiates STARTTLS, 465 is implicit TLS; on Hostinger the user is the full mailbox address. |

---

## 3. Optional — each buys one capability

| Variable | What it buys | Without it |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob object storage. Created in the dashboard under Storage | Pictures are kept in Postgres and served by the API — **durable, just slower and dearer at scale**. Only the no-database case loses them. |
| `FITBIT_CLIENT_ID` / `_SECRET`, `GARMIN_…`, `OURA_…`, `POLAR_…` | One wearable each; the pair switches the provider on | `/wearables/providers` names exactly which variable is missing rather than pretending the provider is available. Two of the four are partner programmes with an application queue. |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC`, `APNS_ENVIRONMENT` | Push to an installed iOS app. The private key is the **PEM contents** of the `.p8`, newlines and all — never a file path, since a serverless function has no file to read | Web push still works and is the only path for the site. Leave the whole block unset until the app is in a store. `APNS_ENVIRONMENT` is `sandbox` for TestFlight and `production` for the store; **the wrong one fails silently per device**. |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Push to an installed Android app, from the Firebase service-account JSON | As above. |
| `META_PIXEL_ID`, `META_CAPI_TOKEN`, `GOOGLE_TAG_ID`, `GOOGLE_MP_API_SECRET` | Server-side measurement | No measurement. These are the **two deliberate exceptions** to the no-new-vendor rule: consent-gated, public marketing pages only, never behind the login, never on a health surface, never for under-18s, and never sent an identity. The rules are enforced in `packages/shared/src/tracking.ts`, not at the call sites. A third vendor is a new decision. |
| `NEWSLETTER_AUTO_APPROVE_BY` | The weekly issue sends itself | It composes and stops in review. **Not a convenience flag:** setting it to a name means that person takes standing responsibility for copy they will not have read, and their name is recorded on every issue. Leave it unset unless somebody has agreed to that. |

---

## 4. Frontend project only — public by definition

Inlined into the browser bundle at build time. Never put a secret here.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.jessmove.com/api`. Optional in production — `apiBase()` resolves it from the hostname — but **set it anyway**: it is what the Content-Security-Policy is built from, and a preview deployment without it falls back to localhost. |
| `NEXT_PUBLIC_META_PIXEL_ID` | Must match `META_PIXEL_ID`. The consent banner only renders when one of these two is set. |
| `NEXT_PUBLIC_GOOGLE_TAG_ID` | Must match `GOOGLE_TAG_ID`. |

---

## 5. Configuration, not credentials

`AUTH_ENFORCE=true` (required in production — off, `@Protected` routes
stop requiring a session; `@AdminOnly` is never relaxed by it) ·
`API_PUBLIC_URL`, `SITE_PUBLIC_URL` (absolute links in email) ·
`COOKIE_DOMAIN` (`.jessmove.com`, so the session works across
subdomains) · `CORS_ORIGINS` (only to add an origin beyond
jessmove.com and localhost) · `ALLOW_ACCOUNT_RESET` (**leave unset in
production**) · `SEO_AUTOPILOT` · `AI_DEFAULT_PROVIDER`,
`AI_FALLBACK_ORDER`, `AI_REQUEST_TIMEOUT_MS`, `AI_TOKEN_RATES_JSON` ·
`ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, `OPENAI_BASE_URL`
(per-provider overrides — set one only when a key works but the model
does not, which usually means an account without access to it) ·
`API_PREFIX`, `PORT`, `NODE_ENV`.

`VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_REF` are
injected by the platform. Do not set them.

---

## 6. Creating the first administrator

There is no "create admin" button, deliberately — staff status comes from
deployment configuration and never from a request.

1. Add the email to **`ADMIN_EMAILS`** on the backend project and
   redeploy.
2. Register that email normally at `/account?new=1`, **or** sign in with
   an existing adult account on that email.

An existing adult account whose email joins the list is **promoted at
next sign-in**. A minor's account kind is never touched by this.

Verify with `GET /api/auth/admin/users` using that session: it is
`@AdminOnly`, so a 200 means the promotion took and a 401 means it did
not.

---

## 7. Verifying each one took effect

| Check | What it tells you |
|---|---|
| `bash scripts/verify-live.sh https://api.jessmove.com/api` | **Start here.** Every capability, and the `off=` list naming what is still missing. |
| `GET /api/health` | Database, AI gateway and Node runtime, plus the commit serving. |
| `GET /api/auth/status` | `AUTH_SECRET` and whether users are in Postgres. |
| `GET /api/stripe/status` | `secretKeyConfigured`, `webhookSecretConfigured`, and whether the plan prices resolve. |
| `GET /api/mail/status` | Per-variable: present, length, whether the value **is its own name** (the classic paste slip), and whether it has stray whitespace. The password is described, never shown. |
| `GET /api/push/status` | Web push, plus APNs and FCM separately. |
| `GET /api/accounts/storage/status` | `driver` and `durable`. `durable: false` means uploads do not survive a restart. |
| `GET /api/db/status` | The schema, and every migration applied. **Should read 35.** |
| `GET /api/wearables/providers` | Per provider, the exact variables still missing. |

None of these ever returns a secret. `/api/health` deliberately publishes
the Node *verdict* without the version, because a precise patch number on
an unauthenticated endpoint is what somebody probing for a
code-execution fault wants.

---

## 8. Two things to get right

**Rotation.** `AUTH_SECRET` signs every session and `VAPID_*` identifies
every push subscription. Rotating either is a user-visible event — signed
out everywhere, or every subscription dead. Generate once, store in a
password manager, and change only in response to a disclosure.

**The paste slip.** A value that is its own name
(`SMTP_PASS=SMTP_PASS`) and a value with a trailing newline are the two
mistakes that look configured and are not. `/api/mail/status` reports
`isOwnName` and `hasWhitespace` for exactly this reason. Vercel's
multi-line fields keep newlines — which `APNS_PRIVATE_KEY` and
`FCM_PRIVATE_KEY` need, and nothing else does.
