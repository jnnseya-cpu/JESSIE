# Deploying MOVEQUEST

Three things ship: **shared** (and the two domain packages) as build inputs,
**backend** as a container, **frontend** as a Next.js app. The packages are not
published to a registry — they are workspace dependencies compiled into both apps.

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
| Postgres | `postgres://movequest:movequest@localhost:5432/movequest` |

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

## 3 · The backend, to Google Cloud Run

The image is a plain container, so anything that runs OCI images will do — Cloud Run,
Fly, Render, ECS, a VM with Docker.

```bash
PROJECT=your-gcp-project
REGION=europe-west2

gcloud builds submit --tag gcr.io/$PROJECT/movequest-api --file Dockerfile.backend .

gcloud run deploy movequest-api \
  --image gcr.io/$PROJECT/movequest-api \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 10 \
  --cpu 1 --memory 512Mi \
  --set-env-vars "API_PREFIX=api,CORS_ORIGINS=https://movequest.ai" \
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

## 4 · The frontend, to Vercel

```bash
vercel link
vercel env add NEXT_PUBLIC_API_BASE_URL production   # https://api.movequest.ai/api
vercel --prod
```

`vercel.json` sets the workspace-aware build command and the security headers.

> `NEXT_PUBLIC_*` is **inlined at build time**, not read at runtime. Changing the API
> URL means a rebuild, not a restart. Same for the Docker image — it is a build arg.

## 5 · The frontend, as a container instead

```bash
docker build -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.movequest.ai/api \
  -t movequest-site .
docker run -p 3000:3000 movequest-site
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
