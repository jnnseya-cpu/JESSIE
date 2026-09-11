/**
 * Features that exist and cannot be reached.
 *
 * `find-unwired.mjs` asks whether an export is imported. This asks a
 * different and harder question: whether a member can get to the thing at
 * all. The two failures look identical from inside the code and nothing
 * in the toolchain reports either.
 *
 * Three real ones shipped or nearly shipped in this repository, and each
 * compiled, typechecked and passed every test:
 *
 *   the native bridge   `installHost()` was exported and called from
 *                       nowhere, and could not have been called anywhere,
 *                       because `server.url` means the shell's own bundle
 *                       is never loaded. Health, calendar, motion and push
 *                       were all dead in the installed app.
 *   calendar access     `readCalendar` returned nothing without a grant
 *                       and no code path ever requested one, so the
 *                       capability could never become true and the button
 *                       offering it was never rendered.
 *   push in the app     the account panel checked for `PushManager`, which
 *                       a Capacitor webview does not have, and reported
 *                       notifications as unsupported.
 *
 * So: every route the API exposes, against every call the site actually
 * makes. An endpoint with no caller is not automatically a defect — cron
 * targets and admin tools are reached by a scheduler or a console — so the
 * output is grouped by what the route is guarded with, and the judgement
 * is left to a person. The list is the point; the verdict is not.
 *
 *   node scripts/find-unreachable.mjs          # human
 *   node scripts/find-unreachable.mjs --json   # machine
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const asJson = process.argv.includes('--json');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ── what the API exposes ──────────────────────────────────────────── */

const METHODS = 'Get|Post|Put|Patch|Delete';
const routes = [];

for (const file of walk(join(ROOT, 'apps/backend/src')).filter((f) => f.endsWith('.controller.ts'))) {
  const text = readFileSync(file, 'utf8');
  const base = text.match(/@Controller\(\s*['"`]([^'"`]*)['"`]?\s*\)/)?.[1] ?? '';

  // Each decorator, with whatever guard decorators precede it in the
  // same block. Guards sit above the method decorator, so the slice
  // between the previous route and this one carries them.
  const re = new RegExp(`@(${METHODS})\\(\\s*(?:['"\`]([^'"\`]*)['"\`])?\\s*\\)`, 'g');
  let previousEnd = 0;
  for (const m of text.matchAll(re)) {
    const preceding = text.slice(previousEnd, m.index);
    previousEnd = m.index + m[0].length;
    const path = [base, m[2] ?? ''].filter(Boolean).join('/');
    routes.push({
      method: m[1].toUpperCase(),
      path: `/${path}`,
      guard: /@AdminOnly\(\)/.test(preceding)
        ? 'admin'
        : /@SelfOnly\(/.test(preceding)
          ? 'self'
          : /assertScheduler/.test(text.slice(m.index, m.index + 400))
            ? 'cron'
            : 'open',
      file: file.replace(ROOT, ''),
    });
  }
}

/* ── what the site calls ───────────────────────────────────────────── */

/** `/blog/posts/${slug}` and `/blog/posts/:slug` both become `blog/posts/*`. */
const shape = (path) =>
  path
    .replace(/\?.*$/, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') || seg.includes('${') ? '*' : seg))
    .join('/');

/*
 * Any literal path whose first segment is a real controller base.
 *
 * Matching on helper names does not hold: this looked for `apiBase()` and
 * `api('…')`, and the moment a second wrapper appeared — `goToStripe`,
 * which posts to three of these routes — it reported all three as
 * unreachable on a page that had just been built to reach them. The
 * helper is not the signal. A string starting `/stripe/` in the frontend
 * is, and the bases come from the backend scan rather than a list here,
 * so a new controller is covered without anybody remembering.
 */
const bases = new Set(routes.map((r) => r.path.split('/').filter(Boolean)[0]).filter(Boolean));

const called = new Set();
for (const file of walk(join(ROOT, 'apps/frontend/app')).filter((f) => /\.tsx?$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/apiBase\(\)\}([^`'"]*)/g)) called.add(shape(m[1]));
  for (const m of text.matchAll(/[`'"](\/[A-Za-z0-9_${}().\/:-]*)[`'"]/g)) {
    const path = m[1];
    const first = path.split('/').filter(Boolean)[0];
    if (first && bases.has(first)) called.add(shape(path));
  }
}

/* ── the diff ──────────────────────────────────────────────────────── */

/*
 * Segment-wise, and wildcards match in both directions.
 *
 * The first version compared shapes as strings and reported `/auth/login`
 * as unreachable — on a site that plainly logs people in. The call is
 * `api(`/auth/${mode}`)` with mode being login, register or forgot, so
 * the wildcard was on the *client* side and an exact match could never
 * see it. A reachability audit that cries wolf is worse than none,
 * because the second false positive is when somebody stops reading it.
 */
const matches = (route, call) => {
  const a = route.split('/').filter(Boolean);
  const b = call.split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === '*' || b[i] === '*' || seg === b[i]);
};

/*
 * The third category, and without it this report is mostly noise.
 *
 * `/developers` publishes a list of endpoints as a product — the page
 * argues that a claim you can call is worth more than a claim you can
 * read. Those routes are reachable by definition: a third party is the
 * intended caller, and the site not calling them is the design rather
 * than a defect. Read from the page itself so the two cannot drift.
 */
const documented = new Set();
try {
  const dev = readFileSync(join(ROOT, 'apps/frontend/app/developers/page.tsx'), 'utf8');
  for (const m of dev.matchAll(/path:\s*'([^']+)'/g)) documented.add(shape(m[1]));
} catch {
  /* the page is allowed not to exist */
}

const callList = [...called];
const unreachable = routes.filter(
  (r) =>
    !callList.some((c) => matches(shape(r.path), c)) &&
    ![...documented].some((d) => matches(shape(r.path), d)),
);
const byGuard = { open: [], self: [], admin: [], cron: [] };
for (const r of unreachable) byGuard[r.guard].push(r);

if (asJson) {
  console.log(JSON.stringify({ total: routes.length, unreachable, byGuard }, null, 2));
} else {
  console.log(
    `${routes.length} routes. ${routes.length - unreachable.length} are called by the site or ` +
      `published on /developers; ${unreachable.length} are neither.\n`,
  );
  const label = {
    open: 'No guard and no caller — either dead, or reachable by anybody and used by nobody',
    self: 'Member-facing with no caller — a feature a member cannot reach',
    admin: 'Admin-only with no caller — expected if the console is elsewhere',
    cron: 'Scheduler targets — reached by the platform, not the site',
  };
  for (const guard of ['self', 'open', 'admin', 'cron']) {
    const rows = byGuard[guard];
    if (rows.length === 0) continue;
    console.log(`── ${label[guard]} (${rows.length})`);
    for (const r of rows) console.log(`   ${r.method.padEnd(6)} ${r.path.padEnd(46)} ${r.file}`);
    console.log();
  }
}

process.exitCode = 0;
