# Deploying JESS MOVE

Three things ship: **shared** (and the two domain packages) as build inputs,
**backend** as a Vercel function (or a container, if you prefer one), **frontend**
as a Next.js app. The packages are not published to a registry — they are
workspace dependencies compiled into both apps.

Everything below has been run end to end in this repository except the cloud steps,
which need credentials this environment does not hold.

---

## 1 · Locally, in one command

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Site | http://localhost:3000 |
| API | http://localhost:4000/api |
| API console | http://localhost:3000/console |
| Postgres | `postgres://jessmove:jessmove@localhost:5432/jessmove` |

The database schema is applied on first boot from `db/migrations/0001_core.sql`.

## 2 · Locally, without Docker

```bash
pnpm install
cp .env.example .env          # optional: add an AI provider key
pnpm build                    # shared → body-command → foodlens → backend → frontend
pnpm dev                      # API :4000 · site :3000
```

Verify it:

```bash
bash scripts/smoke.sh                              # against localhost
bash scripts/smoke.sh https://api.example.com/api  # against any deployment
```

22 checks: every read endpoint, the core prescription call, an explicit hold while
driving, the validation rejections, and the safeguarding case where a child with the
consent flag set to `true` must still receive `CHILD_GROWTH` and `metrics: null`.

---

## 3 · The backend, to Vercel

This is how `api.jessmove.com` is meant to run, and the shape the code is
written for — `DbService` applies the migrations on startup under a Postgres
advisory lock precisely so that concurrent serverless instances take turns.

```bash
cd apps/backend
vercel link                 # root directory: apps/backend
vercel env add DATABASE_URL production
vercel env add CORS_ORIGINS production      # https://jessmove.com,https://www.jessmove.com
vercel --prod
```

> **Two project settings decide whether any of this is read at all**, and
> neither lives in a file. In Vercel → the project → Settings → Build and
> Deployment:
>
> - **Root Directory must be `apps/backend`.** Anything else and
>   `apps/backend/vercel.json` is never opened, so the build command, the
>   output directory, the function and the rewrite below all do nothing.
>   That is not hypothetical: it is the shape that refused ~90 consecutive
>   deployments between 19 August and 18 October 2026 while four separate
>   file-level fixes made no difference whatsoever.
> - **"Include files outside the Root Directory in the Build Step" must be
>   on.** A pnpm workspace needs it, and `scripts/embed-sql.mjs` reads
>   `db/migrations` at the repository root. With it off the build stops and
>   says so in words — it will not ship a backend that has no migrations.
>
> Verify from outside once it deploys, which takes one request:
>
> ```bash
> curl -s https://api.jessmove.com/api/health | grep -o '"shortCommit":"[^"]*"'
> bash scripts/smoke.sh https://api.jessmove.com/api
> ```

The pieces that make it deployable, because the project spent eight weeks
without them:

- **`api/index.js`** is the only file Vercel looks for. It re-exports the
  handler from the compiled `dist/serverless.js`.
- **`src/serverless.ts`** builds the application through the same
  `configureApp` as `main.ts`, calls `app.init()` rather than `app.listen()`,
  and returns the Express request handler. Nothing on a serverless platform
  ever calls `listen`, and Vercel has no NestJS preset that would.
- **`vercel.json`** rewrites `/(.*)` to `/api`, so the whole API is one
  function rather than one per route — Nest boots the entire module graph on
  first touch, and splitting it would pay that cost per route instead of per
  instance. `req.url` keeps the original path, so the `/api` global prefix
  resolves normally.

  Do **not** replace the rewrite with a `api/[...path].js` catch-all. It
  looks tidier and it is wrong: the builder compiles that filename to
  `^/api/([^/]+)$`, one path segment, so `/api/health` works and
  `/api/body/pathways` returns 404. Half the API, silently.
- **`outputDirectory: "public"`**, with a real page in it. This is the line
  whose absence refused every deployment for eight weeks. With a build
  command and no framework, Vercel treats the project as a *static* build:
  it runs the build, looks for a static output directory, and refuses with
  `STATIC_BUILD_NO_OUT_DIR` **before building the function under `api/`**.
  Deleting either the key or the directory brings the whole outage back.

### Checking a deployment before pushing it

The platform's own build and detection pipeline runs locally, offline, with
no account and no token. This is the fastest way to find out what Vercel
will actually do, and it is the thing that ended an eight-week outage that
four commits of reasoning had not:

```bash
cd apps/backend
mkdir -p .vercel
cat > .vercel/project.json <<'JSON'
{ "projectId": "prj_local_probe", "orgId": "team_local_probe",
  "settings": { "createdAt": 0, "framework": null, "devCommand": null,
    "installCommand": null, "buildCommand": null, "outputDirectory": null,
    "rootDirectory": null, "directoryListing": false, "nodeVersion": "22.x" } }
JSON
npx vercel build --prod
```

It prints the real error with the real error code, and on success writes
`.vercel/output` — `config.json` holds the compiled routes and headers, and
`functions/api/index.func` is the artefact that would be uploaded. Run that
artefact directly to test the deployment rather than your source:

