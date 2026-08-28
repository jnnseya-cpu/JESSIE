# Going live — jessmove.com, step by step

This is a runbook. Do the steps in order and do not skip one, because several depend on
the one before. Every step says **what to do** and **how you know it worked**.

Nothing here can be done from inside this repository — it all needs your accounts, your
card and your domain.

- **Domain:** `jessmove.com`, already bought, at **Hostinger**. It stays there.
- **Time:** about 3 hours the first time, most of it waiting for DNS and certificates.
- **Cost:** roughly £15–30/month to start.

`docs/DEPLOY.md` covers the build mechanics. This covers getting on the internet.

---

# Part 1 — Where everything actually lives

## In the repository

People talk about "backend, frontend and shared" as if that is three deployments.
**It is two.** The third is a library that gets compiled *into* the other two.

| Folder in the repo | Package name | Compiles to | Deploys to |
|---|---|---|---|
| **`apps/backend`** | `@jessmove/backend` | `dist/main.js` | **A container** — Cloud Run or a VPS. This is the API. |
| **`apps/frontend`** | `@jessmove/frontend` | `.next/` | **Vercel** — or a second container. This is the website. |
| **`packages/shared`** | `@jessmove/shared` | `dist/index.js` | **Nowhere.** Compiled into both apps. |
| **`packages/body-command`** | `@jessmove/body-command` | `dist/index.js` | **Nowhere.** Compiled into the API. |
| **`packages/foodlens`** | `@jessmove/foodlens` | `dist/index.js` | **Nowhere.** Compiled into the API. |
| **`db/migrations`** | — | SQL files | Run **against** the Postgres database. |

> ### `shared` does not get deployed. Ever.
>
> It is a workspace library, not a service. `pnpm-workspace.yaml` links it by folder
> path. Both Dockerfiles run `pnpm --filter @jessmove/shared build` *before* building
> the app that uses it, and the compiled JavaScript ends up inside that app's own
> bundle.
>
> There is no npm publish, no registry, no server and no URL for `shared`. The same is
> true of `body-command` and `foodlens`. **You deploy two things: the API and the site.**

## Online, when you are finished

```
   Browser
      │
      ▼
┌─────────────────────────┐
│  jessmove.com           │   apps/frontend  →  Vercel
│  www.jessmove.com       │
└───────────┬─────────────┘
            │  HTTPS
            ▼
┌─────────────────────────┐
│  api.jessmove.com       │   apps/backend   →  Cloud Run
│    + shared             │
│    + body-command       │   ← compiled in, not deployed
│    + foodlens           │
└───────────┬─────────────┘
            │  TCP 5432 over TLS
            ▼
┌─────────────────────────┐
│  Postgres 16            │   db/migrations  →  Neon (London)
└─────────────────────────┘
```

## Two routes — pick one now

| | **Route A** — Vercel + Cloud Run | **Route B** — one Hostinger VPS |
|---|---|---|
| Steps | 1 → 12 below | The appendix at the end |
| Monthly | £15–30, scales with use | £7–20, flat |
| Scales to zero when idle | yes | no |
| You patch the operating system | no | **yes** |
| Rollback | one command, instant | `git checkout` and rebuild |
| Tested in this repo | build path tested | **compose path untested** |

**Route A is recommended and is what Steps 1–12 describe.** Either way, the domain
stays at Hostinger and Hostinger only answers DNS. You are not transferring it, and you
do not need a Hostinger hosting plan for Route A.

---

# Part 2 — The DNS cheat sheet

Every record you will ever add, in one place. You add them in
**hPanel → Domains → jessmove.com → DNS / Nameservers → DNS records**.

| # | Type | Name | Value | Added in |
|---|---|---|---|---|
| 1 | `TXT` | `@` | `google-site-verification=…` | Step 6 |
| 2 | `CNAME` | `api` | `ghs.googlehosted.com` | Step 6 |
| 3 | `A` | `@` | the IPv4 Vercel shows you | Step 8 |
| 4 | `CNAME` | `www` | `cname.vercel-dns.com` | Step 8 |

Three rules that cause almost every DNS problem people have:

1. **Type the short name only.** Put `api` in the name field, **not**
   `api.jessmove.com`. Hostinger adds the domain for you. Typing the full name gives
   you `api.jessmove.com.jessmove.com`, which resolves to nothing and looks fine in the
   panel.
