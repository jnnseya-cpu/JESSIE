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