```bash
cd .vercel/output/functions/api/index.func
# serve apps/backend/api/index.js over http, then:
bash ../../../../../../scripts/smoke.sh http://localhost:4400/api
```

`vercel dev` is **not** an alternative — it starts a login flow and fails
without credentials. `vercel build` does not.

### The nudge sweep is not scheduled here, and should be

`vercel.json` schedules one cron job, the blog autopilot at `0 7 * * *`.
That is daily, so it is accepted on every plan including Hobby.

The second one is missing on purpose:

```json
    { "path": "/api/nudge/cron", "schedule": "0,30 * * * *" }
```

A cron schedule the plan does not permit makes Vercel **refuse the
deployment** rather than deploy it with the cron ignored, and Hobby permits
daily schedules only. Removing both was run as a deliberate experiment
while this project was failing every deployment — it changed nothing, so
the schedule is **not** the reason it fails. The daily one is therefore
back. The half-hourly one stays out only because it is the single piece of
this configuration that is unsafe under an unknown plan, and nothing is
lost by waiting: this endpoint is not running today either.

Put it back as soon as the plan is known. On Pro it goes in as written. On
Hobby it has to become daily, or be triggered from somewhere other than
Vercel Cron — `GET /api/nudge/cron` is an ordinary guarded endpoint and
anything holding `CRON_SECRET` can call it on any schedule.

Verify a deployment the same way the container is verified:

```bash
bash scripts/smoke.sh https://api.jessmove.com/api
```

## 4 · The backend, as a container instead

The image is a plain container, so anything that runs OCI images will do — Cloud Run,
Fly, Render, ECS, a VM with Docker.

```bash
PROJECT=your-gcp-project
REGION=europe-west2

gcloud builds submit --tag gcr.io/$PROJECT/jessmove-api --file Dockerfile.backend .

gcloud run deploy jessmove-api \
  --image gcr.io/$PROJECT/jessmove-api \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 10 \
  --cpu 1 --memory 512Mi \
  --set-env-vars "API_PREFIX=api,CORS_ORIGINS=https://jessmove.com" \
  --set-secrets "ANTHROPIC_API_KEY=anthropic-key:latest,DATABASE_URL=database-url:latest"
```

Notes that matter:

- **Cloud Run injects `PORT`.** The image honours it; do not hard-code 4000.
- **`CORS_ORIGINS` must list the site's real origin**, comma-separated. Get this wrong
  and the browser blocks every request before it leaves — the API looks broken and the
  logs show nothing.
- **AI keys are optional.** The gateway skips unconfigured providers rather than
  failing, so the API starts and serves without any of them. Only `/ai/complete`
  degrades.
- Put the database behind Cloud SQL with a private IP, or use the Cloud SQL connector.

## 5 · The frontend, to Vercel

```bash
vercel link
vercel env add NEXT_PUBLIC_API_BASE_URL production   # https://api.jessmove.com/api
vercel --prod
```

`vercel.json` sets the workspace-aware build command and the security headers.

> `NEXT_PUBLIC_*` is **inlined at build time**, not read at runtime. Changing the API
> URL means a rebuild, not a restart. Same for the Docker image — it is a build arg.

## 6 · The frontend, as a container instead

```bash
docker build -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.jessmove.com/api \
  -t jessmove-site .
docker run -p 3000:3000 jessmove-site
```

---

## Environment

| Variable | Where | Required | Notes |
|---|---|---|---|
| `PORT` | api | no | Injected by most platforms. Defaults to 4000. |
| `API_PREFIX` | api | no | Defaults to `api`. |
| `CORS_ORIGINS` | api | **yes in production** | Comma-separated site origins. |
| `DATABASE_URL` | api | for persistence | Postgres 16. |
| `ANTHROPIC_API_KEY` | api | no | Unconfigured providers are skipped. |
| `OPENAI_API_KEY` | api | no | |
| `GEMINI_API_KEY` | api | no | |
| `AI_DEFAULT_PROVIDER` | api | no | `anthropic` \| `openai` \| `gemini`. |
| `AI_FALLBACK_ORDER` | api | no | Comma-separated chain. |
| `NEXT_PUBLIC_API_BASE_URL` | site | **build time** | Inlined. Rebuild to change. |

---

## Verifying a deployment

**From a terminal:** `bash scripts/smoke.sh https://your-api/api`

**From a browser:** open `/console` on the deployed site, put the API base URL in the
box, and press *Run all checks*. It is `noindex`, and it is the fastest way to prove
CORS is right — a CORS failure surfaces there as a readable message rather than a
silent console error.

Two checks are worth watching on every deploy, because they are the ones that would
be embarrassing to get wrong:

- **The driving hold.** A request from somebody who is driving must return a hold with
  `blocks: ["driving"]`, as a success rather than an error.
- **The child case.** An assessment for a 12-year-old with `optedIntoBodyMetrics: true`
  must still return `CHILD_GROWTH` and `metrics: null`. The consent flag is not
  consulted below 18; if that ever changes, this check fails first.

## CI

`.github/workflows/ci.yml` builds, typechecks, runs all 100 tests, applies the schema
to a real Postgres and asserts every database invariant rejects its violating write,
then boots the API and runs the smoke test against it.
