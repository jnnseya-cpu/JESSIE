/**
 * The critical user journeys, driven in a real browser.
 *
 * Every check here failed at least once during the launch audit or exists
 * because a comparable check would have caught something that shipped. A
 * page that returns 200 is not a page that works: the audit found a blog
 * beacon that reported success while delivering nothing, three components
 * defaulting to localhost in production, and a splash screen invisible
 * because of a token collision. None of those are visible to a status
 * code.
 *
 *   FRONTEND=http://localhost:3000 API=http://localhost:4000/api \
 *     node scripts/journeys.mjs
 */

import { chromium } from 'playwright';

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3000';
const API = process.env.API ?? 'http://localhost:4000/api';
const EXECUTABLE =
  process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Console errors and failed requests, collected per page. */
function watch(page) {
  const errors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => {
    // A cancelled navigation is not a fault.
    const why = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(why)) failed.push(`${r.url()} ${why}`);
  });
  return { errors, failed };
}

/**
 * The real routes, read off `app/`. An earlier version of this file
 * guessed at /register, /login and /pricing, none of which exist, and
 * reported three 404s as product defects. A test that invents the thing
 * it is testing is worse than no test — it spends the reader's trust.
 */
const PUBLIC_ROUTES = [
  '/',
  '/get-started',
  '/account',
  '/try',
  '/blog',
  '/how-it-works',
  '/foodlens',
  '/mova',
  '/body-balance',
  '/micro-movement',
  '/challenges',
  '/wearables',
  '/for-adults',
  '/for-children',
  '/about',
  '/assurance',
  '/status',
  '/terms',
  '/privacy',
  '/policies',
  '/contact',
];

/**
 * Console noise that is correct behaviour, not a fault.
 *
 * A signed-out visitor's session check is a 401 by definition, and the
 * browser logs every 4xx as a console error. Counting those made every
 * public page look broken.
 */
const EXPECTED_NOISE = [/\/auth\/me/, /401 \(Unauthorized\)/];
const realError = (text) => !EXPECTED_NOISE.some((re) => re.test(text));