2. **Delete Hostinger's parking records first.** See Step 2.
3. **Set TTL to `300`** while you work. Hostinger defaults to `14400` — four hours per
   mistake.

---

# Part 3 — The steps

## Step 1 · Open your accounts

Do this first. One of them takes days.

| Account | What for | Cost |
|---|---|---|
| ~~Domain~~ | ~~jessmove.com~~ | **done, at Hostinger** |
| GitHub | source, CI, deploy triggers | free |
| Google Cloud | the API, on Cloud Run | pay per use, needs a card |
| Vercel | the website | free tier is enough |
| Neon | Postgres | free tier is enough |
| Stripe | payments | 1.5% + 20p |
| Anthropic / OpenAI / Google AI | model access | pay per use |

**Start the Stripe application right now.** Full activation takes **1–3 days** and you
cannot take a single payment until it clears. Everything else is instant.

**Done when:** all six are open and Stripe says "under review" or better.

---

## Step 2 · Clean up Hostinger's DNS zone

A fresh Hostinger domain already has an `A` record on `@` and a `CNAME` on `www`
pointing at a parking page. Hostinger will happily let you add a *second* `A` record on
`@` alongside it — and then browsers round-robin between your real site and the parking
page. It works about one refresh in two, which looks like a caching problem and is not.

**Do this:**

1. hPanel → **Domains** → `jessmove.com` → **DNS / Nameservers**.
2. Confirm the nameservers are Hostinger's own:
   `ns1.dns-parking.com` and `ns2.dns-parking.com`.
   If they point anywhere else, records you add here do nothing, because nothing is
   asking Hostinger.
3. Scroll to **DNS records**. Delete every `A`, `AAAA` and `CNAME` record on the names
   `@`, `www` and `api`.
4. **Do not touch `MX` records.** Deleting them silently stops email for the domain.
5. Set the TTL field to `300` on anything you add from here on.

**Done when:** `dig +short jessmove.com` returns nothing, or only records you
recognise.

*Prefer Cloudflare? That is fine and arguably better — point the Hostinger nameservers
at Cloudflare and add the same records there. One thing matters: set `api` to **DNS
only** (grey cloud). An orange-cloud proxy in front of Cloud Run breaks the certificate
handshake.*

---

## Step 3 · Decide which branch is production

**This repository has no `main` branch.** Its default branch is
`claude/jessie-os-spec-doc-7audof`, and that is the only branch on the remote.

This matters more than it sounds, because Vercel's **Production Branch** setting
defaults to `main`. If `main` does not exist, no deployment is ever promoted to the
production domain — every build lands as a Preview, and the dashboard reports:

```
No Production Deployment
Your Production Domain is not serving traffic.
```

Pick one and do it now:

**Either — point Vercel at the branch you actually use.** Vercel → Settings → Git →
Production Branch → `claude/jessie-os-spec-doc-7audof`. Fastest, and fine for a pilot.

**Or — create `main` and make it the default.** Better long-term, because a working
branch named after a task is a poor place for production to live:

```bash
git checkout -b main
git push -u origin main
```

Then GitHub → Settings → Default branch → `main`, and leave Vercel's Production Branch
at its default.

Either way, open the repository's **Actions** tab afterwards and watch
`.github/workflows/ci.yml`.

**Done when:** CI is green — build, typecheck, 200 tests, the 14 database invariants
against a real Postgres, and a live smoke test of the API.

**If CI is red, stop here.** Every step below assumes it passes.

---

## Step 4 · Create the database

Neon, not Cloud SQL, for a pilot. Serverless Postgres 16, a real free tier, and no VPC
configuration — which is the part of Cloud SQL that costs an afternoon.

1. **neon.tech** → new project → region **London (eu-west-2)**.
2. Copy the connection string. It looks like:
   `postgres://user:pass@ep-xxx.eu-west-2.aws.neon.tech/jessmove?sslmode=require`
3. Apply the schema and prove the safety constraints hold:

```bash
export DATABASE_URL='postgres://…?sslmode=require'
pnpm db:migrate
pnpm db:test
```

**Done when:** `pnpm db:test` prints **14 rejections** — one per invariant, each proven
to reject the write that would violate it.

If it prints fewer, the schema did not apply cleanly. Fix it now. Those constraints are
the last line of defence for the safeguarding rules.

---

## Step 5 · Put your secrets in Google Cloud

