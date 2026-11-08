/**
 * The payload sweep. Attacks every write route with bodies no client
 * would send, and reports what got through.
 *
 * This existed during the launch audit as a throwaway script outside the
 * repository. It found D-006 — a string where a shopping trolley belonged,
 * answered with a confident "200 items" — and then vanished with the
 * machine it ran on. A check that found a real defect and cannot be run
 * again is not a check; it is an anecdote. So it lives here now.
 *
 * Two things it does that the version in the scratchpad did not:
 *
 * 1. It reads the routes off the controllers rather than carrying a list.
 *    The original swept the fifty endpoints somebody had typed into it,
 *    which is why it never touched POST /movements or PUT /state/:key —
 *    both of which had exactly D-006's defect the whole time. A sweep
 *    with a hand-written target list goes stale the first time somebody
 *    adds a route, and goes stale silently.
 *
 * 2. It states what it covered before it states what it found. A sweep
 *    that reports "0 failures" without saying how many routes and
 *    payloads it sent is indistinguishable from a sweep that sent none.
 *
 * What counts as a failure:
 *   - any 5xx. A malformed body is the client's fault; a stack trace is
 *     ours, and an unhandled exception is a denial-of-service shape.
 *   - a 2xx on a body that is not of the declared type. That is D-006.
 *   - a response that echoes the payload back, which is a reflection
 *     surface whatever the status code says.
 *
 * Run against a local instance only. Several payloads are abuse attempts.
 *
 *   DATABASE_URL=... AUTH_ENFORCE=true node apps/backend/dist/main.js &
 *   node scripts/fuzz-api.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.API ?? 'http://localhost:4000/api';
const SRC = join(import.meta.dirname, '..', 'apps', 'backend', 'src');

let pass = 0;
let fail = 0;
const failures = [];

function bad(what, detail) {
  fail += 1;
  failures.push(`${what} — ${detail}`);
  console.log(`  FAIL  ${what} — ${detail}`);
}

/* ------------------------------------------------------------------ *
 * Route discovery
 * ------------------------------------------------------------------ */

function controllerFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.controller.ts')) out.push(path);
    }
  };
  walk(SRC);
  return out;
}

/**
 * Every route that takes a body, as `{ method, path }`.
 *
 * `@Param(':id')` segments are filled with a value that is syntactically
 * fine and refers to nothing, so a 404 is a legitimate answer and a 500
 * is not.
 */
function writeRoutes() {
  const routes = [];
  for (const file of controllerFiles()) {
    const source = readFileSync(file, 'utf8');
    const prefix = /@Controller\(['"]([^'"]*)['"]\)/.exec(source)?.[1] ?? '';

    // Split on each HTTP-verb decorator so a handler's own text, and only
    // its own text, is searched for an @Body().
    const parts = source.split(/@(Post|Put|Patch|Delete)\(/);
    for (let i = 1; i < parts.length; i += 2) {
      const method = parts[i].toUpperCase();
      const rest = parts[i + 1] ?? '';
      const segment = /^['"]([^'"]*)['"]\)/.exec(rest)?.[1] ?? '';
      // The handler body ends at the first dedented closing brace.
      const handler = rest.slice(0, rest.indexOf('\n  }') + 1);
      if (!/@Body\(\)/.test(handler)) continue;

      const path =
        '/' +
        [prefix, segment]
          .filter(Boolean)
          .join('/')
          .replace(/^\/+/, '')
          .split('/')
          .map((s) => (s.startsWith(':') ? 'sweep-nonexistent' : s))
          .join('/');
      routes.push({ method, path, file: file.slice(SRC.length + 1) });
    }
  }
  return routes;
}

/* ------------------------------------------------------------------ *
 * Payloads
 * ------------------------------------------------------------------ */

/**
 * Bodies chosen because each one has caused a real defect somewhere, not
 * because they are exotic. The string-where-an-array-belongs case is
 * D-006 itself: a string is iterable, so anything that walks an array
 * walks its characters instead.
 */
