# Going live — the real sequence

Everything here needs your accounts, your card and your domain, so none of it can be
done from inside this repository. It is written as a runbook: do the steps in order,
because several of them depend on the one before.

`docs/DEPLOY.md` covers the mechanics. This covers actually getting on the internet.

**Time:** about three hours for a first run, most of it waiting for DNS.
**Cost to start:** roughly £15–30/month plus the domain. Nothing here needs a
committed-use contract.

---

## Step 0 · Accounts you need first

Open these before you start, because two of them take a day to verify.

| Account | For | Cost | Verification delay |
|---|---|---|---|
| Domain registrar | `movequest.ai` | £60–90/yr for `.ai` | none |
| GitHub | Source, CI, deploy triggers | free | none |
| Google Cloud | The API on Cloud Run | pay per use | needs a card |
| Vercel | The site | free tier is enough to start | none |
| Neon *or* Cloud SQL | Postgres | £0 → £15/mo | none |
| Stripe | Payments | 1.5% + 20p | **1–3 days** for full activation |
| Anthropic / OpenAI / Google AI | Model access | pay per use | usually instant |

Start the **Stripe** application first. It is the only thing here with a real waiting
period, and you cannot take a payment until it clears.

---

## Step 1 · The domain

Buy `movequest.ai` and plan the names now, because they get baked into builds later:

| Name | Points at |
|---|---|
| `movequest.ai` | the site, on Vercel |
| `www.movequest.ai` | redirect to apex |
| `api.movequest.ai` | the API, on Cloud Run |
| `status.movequest.ai` | optional, later |

> **The gotcha that catches everyone.** The site's build needs the API URL, and the
> API's CORS config needs the site's origin. Deciding both names *now* breaks the
> circle — you configure each with the other's final name before either exists, and
> nothing needs redeploying twice.

---

## Step 2 · Get the code onto GitHub

The branch is already pushed. Merge it to `main` so CI and the deploy hooks have
something stable to track.

```bash
git checkout main
git merge claude/jessie-os-spec-doc-7audof
git push origin main
```

Check the Actions tab. `.github/workflows/ci.yml` should go green: build, typecheck,
100 tests, the database invariants against a real Postgres, then a live smoke test of
the API. **If CI is red, stop here.** Everything downstream assumes it passes.

---

## Step 3 · The database

**Recommended for a pilot: Neon.** Serverless Postgres 16, a usable free tier, and no
VPC configuration — which is the part of Cloud SQL that costs an afternoon.

1. neon.tech → new project → region **London (eu-west-2)**
2. Copy the connection string. It looks like
   `postgres://user:pass@ep-xxx.eu-west-2.aws.neon.tech/movequest?sslmode=require`
3. Apply the schema and prove the invariants hold:

```bash
export DATABASE_URL='postgres://…?sslmode=require'
pnpm db:migrate
pnpm db:test        # 14 invariants, each proven to reject its violating write
```

If `db:test` does not print 14 rejections, the schema did not apply cleanly. Fix that
before going further — those constraints are the last line of defence for the
safeguarding rules.

*Switch to Cloud SQL when you have real users and want private IP and point-in-time
recovery. The connection string is the only thing that changes.*

---

## Step 4 · Secrets into Google Cloud

```bash
gcloud auth login
gcloud projects create movequest-prod --name="MoveQuest"
gcloud config set project movequest-prod
# Link billing in the console: console.cloud.google.com/billing

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com

printf '%s' "$DATABASE_URL"      | gcloud secrets create database-url  --data-file=-
printf '%s' "sk-ant-…"           | gcloud secrets create anthropic-key --data-file=-
printf '%s' "sk-…"               | gcloud secrets create openai-key    --data-file=-
```

Only create the AI secrets you actually have. The gateway skips unconfigured providers
rather than failing, so the API starts and serves without any of them — only
`/ai/complete` degrades.

---

## Step 5 · Deploy the API

```bash
REGION=europe-west2   # London. Keep data in the UK.

gcloud builds submit --tag gcr.io/movequest-prod/api --file Dockerfile.backend .

gcloud run deploy movequest-api \
  --image gcr.io/movequest-prod/api \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 10 \
  --cpu 1 --memory 512Mi --timeout 60s \
  --set-env-vars "API_PREFIX=api,CORS_ORIGINS=https://movequest.ai,NODE_ENV=production" \
  --set-secrets "DATABASE_URL=database-url:latest,ANTHROPIC_API_KEY=anthropic-key:latest"
```

`CORS_ORIGINS` is the final site origin from Step 1 — the site does not exist yet, and
that is fine.

`--min-instances 0` means you pay nothing when idle and accept a cold start of a few
seconds. Move to 1 when you have users; it costs roughly £10/month and removes it.

You get a URL like `https://movequest-api-xxxx.a.run.app`. Test it:

```bash
bash scripts/smoke.sh https://movequest-api-xxxx.a.run.app/api
```

**22/22 or do not continue.**

### Put it on your own domain

```bash
gcloud beta run domain-mappings create \
  --service movequest-api --domain api.movequest.ai --region $REGION
```

It prints DNS records. Add them at your registrar. Certificates take 15 minutes to a
few hours. Then re-run the smoke test against `https://api.movequest.ai/api`.