```bash
gcloud auth login
gcloud projects create jessmove-prod --name="Jess Move"
gcloud config set project jessmove-prod
```

Link a billing account at **console.cloud.google.com/billing**, then:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com

printf '%s' "$DATABASE_URL" | gcloud secrets create database-url  --data-file=-
printf '%s' "sk-ant-…"      | gcloud secrets create anthropic-key --data-file=-
printf '%s' "sk-…"          | gcloud secrets create openai-key    --data-file=-
```

Only create the AI secrets you actually have. The gateway **skips** unconfigured
providers rather than failing, so the API starts and serves normally without any of
them — only `/ai/complete` degrades.

**Done when:** `gcloud secrets list` shows the secrets you created.

---

## Step 6 · Deploy the API, and give it `api.jessmove.com`

### 6a · Build and deploy

```bash
REGION=europe-west2      # London. Keeps the data in the UK.

gcloud builds submit --tag gcr.io/jessmove-prod/api --file Dockerfile.backend .

gcloud run deploy jessmove-api \
  --image gcr.io/jessmove-prod/api \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 10 \
  --cpu 1 --memory 512Mi --timeout 60s \
  --set-env-vars "API_PREFIX=api,CORS_ORIGINS=https://jessmove.com,NODE_ENV=production" \
  --set-secrets "DATABASE_URL=database-url:latest,ANTHROPIC_API_KEY=anthropic-key:latest"
```

`CORS_ORIGINS` is the final website address. The website does not exist yet. That is
fine and deliberate — setting it now means you never have to redeploy the API later.

You get back a URL like `https://jessmove-api-xxxx.a.run.app`. Test it:

```bash
bash scripts/smoke.sh https://jessmove-api-xxxx.a.run.app/api
```

**Done when it prints `pass=22 fail=0`.** Do not continue otherwise.

### 6b · Prove to Google that you own the domain

Cloud Run will not map a domain you have not verified.

1. Open **search.google.com/search-console** → add a **Domain** property →
   `jessmove.com`.
2. It gives you one `TXT` record. In Hostinger's DNS records panel add:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | `TXT` | `@` | `google-site-verification=…` | `300` |

   If the name field rejects `@`, leave it empty — same thing.
3. Wait two minutes, press **Verify**.

### 6c · Map the domain

```bash
gcloud beta run domain-mappings create \
  --service jessmove-api --domain api.jessmove.com --region $REGION
```

It prints one record. Add it in Hostinger:

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `api` | `ghs.googlehosted.com` | `300` |

Remember: the name field gets **`api`**, not `api.jessmove.com`.

Watch the certificate appear:

```bash
gcloud beta run domain-mappings describe --domain api.jessmove.com --region $REGION
```

`CertificateProvisioned` moves from `False` to `True`. Takes 15 minutes to a few hours.
Until then the address shows a certificate warning — that is expected, not a fault.

**Done when:**

```bash
bash scripts/smoke.sh https://api.jessmove.com/api
```

prints `pass=22 fail=0`.

---

## Step 7 · Deploy the website

```bash
npm i -g vercel
vercel login
vercel link          # scope: your account · project: jessmove
```

### 7a · Set the Root Directory first — this is the one that bites

**Vercel dashboard → your project → Settings → Build and Deployment → Root
Directory → `apps/frontend`.** Then redeploy.

While you are in Settings, two more fields matter:

- **Build and Deployment → Output Directory.** It must be **empty** (the default). If it
  still says `apps/frontend/.next` from an earlier attempt, the path gets doubled once
  the Root Directory is `apps/frontend`, and the build succeeds and then fails at the
  last step with:

  ```
  Error: The Next.js output directory "apps/frontend/.next" was not found at
  "/vercel/path0/apps/frontend/apps/frontend/.next"
  ```

  `apps/frontend/vercel.json` sets `outputDirectory` to `.next`, which overrides the
  dashboard — but clearing the dashboard override is the cleaner fix and costs one
  click.

- **Git → Production Branch.** Root Directory decides whether the build *works*;
  Production Branch decides whether a working build reaches your domain. Both have to
  be right, and getting only one produces a green build that still leaves the domain
  dark. See Step 3.

This is a monorepo with five workspace packages. If the Root Directory is anything else,
Vercel installs the wrong project's dependencies and the build fails with:

```
Warning: Could not identify Next.js version, ensure it is defined as a project dependency.
Error: No Next.js version detected.
```