/**
 * The length of the string sent where a collection belongs.
 *
 * 137 rather than 200: a response that reports "200 items" could just
 * about be a coincidence against a page size or a cap, and 200 is also
 * the status code, so it appears in logs and envelopes for innocent
 * reasons. 137 is used nowhere in this platform as a limit, a price, a
 * duration or a page size, so a count of 137 coming back means one thing.
 */
const STRING_AS_COLLECTION_LENGTH = 137;

const PAYLOADS = [
  ['a bare string', '"AAAAAAAA"'],
  ['a 200-character string', JSON.stringify('A'.repeat(200))],
  ['a number', '42'],
  ['a boolean', 'true'],
  ['null', 'null'],
  ['an array where an object belongs', '[1,2,3]'],
  ['an empty object', '{}'],
  ['an empty array', '[]'],
  // Every field name the platform uses for something consequential, in a
  // body that has no business carrying it.
  ['an injected identity', '{"userId":"attacker","uid":"attacker","role":"admin"}'],
  ['an injected entitlement', '{"plan":"premium_annual","acus":1000000,"isAdmin":true}'],
  ['an override flag', '{"force_publish":true,"skipReview":true,"bypass":true}'],
  /*
   * D-006's exact shape, and the one payload in this file that is checked
   * by what the response says rather than by its status code.
   *
   * The first version of this sweep listed this payload and did not look
   * at the answer. With the basket DTO reverted it returned HTTP 201 and
   * `{"products":200}` — the defect, reproduced perfectly — and the sweep
   * counted it as handled safely. It failed the run on a different
   * symptom, which is luck. The string length below is deliberately an
   * odd number nothing in this platform uses as a limit, so a count that
   * equals it in a response means a string was walked as a collection.
   */
  ['a string where an array belongs', `{"products":"${'A'.repeat(STRING_AS_COLLECTION_LENGTH)}","variants":"${'A'.repeat(STRING_AS_COLLECTION_LENGTH)}","items":"${'A'.repeat(STRING_AS_COLLECTION_LENGTH)}","instructions":"${'A'.repeat(STRING_AS_COLLECTION_LENGTH)}"}`],
  ['an object where a string belongs', '{"email":{},"name":{},"slug":{},"title":{}}'],
  // Shapes that break naive parsers and naive serialisers.
  ['a deeply nested object', JSON.stringify(deepObject(60))],
  ['a prototype-pollution attempt', '{"__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}}}'],
  ['a reflected script tag', '{"name":"<script>alert(1)</script>","value":"<script>alert(1)</script>"}'],
  ['a SQL fragment', '{"name":"\'; DROP TABLE app_users; --","key":"\'; DROP TABLE app_users; --"}'],
  ['a path traversal', '{"name":"../../etc/passwd","key":"../../etc/passwd"}'],
  ['a NUL byte', '{"name":"a\\u0000b","value":"a\\u0000b"}'],
  ['a bidi override', '{"name":"a\\u202eb","value":"a\\u202eb"}'],
  ['a very large number', '{"amount":1e309,"acus":1e309,"durationSeconds":1e309}'],
  ['a negative amount', '{"amount":-100000,"acus":-100000,"amountGbp":-100000}'],
  ['NaN as a string', '{"amount":"NaN","durationSeconds":"NaN"}'],
  ['malformed JSON', '{"unclosed":'],
];

function deepObject(depth) {
  let o = { end: true };
  for (let i = 0; i < depth; i += 1) o = { nested: o };
  return o;
}

/** A reflection is a payload fragment appearing in the response body. */
const REFLECTION_MARKERS = [
  '<script>alert(1)</script>',
  'DROP TABLE app_users',
  '../../etc/passwd',
];

/* ------------------------------------------------------------------ *
 * The sweep
 * ------------------------------------------------------------------ */

const routes = writeRoutes();

console.log('\nPAYLOAD SWEEP');
console.log(`  ${routes.length} write routes discovered from the controllers`);
console.log(`  ${PAYLOADS.length} payloads each`);
console.log(`  ${routes.length * PAYLOADS.length} requests\n`);

/*
 * Asserted before anything else, because the whole point of discovering
 * the routes is that the count cannot quietly fall to zero. The audit
 * found five separate controls passing while measuring nothing.
 */