async function main() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE });

  /* ---------------------------------------------------------------- *
   * 1. Every public route renders, with no console errors
   * ---------------------------------------------------------------- */
  console.log('\n1. Public routes render without errors');
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  for (const route of PUBLIC_ROUTES) {
    const page = await desktop.newPage();
    const seen = watch(page);
    let status = 0;
    try {
      const res = await page.goto(`${FRONTEND}${route}`, { waitUntil: 'load', timeout: 30_000 });
      status = res?.status() ?? 0;
    } catch (err) {
      check(`GET ${route}`, false, String(err).slice(0, 80));
      await page.close();
      continue;
    }

    await page.waitForTimeout(600);
    const text = (await page.locator('body').innerText().catch(() => '')).trim();
    const blank = text.length < 40;
    seen.errors = seen.errors.filter(realError);

    check(
      `GET ${route}`,
      status === 200 && !blank && seen.errors.length === 0,
      `${status}, ${text.length} chars of text` +
        (seen.errors.length ? `, console: ${seen.errors[0].slice(0, 70)}` : '') +
        (blank ? ' — BLANK PAGE' : ''),
    );
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 2. Registration is reachable from the front page
   *
   * This is the defect that produced zero customers: registration
   * existed and nothing linked to it. A build-time check guards it now;
   * this proves it from the reader's side.
   * ---------------------------------------------------------------- */
  console.log('\n2. A visitor can find the way in');
  {
    const page = await desktop.newPage();
    await page.goto(FRONTEND, { waitUntil: 'load' });
    const hrefs = await page.locator('a[href]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') ?? ''),
    );
    const toRegister = hrefs.filter((h) => /register|sign-?up|join|get-?started/i.test(h));
    check('the front page links to registration', toRegister.length > 0, `${toRegister.length} routes`);
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 3. Registration, in the browser, end to end
   * ---------------------------------------------------------------- */
  console.log('\n3. Registration');
  {
    const page = await desktop.newPage();
    const seen = watch(page);
    await page.goto(`${FRONTEND}/account`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();
    const hasForm = (await email.count()) > 0 && (await password.count()) > 0;
    check('the registration form is present', hasForm);

    if (hasForm) {
      const address = `journey-${Date.now()}@example.com`;
      await email.fill(address);
      await password.fill('C0rrectHorse!99');

      // The humanity check refuses a token younger than three seconds, so
      // a script that fills and submits instantly is refused by design.
      // Waiting is the test: a real person takes longer than this.
      await page.waitForTimeout(4500);

      const name = page.locator('input[name="displayName"], input#displayName').first();
      if ((await name.count()) > 0) await name.fill('Journey Test');
      const age = page.locator('input[name="age"], input#age, input[type="number"]').first();
      if ((await age.count()) > 0) await age.fill('34');

      const submit = page.locator('button[type="submit"]').first();
      const before = page.url();
      await submit.click();
      await page.waitForTimeout(4000);

      const moved = page.url() !== before;
      const body = await page.locator('body').innerText().catch(() => '');
      const said = /welcome|account|verify|check your|signed in|dashboard/i.test(body);

      check(
        'submitting the form does something visible',
        moved || said,
        moved ? `navigated to ${page.url().replace(FRONTEND, '')}` : 'stayed, with a message',
      );
      const real = seen.errors.filter(realError);
      check('no console error during registration', real.length === 0, real[0]?.slice(0, 80) ?? '');
    }
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 4. A blog article renders its prose and records a view
   *
   * Both halves were broken and neither logged anything: the beacon used
   * sendBeacon with a JSON blob, which a browser silently drops
   * cross-origin, and the audit had no body to score.
   * ---------------------------------------------------------------- */
  console.log('\n4. A blog article');
  {
    const page = await desktop.newPage();
    await page.goto(`${FRONTEND}/blog`, { waitUntil: 'load' });
    const first = page.locator('a[href^="/blog/"]').first();
    const has = (await first.count()) > 0;
    check('the blog index lists articles', has);

    if (has) {
      const href = await first.getAttribute('href');
      const beacons = [];
      page.on('request', (r) => {
        if (r.url().includes('/blog/views')) beacons.push(r.method());
      });

      await page.goto(`${FRONTEND}${href}`, { waitUntil: 'load' });
      const text = await page.locator('body').innerText();
      check('the article renders its prose', text.length > 900, `${text.length} chars`);

      /*
       * The beacon listens for `visibilitychange` and `pagehide`. A
       * scripted navigation does not reliably fire pagehide in headless
       * Chromium, so this drives the other trigger — which is also the one
       * a real reader produces most often, by switching tabs rather than
       * by closing the page.
       */
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(1500);

      check('reading an article sends a view beacon', beacons.length > 0, `${beacons.length} request(s)`);
    }
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 5. The site works at a phone width
   * ---------------------------------------------------------------- */
  console.log('\n5. Mobile viewport');
  {
    const phone = await browser.newContext({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
    });
    for (const route of ['/', '/get-started', '/account', '/blog']) {
      const page = await phone.newPage();
      await page.goto(`${FRONTEND}${route}`, { waitUntil: 'load' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A few pixels is a rounded shadow. Fifteen is a broken layout.
      check(`${route} does not scroll sideways at 360px`, overflow <= 15, `${overflow}px overflow`);
      await page.close();
    }
    await phone.close();
  }

  /* ---------------------------------------------------------------- *
   * 6. Keyboard-only operation
   *
   * The critical journeys have to be possible without a mouse, and a
   * focus ring nobody can see is the same as no focus at all.
   * ---------------------------------------------------------------- */
  console.log('\n6. Keyboard navigation');
  {
    const page = await desktop.newPage();
    await page.goto(`${FRONTEND}/get-started`, { waitUntil: 'load' });

    const reached = [];
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          type: el.type ?? '',
          outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
          shadow: style.boxShadow !== 'none',
        };
      });
      if (tag) reached.push(tag);
    }
    const focusable = reached.length;
    const visible = reached.filter((r) => r.outline || r.shadow).length;
    check('tabbing reaches the form controls', focusable >= 3, `${focusable} focusable elements`);
    check(
      'focus is visible on what it reaches',
      focusable === 0 || visible / focusable > 0.5,
      `${visible}/${focusable} have a visible focus indicator`,
    );
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 7. The splash screen stays out of the open web
   * ---------------------------------------------------------------- */
  console.log('\n7. The PWA splash never reaches a browser tab');
  {
    const page = await desktop.newPage();
    await page.goto(FRONTEND, { waitUntil: 'load' });
    const shown = await page.evaluate(() => {
      const el = document.querySelector('[data-jm-splash], #jm-splash, .jm-splash');
      if (!el) return 'absent';
      return getComputedStyle(el).display === 'none' ? 'hidden' : 'VISIBLE';
    });
    check('the splash is not visible in a normal tab', shown !== 'VISIBLE', shown);
    await page.close();
  }

  /* ---------------------------------------------------------------- *
   * 8. No secret reaches the browser
   * ---------------------------------------------------------------- */
  console.log('\n8. Nothing secret is shipped to the client');
  {
    const page = await desktop.newPage();
    const scripts = [];
    page.on('response', async (r) => {
      if (/\.js(\?|$)/.test(r.url()) && r.status() === 200) {
        try {
          scripts.push(await r.text());
        } catch {
          /* a stream that closed is not evidence of anything */
        }
      }
    });
    await page.goto(FRONTEND, { waitUntil: 'load' });
    await page.goto(`${FRONTEND}/account`, { waitUntil: 'load' });

    const bundle = scripts.join('\n');
    const patterns = [
      ['sk_live', /sk_live_[A-Za-z0-9]/],
      ['sk_test', /sk_test_[A-Za-z0-9]/],
      ['whsec_', /whsec_[A-Za-z0-9]/],
      ['a Postgres URL', /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/],
      ['an OpenAI key', /sk-[A-Za-z0-9]{20,}/],
      ['an Anthropic key', /sk-ant-[A-Za-z0-9]/],
      ['a Google API key', /AIza[0-9A-Za-z_-]{20,}/],
      ['an AUTH_SECRET', /AUTH_SECRET["']?\s*[:=]\s*["'][^"']{8,}/],
    ];
    for (const [label, re] of patterns) {
      check(`no ${label} in the client bundle`, !re.test(bundle));
    }
    console.log(`        (scanned ${scripts.length} scripts, ${bundle.length} bytes)`);
    await page.close();
  }

  await desktop.close();
  await browser.close();

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
    console.log('');
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