That message is misleading — `next` **is** a dependency, in
`apps/frontend/package.json`. Vercel was looking somewhere else. If the install log lists
`@nestjs/common` and `openai`, the Root Directory is pointing at `apps/backend`, which is
the API and has no Next.js in it by design.

Two consequences worth knowing:

- Vercel reads `vercel.json` **from the Root Directory**, not from the repository root.
  The config that matters is `apps/frontend/vercel.json`, and it is the only one in the
  repository.
- Leave **"Include source files outside of the Root Directory"** switched on. It is the
  default, and the build needs it — `apps/frontend` imports three workspace packages that
  live outside its own folder.

The build command in that file compiles the three workspace packages before running
`next build`, which is why `shared`, `body-command` and `foodlens` need no deployment of
their own:

```
pnpm --filter @jessmove/shared build
  && pnpm --filter @jessmove/body-command build
  && pnpm --filter @jessmove/foodlens build
  && next build
```

### 7b · Set the API address, then build

**Set the API address before the first production build.** `NEXT_PUBLIC_*` values are
baked into the JavaScript at build time — they are not read at runtime. Setting this
afterwards does nothing until you rebuild.

```bash
vercel env add NEXT_PUBLIC_API_BASE_URL production
# paste exactly:  https://api.jessmove.com/api

vercel --prod
```

**Done when:** the `*.vercel.app` URL Vercel prints loads the site, and the graphs
render.

---

## Step 8 · Point jessmove.com at Vercel

1. Vercel dashboard → your project → **Settings** → **Domains**.
2. Add `jessmove.com`. Then add `www.jessmove.com`.
3. Vercel shows you the exact records it wants. Add them in Hostinger:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | `A` | `@` | **the IPv4 address Vercel displays** | `300` |
   | `CNAME` | `www` | `cname.vercel-dns.com` | `300` |

> **Use the address Vercel shows you, not one from a guide.** Vercel runs more than one
> anycast address — older projects get `76.76.21.21`, newer ones `216.198.79.1`. Your
> dashboard is the authority for your project.

4. Set `www.jessmove.com` to **redirect to** `jessmove.com` in the same panel. You want
   one canonical address, because `CORS_ORIGINS` on the API names exactly one.

Vercel issues the certificate itself. There is nothing to upload.

**Done when:** both domains read **Valid Configuration** in Vercel, and:

```bash
dig +short jessmove.com        # one address
dig +short www.jessmove.com    # cname.vercel-dns.com
dig +short api.jessmove.com    # ghs.googlehosted.com
```

**Two addresses on `jessmove.com` means you left a Hostinger parking record behind.**
Go back to Step 2.

### 8a · "Not secure" on a site that loads

If the site appears but the browser shows **Not secure** with `https` struck through, the
page is being served but the certificate does not cover the hostname. It is a
certificate problem, not a deployment problem — and on this setup it is almost always
caused by the *other* hostname.

Vercel issues one certificate covering every domain attached to the project. If
`www.jessmove.com` points at Vercel but `jessmove.com` still points somewhere else, the
apex fails its validation, the certificate order cannot complete, and **`www` is left
without a valid certificate even though `www` itself is configured correctly**.

Check both, and compare them:

```bash
dig +short jessmove.com          # must be the IPv4 Vercel shows you
dig +short www.jessmove.com      # must resolve to Vercel too
```

If the apex returns something in Hostinger's range — a single address like `2.57.91.91`
is the parking page — that is your cause. Delete that `A` record on `@` and add the one
Vercel displays, then press **Refresh** on the domain in Vercel → Settings → Domains.
The certificate is usually issued within a few minutes of both names resolving.

### 8b · Do not point `api` at Vercel

`api.jessmove.com` belongs to Cloud Run, not Vercel. If it resolves to the same
addresses as `www`, it has been added to the Vercel project by mistake — remove it
there, and make it a `CNAME` to `ghs.googlehosted.com` as Step 6c describes. Until
Cloud Run's domain mapping exists, the correct state for `api` is **no record at all**.

### 8c · Pick a canonical origin and keep the API in step

Whichever of `jessmove.com` and `www.jessmove.com` you make canonical, `CORS_ORIGINS` on
the Cloud Run service must name **that exact origin**. If the site ends up living on
`www` while the API allows only the apex, every request from the browser is blocked
before it leaves, the server logs show nothing, and it looks like the API is down.

