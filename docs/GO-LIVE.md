# Going live — the real sequence

Everything here needs your accounts, your card and your domain, so none of it can be
done from inside this repository. It is written as a runbook: do the steps in order,
because several of them depend on the one before.

`docs/DEPLOY.md` covers the mechanics. This covers actually getting on the internet.

**Time:** about three hours for a first run, most of it waiting for DNS.
**Cost to start:** roughly £15–30/month plus the domain. Nothing here needs a
committed-use contract.

---

## Where everything actually lives

Three things get talked about as if they were three deployments. They are not. Only
**two** things deploy; the third is compiled into both of them.

| In this repository | Package name | Builds to | Where it goes online |
|---|---|---|---|
| `apps/backend` | `@movequest/backend` | `dist/main.js` | **One container**, on Cloud Run or a VPS. This is the API. |
| `apps/frontend` | `@movequest/frontend` | `.next/` | **Vercel** (or a second container). This is the website. |
| `packages/shared` | `@movequest/shared` | `dist/index.js` | **Nowhere.** Compiled into both of the above. |
| `packages/body-command` | `@movequest/body-command` | `dist/index.js` | **Nowhere.** Compiled into the API. |
| `packages/foodlens` | `@movequest/foodlens` | `dist/index.js` | **Nowhere.** Compiled into the API. |
| `db/migrations` | — | SQL | Applied **to** the Postgres database, wherever it is hosted. |

> **`shared` is not a service and does not need publishing.** It is a workspace
> library. `pnpm-workspace.yaml` links it by path, both Dockerfiles run
> `pnpm --filter @movequest/shared build` before building the app that consumes it,
> and the compiled output ends up inside the app's own bundle. There is no npm
> registry step, no separate host, no URL. If you ever see instructions telling you to
> "deploy shared", they are describing a different architecture than this one.

So the real deployment picture is:

```
                    ┌──────────────────────────┐
  movequest.ai ───► │  Next.js site            │  Vercel (or container)
                    │  apps/frontend           │
                    └────────────┬─────────────┘
                                 │  HTTPS, browser → API
                                 ▼
                    ┌──────────────────────────┐
api.movequest.ai ─► │  NestJS API              │  Cloud Run (or container)
                    │  apps/backend            │
                    │   + shared               │
                    │   + body-command         │  ← all three compiled in
                    │   + foodlens             │
                    └────────────┬─────────────┘
                                 │  TCP 5432, TLS
                                 ▼
                    ┌──────────────────────────┐
                    │  Postgres 16             │  Neon / Cloud SQL / VPS
                    │  db/migrations applied   │
                    └──────────────────────────┘
```

**Two routes are documented below.** Pick one before Step 0:

- **Route A — Vercel + Cloud Run.** Steps 0–10. Managed, scales to zero, no server to
  patch. Hostinger holds the domain and answers DNS only. This is the recommended one.
- **Route B — one Hostinger VPS.** The appendix at the end. Everything on a single box
  you already pay Hostinger for, using `docker-compose.yml`. Cheaper and simpler to
  reason about; you own the patching, the backups and the TLS renewal.

Either way the domain stays at Hostinger. You are not transferring it.

---

## Step 0 · Accounts you need first

Open these before you start, because two of them take a day to verify.

| Account | For | Cost | Verification delay |
|---|---|---|---|
| ~~Domain registrar~~ | **Done — Hostinger** | already paid | — |
| GitHub | Source, CI, deploy triggers | free | none |
| Google Cloud | The API on Cloud Run | pay per use | needs a card |
| Vercel | The site | free tier is enough to start | none |
| Neon *or* Cloud SQL | Postgres | £0 → £15/mo | none |
| Stripe | Payments | 1.5% + 20p | **1–3 days** for full activation |
| Anthropic / OpenAI / Google AI | Model access | pay per use | usually instant |

Start the **Stripe** application first. It is the only thing here with a real waiting
period, and you cannot take a payment until it clears.

---

## Step 1 · The domain — you already have it

The domain is at **Hostinger**, and it stays there. Nothing below transfers it, and
you do not need Hostinger hosting — only its DNS zone, which is free with the domain.

Substitute your real domain for `movequest.ai` everywhere in this document.

### 1a · Make sure Hostinger is actually answering DNS

hPanel → **Domains** → your domain → **DNS / Nameservers**.

The nameservers must be Hostinger's own:

```
ns1.dns-parking.com
ns2.dns-parking.com
```

If they point somewhere else — Cloudflare, a previous host, a registrar default — then
the DNS records you add in Hostinger's zone editor will have no effect at all, because
nothing is asking Hostinger. Either set them back to the two above, or accept that the
records in Step 5 and Step 6 must be created wherever the nameservers *do* point.

*Using Cloudflare instead is fine and arguably better. Just add the records there, and
set the proxy to **DNS only** (grey cloud) for `api.` — an orange-cloud proxy in front
of Cloud Run breaks the managed certificate handshake.*

### 1b · Decide the names now

They get baked into builds later, so deciding them now saves a rebuild:

| Name | Points at | Record you will add |
|---|---|---|
| `movequest.ai` | the site, on Vercel | `A` on `@` |
| `www.movequest.ai` | redirect to apex | `CNAME` on `www` |
| `api.movequest.ai` | the API, on Cloud Run | `CNAME` on `api` |
| `status.movequest.ai` | optional, later | — |

> **The gotcha that catches everyone.** The site's build needs the API URL, and the
> API's CORS config needs the site's origin. Deciding both names *now* breaks the
> circle — you configure each with the other's final name before either exists, and
> nothing needs redeploying twice.

### 1c · Delete Hostinger's parking records first

This is the single most common cause of "I added the record and it didn't work".

A fresh Hostinger domain ships with a zone that already contains an `A` record on `@`
and a `CNAME` on `www` pointing at Hostinger's parking page. Hostinger's editor will
happily let you add a *second* `A` record on `@`, and then resolvers round-robin
between your site and a parking page — so it works one refresh in two, which looks
like a caching problem and is not.

hPanel → **Domains** → your domain → **DNS / Nameservers** → **DNS records**. Before
adding anything, delete every existing record of type `A`, `AAAA` or `CNAME` on the
names `@`, `www` and `api`.

**Leave `MX` and any `TXT` records alone** unless you know what they do — deleting the
`MX` records silently stops email for the domain.

Hostinger's default TTL is `14400` (4 hours). Set it to `300` while you are setting
things up, so a mistake costs five minutes instead of an afternoon. Raise it once the
site is live.

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

### Put it on your Hostinger domain

Google has to see that you own the domain before it will map anything to it.