---

## Step 6 · Deploy the site

```bash
npm i -g vercel
vercel login
vercel link          # scope: your team, project: movequest
```

Set the API URL **before** the first production build — `NEXT_PUBLIC_*` is inlined at
build time, not read at runtime:

```bash
vercel env add NEXT_PUBLIC_API_BASE_URL production
# paste: https://api.movequest.ai/api
vercel --prod
```

Then in the Vercel dashboard → Settings → Domains: add `movequest.ai` and
`www.movequest.ai`, and follow the DNS instructions. Vercel handles the certificate.

`vercel.json` already carries the workspace-aware build command and the security
headers, so there is nothing else to configure.

---

## Step 7 · Prove the whole thing works

**From a terminal:**

```bash
bash scripts/smoke.sh https://api.movequest.ai/api
```

**From a browser:** open `https://movequest.ai/console`, confirm the API base URL box
reads `https://api.movequest.ai/api`, and press **Run all checks**. Expect 10/10.

That page is the fastest CORS test there is — a CORS failure appears as a readable
message rather than a silent console error.

Two results matter more than the rest, because they are the ones that would be
embarrassing to get wrong in front of a customer:

- **The driving hold** returns `blocks: ["driving"]` as a *success*, not an error.
- **The child case** — age 12 with `optedIntoBodyMetrics: true` — still returns
  `CHILD_GROWTH` and `metrics: null`.

If either fails, you have deployed a build that breaks a safeguarding rule. Roll back:

```bash
gcloud run services update-traffic movequest-api --to-revisions PREVIOUS=100 --region $REGION
```

---

## Step 8 · Continuous deployment

**Site:** connect the GitHub repo in Vercel. Every push to `main` deploys; every pull
request gets a preview URL. Nothing else to do.

**API:** a Cloud Build trigger on `main`.

```bash
gcloud builds triggers create github \
  --repo-name=jessie --repo-owner=jnnseya-cpu \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml
```

Add `cloudbuild.yaml` at the repo root:

```yaml
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-f', 'Dockerfile.backend', '-t', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA', '.']
  - name: gcr.io/cloud-builders/docker
    args: ['push', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA']
  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: gcloud
    args: ['run', 'deploy', 'movequest-api',
           '--image', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA',
           '--region', 'europe-west2']
```

---

## Step 9 · Payments

Only once Stripe is fully activated.

1. Create the products and prices in the Stripe dashboard, matching the published
   plans: Premium £5.99 and £8.99, Family £12.99 and £17.99, Organisation per-seat.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Secret Manager and to the
   Cloud Run service.
3. Point the webhook at `https://api.movequest.ai/api/stripe/webhook`.
4. Test in Stripe's test mode with card `4242 4242 4242 4242` before switching to live
   keys.

> **Not yet built.** The wallet, the ACU arithmetic, the £5 minimum charge and the
> spend controls all exist and are tested — but the Stripe checkout, webhook handler
> and subscription lifecycle are not written. Plan a few days of work here. Everything
> the billing logic needs is already in `apps/backend/src/acu/`.

---

## Step 10 · Before you tell anyone

- [ ] `scripts/smoke.sh` is 22/22 against production
- [ ] `/console` is 10/10 in a browser, including the driving hold and the child case
- [ ] CI is green on `main`
- [ ] `pnpm db:test` passes against the production database
- [ ] HTTPS works on `movequest.ai`, `www.` redirects to apex, `api.movequest.ai` resolves
- [ ] `/terms`, `/privacy`, `/policies` and `/status` all load
- [ ] `/console` is `noindex` (it is, by default — confirm it)
- [ ] The unit-economics page is **not** reachable — it was removed, confirm no stray link
- [ ] ICO registration done — you are processing UK health data
- [ ] The Clinical Safety Officer has signed off every health claim on the live site
- [ ] Uptime check configured in Cloud Monitoring against `/api/health`
- [ ] A budget alert on the GCP billing account, so a runaway agent loop is noticed in
      hours rather than at the end of the month

---

## What this costs, roughly

| Item | Monthly |
|---|---|
| Cloud Run, `min-instances 0`, pilot traffic | £3–10 |
| Cloud Run, `min-instances 1`, no cold starts | £12–20 |
| Neon free tier | £0 |
| Neon production tier | £15 |
| Vercel hobby / pro | £0 / £16 |
| AI inference, a few hundred users | £5–40 |
| Domain `.ai` | ~£6 amortised |

**Under £30/month** for a pilot with a few hundred users. The number that moves is AI
inference, and it is the one the per-agent ACU ceilings exist to bound.

---

## The three things most likely to go wrong

**1 · CORS.** The site loads, every API call fails, and the server logs show nothing
because the browser blocked the request before it left. `CORS_ORIGINS` must contain
the exact origin including scheme, with no trailing slash. `/console` diagnoses this in
one click.

**2 · The build-time API URL.** Changing `NEXT_PUBLIC_API_BASE_URL` requires a
*rebuild*, not a restart. Changing it in the Vercel dashboard does nothing until you
redeploy.

**3 · Cold starts.** With `min-instances 0`, the first request after idle takes a few
seconds and a demo looks broken. Set `--min-instances 1` before any live demonstration.
