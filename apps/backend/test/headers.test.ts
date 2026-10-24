import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * The header that forbade the camera on the site's own scanner.
 *
 * `Permissions-Policy: camera=()` is an empty allowlist. Not "ask the
 * member", not "same origin only" — nobody, including the site itself. On
 * jessmove.com that meant getUserMedia was refused before any permission
 * dialogue could appear, and Chrome listed no camera setting for the site
 * because the site had declared it does not use one.
 *
 * Which is exactly what was reported: "there is no camera permission on
 * the phone for this." There was not one to give. Every instruction about
 * where to find the setting was a route to a screen that could not exist,
 * because the page had already refused on the member's behalf.
 *
 * `camera=(self)` restores the ordinary behaviour: this origin may ask,
 * and the member decides. Microphone and location stay shut, since
 * nothing here uses either.
 */

const headers = (): { key: string; value: string }[] => {
  const config = JSON.parse(
    readFileSync(new URL('../../frontend/vercel.json', import.meta.url), 'utf8'),
  ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  return config.headers.flatMap((rule) => rule.headers);
};

const valueOf = (key: string): string =>
  headers().find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? '';

test('the site does not forbid its own camera', () => {
  const policy = valueOf('Permissions-Policy');
  assert.ok(policy, 'a Permissions-Policy is still sent');
  assert.match(policy, /camera=\(self\)/, `camera is refused outright by: ${policy}`);
  assert.ok(!/camera=\(\)/.test(policy), 'an empty allowlist blocks the scanner before it starts');
});

test('nothing else is opened up in the process', () => {
  const policy = valueOf('Permissions-Policy');
  assert.match(policy, /microphone=\(\)/, 'nothing here records audio');
  assert.match(policy, /geolocation=\(\)/, 'nothing here needs to know where you are');
});

test('the headers that matter for a public launch are all still set', () => {
  for (const [key, expected] of [
    ['X-Content-Type-Options', /nosniff/],
    ['X-Frame-Options', /DENY/],
    ['Referrer-Policy', /strict-origin-when-cross-origin/],
    ['Strict-Transport-Security', /max-age=\d{7,}/],
  ] as const) {
    assert.match(valueOf(key), expected, `${key} is missing or weakened`);
  }
});

/**
 * The CSP, which is in `next.config.mjs` and not in the file above.
 *
 * Deliberately so: a header the platform adds exists on a deployment and
 * nowhere else, which is fine for HSTS and wrong for a policy whose
 * failure mode is silently refusing something a page needs. In the Next
 * config it is served by `next start` too, so `pnpm check:csp` can load
 * every route in a real browser and watch for refusals — which is the
 * only way to know a CSP is correct rather than merely present.
 *
 * This test is the cheap half: that it exists, that the directives which
 * carry the actual value are there, and that the two weakest ones have
 * not spread. `'unsafe-inline'` on `script-src` is accepted and
 * documented — Next injects inline hydration scripts, and nonces need
 * middleware — so the value here is `connect-src` bounding where an
 * injected script could send anything, plus `object-src`, `base-uri` and
 * `form-action`.
 */
const cspSource = (): string =>
  readFileSync(new URL('../../frontend/next.config.mjs', import.meta.url), 'utf8');

test('the site sends a Content-Security-Policy', () => {
  const source = cspSource();
  assert.match(source, /Content-Security-Policy/, 'no CSP is configured at all');

  for (const directive of [
    "default-src 'self'",
    'script-src',
    'connect-src',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
  ]) {
    assert.ok(source.includes(directive), `the CSP no longer sets ${directive}`);
  }
});

test('the CSP names the API it actually calls, rather than a literal host', () => {
  /*
   * The hosts come from `NEXT_PUBLIC_API_BASE_URL`, the variable
   * `apiBase()` reads. Hardcoding a host instead would let the policy
   * drift from the API the bundle calls, and the result is every
   * signed-in screen broken by a console error nobody outside the
   * browser ever sees.
   */
  const source = cspSource();
  assert.match(source, /NEXT_PUBLIC_API_BASE_URL/, 'the CSP no longer derives the API origin');
  assert.match(source, /connect-src[^`]*\$\{apiOrigin\}/, 'connect-src must name the derived origin');
});

test("'unsafe-eval' never reaches a production policy", () => {
  // HMR needs it; a deployment must not have it. The guard is the
  // `dev` branch, so what is asserted is that it stays behind one.
  const source = cspSource();
  const occurrences = [...source.matchAll(/unsafe-eval/g)];
  assert.equal(occurrences.length, 1, 'unsafe-eval appears more than once — check it is still gated');
  assert.match(
    source,
    /dev \? " 'unsafe-eval'" : ''/,
    "'unsafe-eval' must be conditional on development",
  );
});

test('the two measurement hosts are the only third parties the CSP permits', () => {
  /*
   * No vendor beyond Vercel and Firebase, with Meta Pixel and Google Tag
   * added deliberately. A third host appearing in this policy is a third
   * vendor, which is a new decision and not a precedent these two set —
   * so it fails here and gets made on purpose.
   */
  const source = cspSource();
  const csp = source.slice(source.indexOf('const csp = ['), source.indexOf('].join('));
  const hosts = [...new Set([...csp.matchAll(/https:\/\/([a-z0-9.*-]+)/g)].map((m) => m[1]))].sort();

  assert.deepEqual(hosts, [
    '*.public.blob.vercel-storage.com',
    'connect.facebook.net',
    'www.facebook.com',
    'www.google-analytics.com',
    'www.googletagmanager.com',
  ]);
});
