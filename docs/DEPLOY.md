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

### How the preset runs it, and the one line that has to be right

The project uses Vercel's **backend framework preset** for Nest. It does not
want a serverless handler and it does not want a static directory: it
searches the **output directory** for a server entrypoint and runs it,
proxying to the port the server binds.

It searches, in order: `src/main.*`, `src/app.*`, `src/index.*`,
`src/server.*`, then `main.*`, `app.*`, `index.*`, `server.*`.

`nest build` emits `dist/main.js`, so:

```json
  "outputDirectory": "dist"
```

**That single line is the whole of the 19 August – 18 October 2026 outage.**
Point it anywhere without one of those filenames in it and every deployment
is refused, identically, regardless of the code:

```
Error: [BUILD_FAILED] No entrypoint found in output directory: "public"
```

Three things follow from the preset, each of which cost a commit to learn:

- **There must be no `api/` directory.** Its presence alone makes the
  builder emit `{"src": "^/api(/.*)?$", "status": 404}` *ahead of* the
  catch-all that reaches the server — a 404 over the entire API, since every
  route sits under the `api` global prefix. It also builds a second 22 MB
  copy of the application. The build goes green and the deployment serves
  nothing, which is the most expensive failure mode on offer.
- **There must be no `rewrites`.** The build log says why itself: *"Internal
  rewrites in backend framework projects now route requests using the
  rewritten destination path."* A catch-all rewrite to `/api` delivers every
  request to the literal path `/api`, which this application 404s.
- **`main.ts` must keep listening on `process.env.PORT`.** The preset starts
  it as a server. There is no serverless handler in this project and there
  should not be one: `main.ts` is the only entry point.

> **Two project settings** decide whether any of the above is even read, and
> neither lives in a file. Settings → Build and Deployment:
>
> - **Framework Preset** — the Nest backend preset, which is what the
>   behaviour above describes. "Other" is a different contract entirely
>   (static output plus functions under `api/`), and the two configurations
>   are mutually exclusive.
> - **Root Directory `apps/backend`**, with **"Include files outside the
>   Root Directory"** on. A pnpm workspace needs the latter, and
>   `scripts/embed-sql.mjs` reads `db/migrations` at the repository root —
>   with it off the build stops and says which checkbox to change rather
>   than shipping a backend with no migrations.
>
> Verify from outside once it deploys, which takes one request:
>
> ```bash
> curl -s https://api.jessmove.com/api/health | grep -o '"shortCommit":"[^"]*"'
> bash scripts/smoke.sh https://api.jessmove.com/api
> ```

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
  "settings": { "createdAt": 0, "framework": "nestjs", "devCommand": null,
    "installCommand": null, "buildCommand": null, "outputDirectory": null,
    "rootDirectory": null, "directoryListing": false, "nodeVersion": "22.x" } }
JSON
npx vercel build --prod
```

**`framework` in that stub must match the project's Framework Preset**, or
the probe answers a question nobody asked. Set to `null` it exercises the
static-plus-functions contract and reports `STATIC_BUILD_NO_OUT_DIR`; set to
`"nestjs"` it exercises the one this project actually uses and reports the
missing entrypoint. Those are different outages, and a probe on the wrong
one is worse than no probe, because it is confidently wrong.

On success it writes `.vercel/output`: `config.json` holds the compiled
routes, and `functions/index.func` is the artefact that would be uploaded.
Run that artefact rather than your source — it is the bytes the platform
gets:

```bash
cd .vercel/output/functions/index.func
PORT=4500 DATABASE_URL=... node apps/backend/dist/main.js &
bash /path/to/repo/scripts/smoke.sh http://localhost:4500/api
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

## After a Node security release

October 2026: Node fixed several high-severity faults, the worst allowing
code execution on the server. Fixed releases are **22.23.4**, **24.22.1**
and **26.12.1**. **Node 20 and earlier are end of life and will not be
fixed.** `engines.node` is `>=22.23.4`, so a tool that reads it refuses the
unsupported lines.

Where this platform runs, and who patches it:

| Surface | Runtime | Who updates it |
|---|---|---|
| `jessie-move`, `jessie-backend` on Vercel | the project's Node version setting | Vercel ships the patch; confirm the major is 22, 24 or 26 in project settings |
| `Dockerfile.backend` / `Dockerfile.frontend` | `node:22-alpine` | you, by rebuilding — see below |
| GitHub Actions | `node-version: 22` in `ci.yml` | resolves to the newest 22.x on every run |

**A built image never updates itself.** The tag floats, the image does not:
whatever 22.x it was built against is what it carries for ever. So after a
release, rebuild rather than restart:

```bash
docker compose pull
docker compose build --pull
docker compose up -d
```

`--pull` is the part that matters. Without it the build reuses the cached
base layer and produces a new image on the old runtime.

**Checking what is actually running.** `/api/health` reports the runtime
under `checks.runtime` — but deliberately without the exact version. A
precise patch number on an unauthenticated endpoint is what somebody
probing for a code-execution fault wants, so the endpoint publishes the
verdict and the deployment log carries the number:

```bash
curl -s https://api.jessmove.com/api/health | python3 -m json.tool | grep -A 2 runtime
```

`ok` means the line is on or above its patched release. `degraded` means
it is not, or the line is end of life, and the boot log says which version
and what to do about it.

## Verifying a deployment

**From a terminal:** `bash scripts/smoke.sh https://your-api/api`

**From a browser:** open `/console` on the deployed site, put the API base URL in the
box, and press *Run all checks*. It is `noindex`, and it is the fastest way to prove
CORS is right — a CORS failure surfaces there as a readable message rather than a
silent console error.

**What still needs an environment variable**, in one command. Every module
reports its own configuration and names the variable that switches it on, so
there is nothing to look up — a fresh deployment answers this itself:

```bash
API=https://api.jessmove.com/api
for p in auth/status push/status mail/status stripe/status \
         accounts/storage/status db/status; do
  echo "== $p"; curl -s "$API/$p" | python3 -m json.tool | head -8
done
```

`auth/status` is the one to read first. Without `AUTH_SECRET` it reports
`configured: false`, and registration and login are unavailable — which from
the outside looks exactly like nobody signing up, with nothing in any log to
say otherwise.

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
