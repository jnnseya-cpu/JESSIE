/**
 * The live shelf scanner, driven in a real browser with a fake camera.
 *
 * It exists because the headline feature of the scanner was broken in
 * production and nothing anywhere said so. The camera opened, the
 * permission was granted, the stage rendered, and the picture went
 * nowhere: a black rectangle with an orange reticle over it.
 *
 * The cause was four lines of ordinary-looking React. The <video> is
 * rendered only while `live` is true, and the stream was assigned on the
 * line after `setLive(true)` — before the render that creates the
 * element. `videoRef.current` was null, the assignment sat inside an
 * `if` that silently did nothing, and the element mounted with no
 * stream. No error, no console warning, no failed request. The only
 * symptom was a black box on somebody's phone.
 *
 * No unit test reaches this. It needs a browser, a camera and a mounted
 * component, so it is a browser check: open the scanner, start the live
 * preview, and insist the video is actually carrying pictures —
 * `srcObject` attached, a non-zero intrinsic size, and not paused. A
 * video element that exists proves nothing, which is the whole lesson.
 *
 *   node apps/backend/dist/main.js &            # with AUTH_SECRET set
 *   pnpm --filter @jessmove/frontend exec next start -p 3000 &
 *   node scripts/verify-scanner.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const API = process.env.API ?? 'http://localhost:4000/api';
const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3000';
const email = `scan.${Date.now()}@example.test`;
const password = 'Str0ng-Passphrase-2026';

const j = async (r) => JSON.parse(await r.text());
const ch = await j(await fetch(`${API}/auth/challenge`));
await new Promise((r) => setTimeout(r, 3500));
const reg = await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, displayName: 'Scanner test', age: 34, challenge: ch.data.token }),
});
const cookie = (/jm_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '') ?? [])[1];
if (!cookie) {
  const body = await reg.text();
  /*
   * The door policy counts attempts per connection, so running this
   * repeatedly trips it. That is the platform's own abuse control doing
   * its job, not a finding about the scanner — reported as not-run with
   * the reason, never as a pass and never as a product failure.
   */
  if (reg.status === 429) {
    console.log(
      '\n  NOT RUN  The registration door is rate-limiting this connection, which\n' +
        '           is its abuse control working. Wait a few minutes and run again.\n',
    );
    process.exit(2);
  }
  console.log('could not register a test member:', body.slice(0, 200));
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: [
    '--no-sandbox',
    // A synthetic camera, so getUserMedia resolves with a real moving stream.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  permissions: ['camera'],
});
await context.addCookies([{ name: 'jm_session', value: cookie, domain: new URL(FRONTEND).hostname, path: '/' }]);
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('  console error:', m.text().slice(0, 140)); });

await page.goto(`${FRONTEND}/account`, { waitUntil: 'networkidle' });

// BarcodeDetector does not exist in this build of Chromium, and the live
// button is only offered where it does. Supplied so the code path under
// test is the one a phone actually runs.
await page.addInitScript(() => {
  class FakeBarcodeDetector {
    static getSupportedFormats() { return Promise.resolve(['ean_13']); }
    constructor() {}
    detect() { return Promise.resolve([]); }
  }
  Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector, configurable: true });
});
await page.reload({ waitUntil: 'networkidle' });

// The scanner lives on the Food tab.
const foodTab = page.getByRole('button', { name: /^Food/i }).or(page.locator('.acct__tab', { hasText: /food/i }));
if (await foodTab.count()) { await foodTab.first().click(); await page.waitForTimeout(800); }
const heading = page.getByText('Shelf scanner', { exact: false });
console.log('  shelf scanner on page :', (await heading.count()) > 0);

const liveButton = page.getByRole('button', { name: /Scan continuously/i });
if ((await liveButton.count()) === 0) {
  console.log('FAIL  the "Scan continuously" button is not offered at all');
  console.log('      body excerpt:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
  await browser.close();
  process.exit(1);
}
console.log('ok    the live-scan button is offered');

await liveButton.click();
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return { video: false };
  return {
    video: true,
    hasStream: v.srcObject !== null,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    paused: v.paused,
  };
});
console.log('  video element present :', state.video);
console.log('  srcObject assigned    :', state.hasStream);
console.log('  readyState            :', state.readyState, '(0 = nothing loaded)');
console.log('  intrinsic size        :', state.videoWidth + 'x' + state.videoHeight);
console.log('  paused                :', state.paused);

const working = state.video && state.hasStream && state.videoWidth > 0 && !state.paused;
if (!working) {
  /*
   * The failure is visual, so keep the picture. "srcObject assigned:
   * false" and a black rectangle are the same fact, and only one of them
   * is recognisable to whoever reported it.
   */
  await page.screenshot({ path: 'scanner-failure.png' });
  console.log('  screenshot written to scanner-failure.png');
}
console.log('\n  ' + (working ? 'SCANNER SHOWS A PICTURE' : 'SCANNER IS BLACK — no picture reaches the video'));
await browser.close();
process.exit(working ? 0 : 1);