---

## Step 9 · Prove the whole thing actually works

**From a terminal:**

```bash
bash scripts/smoke.sh https://api.jessmove.com/api
```

Expect `pass=22 fail=0`.

**From a browser:** open `https://jessmove.com/console`, check the API base URL box
reads `https://api.jessmove.com/api`, and press **Run all checks**. Expect **10/10**.

That page is the fastest CORS test there is — a CORS failure shows up as a readable
message instead of a silent console error.

**Two results matter more than the other eight**, because they are the ones that would
be genuinely damaging to get wrong in front of a customer:

- **The driving hold** returns `blocks: ["driving"]` as a **success**, not an error.
- **The child case** — age 12 with `optedIntoBodyMetrics: true` — still returns
  `CHILD_GROWTH` with `metrics: null`. The consent switch is not consulted below 18.

If either fails you have shipped a build that breaks a safeguarding rule. Roll back
immediately:

```bash
gcloud run services update-traffic jessmove-api --to-revisions PREVIOUS=100 --region $REGION
```

---

## Step 10 · Turn on automatic deploys

**Website:** connect the GitHub repo in Vercel. Every push to `main` deploys; every
pull request gets its own preview URL. Nothing else to configure.

**API:** add `cloudbuild.yaml` at the repository root:

```yaml
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-f', 'Dockerfile.backend', '-t', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA', '.']
  - name: gcr.io/cloud-builders/docker
    args: ['push', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA']
  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: gcloud
    args: ['run', 'deploy', 'jessmove-api',
           '--image', 'gcr.io/$PROJECT_ID/api:$SHORT_SHA',
           '--region', 'europe-west2']
```

then:

```bash
gcloud builds triggers create github \
  --repo-name=jessie --repo-owner=jnnseya-cpu \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml
```

**Done when:** a trivial push to `main` produces a new Cloud Run revision and a new
Vercel deployment without you typing anything.

---

## Step 11 · Payments

Only once Stripe is fully activated.

1. Create the products and prices in the Stripe dashboard, matching the published
   plans: Premium £5.99 and £8.99, Family £12.99 and £17.99, Organisation per seat.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Secret Manager, then to the
   Cloud Run service.
3. Point the Stripe webhook at `https://api.jessmove.com/api/stripe/webhook`.
4. Test in Stripe's test mode with card `4242 4242 4242 4242` before switching to live
   keys.

> ### This part is not built yet.
>
> The wallet, the ACU arithmetic, the £5 minimum charge and the spend controls all
> exist and are tested. **The Stripe checkout, the webhook handler and the subscription
> lifecycle are not written.** Budget a few days of development. Everything the billing
> logic needs is already in `apps/backend/src/acu/`.

---

## Step 12 · The checklist before you tell anyone

- [ ] `bash scripts/smoke.sh https://api.jessmove.com/api` → 22/22
- [ ] `https://jessmove.com/console` → 10/10, **including the driving hold and the child case**
- [ ] CI green on the production branch
- [ ] `pnpm db:test` passes against the production database
- [ ] `https://jessmove.com` loads over HTTPS
- [ ] `www.jessmove.com` redirects to the apex
- [ ] `dig +short jessmove.com` returns **one** address — no parking record left
- [ ] `MX` records still present, if the domain receives email
- [ ] Hostinger TTLs raised from `300` back to `3600` or more
- [ ] `/terms`, `/privacy`, `/policies` and `/status` all load
- [ ] `/console` is `noindex` — it is by default, confirm it
- [ ] No unit-economics page is reachable, and nothing links to one
- [ ] ICO registration done — you are processing UK health data
- [ ] The Clinical Safety Officer has signed off every health claim on the live site
- [ ] Uptime check in Cloud Monitoring against `/api/health`
- [ ] A budget alert on the GCP billing account, so a runaway agent loop is noticed in
      hours rather than at the end of the month

---

# Part 4 — What it costs

| Item | Monthly |
|---|---|
| Cloud Run, `min-instances 0`, pilot traffic | £3–10 |
| Cloud Run, `min-instances 1`, no cold starts | £12–20 |
| Neon free tier | £0 |
| Neon production tier | £15 |
| Vercel hobby / pro | £0 / £16 |
| AI inference, a few hundred users | £5–40 |
| `jessmove.com`, already paid | ~£1 amortised |
| *Route B instead:* Hostinger VPS KVM 2, everything | £7–20 |