if (routes.length < 40) {
  console.log(
    `  FAIL  route discovery found only ${routes.length} write routes. The ` +
      'sweep is measuring almost nothing — the decorator spelling or the ' +
      'controller layout has changed and this script must be fixed, not ' +
      'trusted.',
  );
  process.exit(1);
}

const byOutcome = new Map();
/*
 * Routes that accepted a sweep payload. Not a failure by itself — a route
 * whose every field is optional is entitled to accept `{}` — but the
 * reader must be told which ones, because "0 got through" alongside a
 * silent 201 is how D-006 would read if the payload that found it were
 * ever dropped from the list.
 */
const accepted = [];

for (const route of routes) {
  for (const [label, body] of PAYLOADS) {
    let res;
    let text = '';
    try {
      res = await fetch(`${API}${route.path}`, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        body,
      });
      text = await res.text();
    } catch (error) {
      bad(`${route.method} ${route.path}`, `${label}: request failed — ${error.message}`);
      continue;
    }

    const code = res.status;
    byOutcome.set(code, (byOutcome.get(code) ?? 0) + 1);

    if (code >= 500) {
      bad(
        `${route.method} ${route.path}`,
        `${label}: HTTP ${code} — a malformed body must not reach an ` +
          `unhandled exception (${route.file})`,
      );
      continue;
    }

    // A 2xx on a body of the wrong primitive type is D-006's signature.
    const wrongType = ['a bare string', 'a 200-character string', 'a number', 'a boolean', 'an array where an object belongs'];
    if (code < 300 && wrongType.includes(label)) {
      bad(
        `${route.method} ${route.path}`,
        `${label}: HTTP ${code} — the body is not of the declared type and ` +
          `was accepted (${route.file})`,
      );
      continue;
    }

    /*
     * D-006 itself: a string walked as a collection. Checked against the
     * answer, not the status code, because the defect answered 201 with a
     * confident wrong number and nothing about the status said so.
     */
    if (code < 300 && label === 'a string where an array belongs') {
      const counted = new RegExp(`(^|[^\\d.])${STRING_AS_COLLECTION_LENGTH}([^\\d.]|$)`).test(text);
      if (counted) {
        bad(
          `${route.method} ${route.path}`,
          `${label}: HTTP ${code} — the response counts ` +
            `${STRING_AS_COLLECTION_LENGTH} of something, which is the length ` +
            'of the string sent. A string is iterable, so whatever walks ' +
            `that field walked its characters (${route.file})`,
        );
        continue;
      }
    }

    const reflected = REFLECTION_MARKERS.find((m) => text.includes(m));
    if (reflected) {
      bad(
        `${route.method} ${route.path}`,
        `${label}: HTTP ${code} — the response echoes "${reflected}" back`,
      );
      continue;
    }

    if (code < 300) accepted.push(`${route.method} ${route.path}  ${label}  HTTP ${code}`);
    pass += 1;
  }
}

console.log('  Status codes returned:');
for (const [code, count] of [...byOutcome].sort((a, b) => a[0] - b[0])) {
  console.log(`    ${code}  ${String(count).padStart(5)}`);
}

if (accepted.length) {
  console.log('\n  Accepted (each one is a route whose fields are all optional):');
  for (const a of accepted) console.log(`    ${a}`);
}

/*
 * Said plainly, because a sweep that overstates its reach is worse than
 * one that is narrow. A 401 means the guard refused the request before
 * the ValidationPipe ever saw the body, so that payload tested the
 * account boundary and not the validation behind it. Running this
 * authenticated, against a seeded member and a seeded admin, would push
 * those requests through to the DTOs. It does not do that yet.
 */
const guarded = byOutcome.get(401) ?? 0;
const total = routes.length * PAYLOADS.length;
console.log(
  `\n  ${guarded} of ${total} payloads were refused by a guard before the ` +
    'ValidationPipe saw them. Those tested the account boundary, not the ' +
    'body validation behind it — reaching that needs a seeded session, ' +
    'which this sweep does not yet create.',
);

console.log(
  `\n  ${pass} payloads refused or handled safely, ${fail} got through\n`,
);
if (fail) {
  console.log('  Failures:');
  for (const f of failures) console.log(`    ${f}`);
  process.exit(1);
}
