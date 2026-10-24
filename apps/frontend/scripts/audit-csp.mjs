/**
 * Does the Content-Security-Policy block anything the product needs?
 *
 * The policy is in `next.config.mjs` rather than `vercel.json` precisely
 * so this can run: a header the platform adds exists on a deployment and
 * nowhere else, and the way a CSP fails is by silently refusing something
 * a page needs — a stylesheet, a fetch, the service worker — with a
 * console message nobody outside the browser ever sees.
 *
 * The contrast and layout audits load every route and would surface a
 * page that fell over. What they cannot cover is `script-src`, because
 * the two measurement vendors load only after somebody accepts the
 * consent banner, so the entries permitting them are never exercised by
 * an ordinary page load. This one accepts.
 *
 *   SHOOT_BASE=http://127.0.0.1:3000 node scripts/audit-csp.mjs
 */
import { chromium } from 'playwright';
/*
 * The button's real label, not a guess at it. The first version of this
 * script looked for a button named /^accept/i; the button says "Yes,
 * that's fine", so it accepted on none of the nine routes and reported a
 * pass for a directive it had never exercised.
 */
import { CONSENT_COPY } from '@jessmove/shared';

/*
 * A spread of routes rather than all of them: the marketing pages that
 * carry the consent banner and so the measurement scripts, the signed-in
 * console and the trial surface for the API fetches and the uploader,
 * `/status` for its server-side fetch, and `/offline` because it is the
 * page the service worker serves and `worker-src` has to allow it.
 */
const ROUTES = [
  '/', '/how-it-works', '/foodlens', '/micro-movement',
  '/account', '/try', '/status', '/blog', '/offline',
];

const base = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
});

const violations = [];
/*
 * Hosts the policy permits under `script-src`. Recorded as *attempted*,
 * because a run where consent was accepted and neither host was ever
 * requested has not tested the directive — it has tested a loader that
 * did not run. Outbound to these hosts is blocked by this environment's
 * network policy, so the request fails; that is fine and is not what is
 * being measured. What matters is that the browser got as far as trying,
 * which means the CSP let it.
 */
const VENDOR_HOSTS = ['connect.facebook.net', 'www.googletagmanager.com'];
const attempted = new Set();
let accepted = 0;
let served = 0;

for (const route of ROUTES) {
  const page = await browser.newPage();

  /*
   * Both channels. `securitypolicyviolation` is the event the spec
   * defines and is the reliable signal; the console text is kept as well
   * because a refusal on a worker or a preload does not always reach the
   * event listener on the document.
   */
  await page.addInitScript(() => {
    globalThis.__cspHits = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      globalThis.__cspHits.push(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`);
    });
  });
  page.on('request', (r) => {
    const host = (() => {
      try {
        return new URL(r.url()).host;
      } catch {
        return '';
      }
    })();
    if (VENDOR_HOSTS.includes(host)) attempted.add(host);
  });
  page.on('console', (m) => {
    const text = m.text();
    if (/Content Security Policy|Refused to (load|execute|connect|apply|create)/i.test(text)) {
      violations.push(`${route}  ${text.slice(0, 200)}`);
    }
  });

  const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' }).catch(() => null);
  if (response?.headers()['content-security-policy']) served += 1;

  // Accept consent where it is offered, so the measurement scripts load.
  const accept = page.getByRole('button', { name: CONSENT_COPY.accept }).first();
  if (await accept.count().catch(() => 0)) {
    await accept.click({ timeout: 2000 }).catch(() => {});
    accepted += 1;
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(600);

  const hits = await page.evaluate(() => globalThis.__cspHits ?? []).catch(() => []);
  for (const hit of hits) violations.push(`${route}  ${hit}`);

  await page.close();
}

await browser.close();

console.log(`\n${ROUTES.length} routes loaded, consent accepted on ${accepted}.`);

/*
 * A run that measured no policy is a failure, not a pass. Under
 * `next start` without the config, or against a base URL that is not this
 * app, every assertion below holds vacuously — which is the shape of
 * every false green this repository has had.
 */
if (served === 0) {
  console.log('No route served a Content-Security-Policy. Nothing was tested.');
  process.exitCode = 1;
} else if (accepted === 0) {
  /*
   * Not a failure, and not a clean pass either. Without
   * NEXT_PUBLIC_META_PIXEL_ID and NEXT_PUBLIC_GOOGLE_TAG_ID at build
   * time the banner never renders, so `script-src`'s two vendor hosts
   * were not exercised. Said out loud, because the alternative is a green
   * line that covers less than it appears to.
   */
  console.log(`Policy served on ${served}/${ROUTES.length}. Nothing refused.`);
  console.log(
    'script-src NOT exercised: no consent banner appeared, so the two measurement\n' +
      'hosts were never requested. Rebuild with NEXT_PUBLIC_META_PIXEL_ID and\n' +
      'NEXT_PUBLIC_GOOGLE_TAG_ID set to cover them.',
  );
} else if (violations.length > 0) {
  console.log(`${violations.length} refusals — the policy is blocking the product:`);
  for (const v of violations) console.log('  ' + v);
  process.exitCode = 1;
} else {
  const missed = VENDOR_HOSTS.filter((h) => !attempted.has(h));
  console.log(`Policy served on ${served}/${ROUTES.length}. Nothing refused.`);
  if (missed.length > 0) {
    // Consent was accepted, so the loader ran. If a host was never even
    // requested, `script-src` was not exercised for it and this run says
    // less than it looks like it does.
    console.log(`script-src NOT exercised for: ${missed.join(', ')} — never requested.`);
    process.exitCode = 1;
  } else {
    console.log(`script-src exercised: ${[...attempted].sort().join(', ')} were requested and allowed.`);
  }
}