**Under £30/month** for a pilot with a few hundred users. The number that moves is AI
inference, and it is exactly what the per-agent ACU ceilings exist to bound.

---

# Part 5 — The four things most likely to go wrong

**1 · The Hostinger parking record.** The site loads correctly about half the time.
`dig +short jessmove.com` returning two addresses is the tell. Step 2.

**2 · CORS.** The site loads, every API call fails, and the server logs show nothing —
because the browser blocked the request before it ever left. `CORS_ORIGINS` must
contain the exact origin, with the scheme and no trailing slash: `https://jessmove.com`.
`/console` diagnoses this in one click.

**3 · The build-time API address.** Changing `NEXT_PUBLIC_API_BASE_URL` needs a
**rebuild**, not a restart. Editing it in the Vercel dashboard changes nothing until you
redeploy.

**4 · Cold starts.** With `--min-instances 0` the first request after an idle period
takes several seconds and a demo looks broken. Set `--min-instances 1` before any live
demonstration; it costs about £10/month.

---

# Appendix — Route B: everything on one Hostinger VPS

If you would rather have one machine you can log into, and you are already paying
Hostinger, this is a legitimate way to go live. `docker-compose.yml` runs the whole
stack — website, API and Postgres — on a single box.

> **Honest caveat.** Docker is not available in the container this repository was
> developed in, so `docker compose up --build` **has not been run end to end here**. The
> Dockerfiles use the same build commands that CI runs and that produce a working build,
> but the compose path itself is unverified. Budget an hour for first-run friction.
> Route A is the tested path.

**What you need:** a Hostinger **VPS** — KVM 2 or larger, since the Next.js build wants
about 2 GB — running Ubuntu 24.04 with Docker. Hostinger offers a Docker template at VPS
creation, which saves a step.

**Shared hosting and Business hosting cannot run this.** No Docker, no long-running Node
process. It must be a VPS.

### B1 · DNS

Simpler than Route A. All three names point at the one server:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `@` | your VPS IPv4 | `300` |
| `A` | `www` | your VPS IPv4 | `300` |
| `A` | `api` | your VPS IPv4 | `300` |

Delete the parking records first — Step 2 applies here too.

### B2 · Get the code on the box

```bash
ssh root@YOUR_VPS_IP
adduser jm && usermod -aG docker,sudo jm && su - jm

git clone https://github.com/jnnseya-cpu/jessie.git jessmove
cd jessmove
```

### B3 · Configure and start

```bash
cat > .env <<'EOF'
NEXT_PUBLIC_API_BASE_URL=https://api.jessmove.com/api
ANTHROPIC_API_KEY=sk-ant-…
EOF
```

Then edit `docker-compose.yml` and make three changes:

1. `CORS_ORIGINS` → `https://jessmove.com` (it ships as `http://localhost:3000`).
2. Change the Postgres password. `jessmove:jessmove` is a local development default and
   must not survive onto a public machine.
3. Bind the ports to localhost only: `'127.0.0.1:4000:4000'` and
   `'127.0.0.1:3000:3000'`, and **delete the `5432:5432` mapping entirely**. An
   internet-facing Postgres with a known password is found by scanners in hours.

```bash
docker compose up -d --build
```

The first build takes 5–10 minutes. Postgres applies `db/migrations/0001_core.sql`
automatically on an empty volume.

### B4 · TLS and the front door

The containers speak plain HTTP on `:3000` and `:4000`. Caddy terminates TLS, gets
certificates from Let's Encrypt on its own, and routes by hostname:

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
jessmove.com, www.jessmove.com {
    reverse_proxy 127.0.0.1:3000
}

api.jessmove.com {
    reverse_proxy 127.0.0.1:4000
}
EOF
sudo systemctl reload caddy

sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

Certificates arrive within a minute of the DNS records resolving.

### B5 · Verify

Same bar as Route A. Step 9 applies unchanged:

```bash
bash scripts/smoke.sh https://api.jessmove.com/api      # 22/22
```

then `https://jessmove.com/console` in a browser for 10/10, **including the driving hold
and the child case**.

### B6 · Updating and backing up

```bash
# deploy a change
git pull && docker compose up -d --build

# back up the database
docker compose exec -T db pg_dump -U jessmove jessmove | gzip > ~/backup-$(date +%F).sql.gz
```