**First, verify ownership.** Open
[Google Search Console](https://search.google.com/search-console) → add a **Domain**
property → it gives you one `TXT` record. In Hostinger's DNS records panel:

| Type | Name | Value | TTL |
|---|---|---|---|
| `TXT` | `@` | `google-site-verification=…` (paste what Google gives you) | `300` |

Hostinger writes `@` as the domain root — if the form rejects `@`, leave the name field
empty, which means the same thing. Wait two minutes, press **Verify** in Search Console.

**Then create the mapping:**

```bash
gcloud beta run domain-mappings create \
  --service movequest-api --domain api.movequest.ai --region $REGION
```

It prints the record to add. For a **subdomain** like `api.` it is always a single
`CNAME`:

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `api` | `ghs.googlehosted.com` (note the trailing dot if Hostinger requires one) | `300` |

Add that in Hostinger's DNS records panel. Put **`api`** in the name field, not
`api.movequest.ai` — Hostinger appends the domain for you, and typing the full name
produces `api.movequest.ai.movequest.ai`, which resolves to nothing and is invisible
until you check.

Watch it come up:

```bash
gcloud beta run domain-mappings describe \
  --domain api.movequest.ai --region $REGION
```

`CertificateProvisioned` goes `False` → `True`. It takes 15 minutes to a few hours.
Until then the domain returns a certificate error, which is expected and not a fault.

Then re-run the smoke test against `https://api.movequest.ai/api`.

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

### Point the Hostinger domain at Vercel

Vercel dashboard → your project → **Settings** → **Domains** → add `movequest.ai`,
then add `www.movequest.ai`. Vercel then shows you the exact records it wants.

**Use the values Vercel shows you, not the ones below.** Vercel has more than one
anycast address in service — older projects are given `76.76.21.21`, newer ones
`216.198.79.1` — and the dashboard is the authority for your project. The *shape* is
always this:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `@` | the IPv4 address Vercel displays | `300` |
| `CNAME` | `www` | `cname.vercel-dns.com` | `300` |

Add both in Hostinger → **Domains** → your domain → **DNS records**.

Back in Vercel, the two domains flip from *Invalid Configuration* to *Valid* within a
few minutes. Vercel issues the Let's Encrypt certificate itself; there is nothing to
upload. Set `www.movequest.ai` to **redirect to** `movequest.ai` in the same panel, so
you have one canonical origin — which matters, because `CORS_ORIGINS` on the API names
exactly one.

If it stays *Invalid Configuration* for more than ten minutes, check the resolver
directly rather than trusting a browser:

```bash
dig +short movequest.ai
dig +short www.movequest.ai
dig +short api.movequest.ai
```

Two IPv4 addresses on the apex means you did not delete Hostinger's parking record —
go back to Step 1c.

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
- [ ] `dig +short movequest.ai` returns **one** address — no Hostinger parking record left
- [ ] Hostinger TTLs raised from `300` back to `3600` or more, now that nothing is changing
- [ ] The `MX` records in Hostinger's zone are intact, if the domain receives email
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
| Domain, already paid at Hostinger | ~£6 amortised |
| *Route B instead:* Hostinger VPS KVM 2, all-in | £7–20 |

**Under £30/month** for a pilot with a few hundred users. The number that moves is AI
inference, and it is the one the per-agent ACU ceilings exist to bound.

---

## The four things most likely to go wrong

**1 · CORS.** The site loads, every API call fails, and the server logs show nothing
because the browser blocked the request before it left. `CORS_ORIGINS` must contain
the exact origin including scheme, with no trailing slash. `/console` diagnoses this in
one click.

**2 · The build-time API URL.** Changing `NEXT_PUBLIC_API_BASE_URL` requires a
*rebuild*, not a restart. Changing it in the Vercel dashboard does nothing until you
redeploy.

**3 · Cold starts.** With `min-instances 0`, the first request after idle takes a few
seconds and a demo looks broken. Set `--min-instances 1` before any live demonstration.

**4 · The Hostinger parking record.** Covered in Step 1c and repeated here because it
is the one that wastes the most time: the zone already has an `A` on `@` and a `CNAME`
on `www`. Adding yours without deleting theirs gives you a site that loads correctly
about half the time. `dig +short movequest.ai` returning two addresses is the tell.

---

## Appendix · Route B — everything on one Hostinger VPS

If you would rather have one machine you can log into, and you are already paying
Hostinger, this is a legitimate way to go live. `docker-compose.yml` runs the whole
stack — site, API and Postgres — on a single box.

**Honest caveat: Docker is not available in the container this repository was
developed in, so `docker compose up --build` has not been executed end to end here.**
The Dockerfiles are written against the same build commands that CI runs and that
produce a working local build, but the compose path itself is unverified. Budget an
hour for first-run friction, and treat Route A as the tested path.

**What you need:** Hostinger **VPS** (KVM 2 or larger — the Next.js build wants ~2 GB),
Ubuntu 24.04, with Docker installed. Hostinger offers a Docker template at VPS
creation, which saves a step. A shared-hosting or Business-hosting plan **cannot** run
this — it has no Docker and no long-running Node process. This must be a VPS.

### B1 · DNS

Same panel, simpler records. Both names point at the one server:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `@` | your VPS IPv4 | `300` |
| `A` | `www` | your VPS IPv4 | `300` |
| `A` | `api` | your VPS IPv4 | `300` |

Delete the parking records first — Step 1c applies here too.

### B2 · Get the code on the box

```bash
ssh root@YOUR_VPS_IP
adduser mq && usermod -aG docker,sudo mq && su - mq

git clone https://github.com/jnnseya-cpu/jessie.git movequest
cd movequest
```

### B3 · Configure

```bash
cat > .env <<'EOF'
NEXT_PUBLIC_API_BASE_URL=https://api.movequest.ai/api
ANTHROPIC_API_KEY=sk-ant-…
EOF
```

Then edit `docker-compose.yml` and change the API's `CORS_ORIGINS` from
`http://localhost:3000` to `https://movequest.ai`. Change the Postgres password too —
`movequest:movequest` is a local development default and must not survive onto a public
machine.

```bash
docker compose up -d --build
```

First build takes 5–10 minutes. Postgres applies `db/migrations/0001_core.sql`
automatically on an empty volume. Prove the invariants hold:

```bash
docker compose exec -T db psql -U movequest -d movequest -c '\dt'
```

### B4 · TLS and the front door

The containers listen on `:3000` and `:4000` over plain HTTP. Do not expose those.
Caddy terminates TLS, obtains certificates from Let's Encrypt automatically, and routes
by hostname:

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
movequest.ai, www.movequest.ai {
    reverse_proxy 127.0.0.1:3000
}

api.movequest.ai {
    reverse_proxy 127.0.0.1:4000
}
EOF
sudo systemctl reload caddy
```

Certificates arrive within a minute of the DNS records resolving. Then lock the ports
so only Caddy is reachable:

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

`ports:` in `docker-compose.yml` binds to all interfaces. Change `'4000:4000'` to
`'127.0.0.1:4000:4000'` and `'3000:3000'` to `'127.0.0.1:3000:3000'`, and delete the
`5432:5432` mapping entirely — an internet-facing Postgres with a known password is
found by scanners in hours, not days.

### B5 · Verify

```bash
bash scripts/smoke.sh https://api.movequest.ai/api
```

22/22, then `/console` in a browser for 10/10. Same bar as Route A — Step 7 applies
unchanged, including the driving hold and the child case.

### B6 · Updates and backups

```bash
git pull && docker compose up -d --build     # deploy
docker compose exec -T db pg_dump -U movequest movequest | gzip > ~/backup-$(date +%F).sql.gz
```

Put that `pg_dump` in a cron job and copy the output off the box. A VPS snapshot is not
a database backup — it is a point-in-time image that may catch Postgres mid-write.

### Route A or Route B

| | A · Vercel + Cloud Run | B · one Hostinger VPS |
|---|---|---|
| Monthly | £5–30, scales with use | £7–20, flat |
| Scales to zero | yes | no |
| You patch the OS | no | **yes** |
| TLS renewal | automatic | automatic, via Caddy |
| Traffic spike | absorbed | you resize the VPS |
| Rollback | one command, instant | `git checkout` and rebuild |
| Verified in this repo | build path tested | **compose path untested** |

Route A for a product with customers. Route B for a pilot, a demo, or a preference for
owning the machine.