Put that `pg_dump` on a cron job and copy the output **off the box**. A VPS snapshot is
not a database backup — it is a point-in-time disk image that can catch Postgres
mid-write.

---

# Part 6 — Operating it once it is live

Everything above gets the platform on the internet. This part is what stops a
Tuesday afternoon becoming an outage nobody noticed. It is the last set of
launch gates, and the only ones that cannot be closed from inside the
repository.

## 6.1 · What to watch, and the thresholds

The application already reports its own state. Nothing is watching it, and an
unwatched signal is not monitoring.

| Watch | Where | Alert when |
|---|---|---|
| The API is up | `GET /api/health` | two consecutive failures, or no answer in 30s |
| A dependency has degraded | `GET /api/health` → `data.status` | `status` is `degraded` or `down` for 5 minutes |
| The database is reachable and migrated | `GET /api/db/status` | `reachable` is false, or `migrationsApplied` is short of `migrationsExpected` |
| Stripe is wired correctly | `GET /api/stripe/status` | `webhookSecretConfigured` is false, or `mode` is not `live` |
| Registration is possible | `GET /api/auth/status` | it reports auth unconfigured — **this is silent from the outside and produces exactly the "no customers" symptom** |
| Money reversals that could not be recovered | `wallet_adjustments` where `shortfall_acus > 0` | any new row |
| The deploy is the commit you think | `GET /api/health` → `data.build.commit` | it differs from the branch head after a deploy |

The cheapest honest setup is an uptime checker hitting `/api/health` and
`/api/stripe/status`, plus an error tracker in both Vercel projects. Neither
needs code changes.

**Name one responder before launch.** An alert with no owner is a log line.

## 6.2 · Recovery, with measured numbers

The restore *procedure* is proven — `pnpm verify:recovery` dumps the live
schema and data, builds a second database from nothing but that dump, and
compares them. Last run: **53 tables, 387 rows, 29 migrations and 177
constraints all came back**, and the restore itself took **0.2 seconds** on a
small local dataset.

That proves the mechanism. It does not prove your production backup, which is
the point of the next paragraph.

**Before launch, restore a real production backup into a scratch database and
run the same comparison.** A backup that has never been restored is not a
backup. Record the actual time it takes — that number is your RPO/RTO for the
data, and it is the only version of it that means anything.

```bash
# on a machine that can reach the production database
pg_dump "$PROD_DATABASE_URL" -f /tmp/prod.sql --no-owner --no-acl
createdb jessmove_restore_check
psql -d jessmove_restore_check -v ON_ERROR_STOP=1 -f /tmp/prod.sql
DATABASE_URL=postgres://…/jessmove_restore_check pnpm verify:recovery
```

## 6.3 · Rollback

Migrations are additive and applied on boot by `DbService`, so **rolling the
code back does not roll the schema back** — and it does not need to, because
an older application against a newer schema simply ignores the new columns.
That is a deliberate property and it is what makes rollback safe here.

1. In Vercel, promote the previous deployment for **both** projects.
2. `GET /api/health` and confirm `data.build.commit` is the older commit.
3. `bash scripts/smoke.sh https://api.jessmove.com/api` — expect 85/85.

**Do this once before launch, deliberately, on a quiet afternoon.** A rollback
that has never been performed is a plan, not a capability.

## 6.4 · The verification suite

All of these run against a deployment. Point them at production only after
reading what each one does — the adversarial probe attempts abuse.

```bash
pnpm verify:money        # 16 checks: concurrency, reversals, grace period
pnpm verify:recovery     # 9 checks: backup/restore and deletion
pnpm verify:journeys     # 43 checks: browser journeys, mobile, keyboard, secrets
pnpm verify:adversarial  # 37 checks: authz, money routes, injection, headers
bash scripts/smoke.sh    # 85 checks: every endpoint's contract
node scripts/load-test.mjs
```

## 6.5 · What is still not proven

Honest list, kept here so it is not forgotten:

- No load test has run against production. The local profile showed **0
  errors across 6,300 requests** including a 200-way spike, with clean
  recovery and no latency drift — but that is one process on one machine and
  says nothing about Vercel or a managed Postgres.
- No production backup has been restored.
- No rollback has been performed on the real deployment.
- No alert has ever fired, because none exists.
- Email, SMS and WhatsApp delivery are unverified — no SMTP credentials.
- Only Chromium has been tested. Safari, Firefox and real phones have not.
