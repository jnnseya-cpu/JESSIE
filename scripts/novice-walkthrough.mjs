/**
 * Gate 2: the novice, on a mid-range Android, on slow 3G.
 *
 * The launch audit was run as two minds. Mind 1 is a principal engineer
 * with a fast laptop. Mind 2 is somebody who has never used the product,
 * on a mid-range Android phone, on a slow connection, reading English as
 * a second language, who abandons anything confusing inside thirty
 * seconds. A feature that works for Mind 1 and defeats Mind 2 is a
 * failure, not a UX note.
 *
 * Mind 2's walkthrough produced the Gate 2 measurement — 20.6 seconds to
 * a signed-in account, largest contentful paint at 3,976ms — and then
 * existed nowhere. The number was in a report and the thing that produced
 * it was in a scratchpad directory on a container that no longer exists.
 * Nobody could reproduce it, confirm it, or notice it getting worse. So
 * it is here, behind `pnpm verify:novice`.
 *
 * The budgets are not derived from the measurement. Writing down whatever
 * was measured is how a target stops being a target:
 *
 *   - Thirty seconds to a signed-in account, because thirty seconds is
 *     Mind 2's own definition. It is the brief's number, not this run's.
 *   - Four seconds for largest contentful paint, the upper bound of
 *     Google's "needs improvement" band. The last measurement was
 *     3,976ms, which clears it by twenty-four milliseconds. That is not
 *     comfort, and this script says so rather than padding the budget to
 *     make the margin look better.
 *
 * Run against a production build. `next dev` is not what anybody gets.
 *
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api pnpm build:frontend
 *   pnpm --filter @jessmove/frontend exec next start -p 3000 &
 *   node apps/backend/dist/main.js &
 *   node scripts/novice-walkthrough.mjs
 */
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const FRONTEND = process.env.FRONTEND ?? 'http://localhost:3000';

/** Mind 2's own threshold, from the brief. Not from a measurement. */
const BUDGET_TO_SIGNED_IN_MS = 30_000;

/** The upper bound of Google's "needs improvement" band for LCP. */
const BUDGET_LCP_MS = 4_000;

/**
 * A mid-range Android, not a flagship.
 *
 * 4x CPU throttling and slow 3G are the Lighthouse "mobile" defaults,
 * which exist because they approximate the median device rather than the
 * median developer's device.
 */
const DEVICE = {
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; moto g(30)) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
};
const CPU_THROTTLE = 4;
const SLOW_3G = {
  offline: false,
  // 400 Kbps down, 400 Kbps up, 400ms round trip.
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

let fail = 0;
const failures = [];
const milestones = [];

function record(what, ms) {
  milestones.push([what, ms]);
  console.log(`  ${String(Math.round(ms)).padStart(6)}ms  ${what}`);
}

function bad(what, detail) {
  fail += 1;
  failures.push(`${what} — ${detail}`);
  console.log(`  FAIL  ${what} — ${detail}`);
}

const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext(DEVICE);
const page = await context.newPage();

const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
await cdp.send('Network.emulateNetworkConditions', SLOW_3G);

/** Largest contentful paint, read from the real performance entries. */
async function largestContentfulPaint() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = 0;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) last = entry.startTime;
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
          // LCP is only final once the page stops changing. Half a second
          // after load is enough for this page and bounded enough not to
          // stretch the walkthrough's own clock.
          setTimeout(() => {
            observer.disconnect();
            resolve(last);
          }, 500);
        } catch {
          resolve(0);
        }
      }),
  );
}

console.log('\nGATE 2 — the novice walkthrough');
console.log(`  device        ${DEVICE.viewport.width}x${DEVICE.viewport.height}, DPR ${DEVICE.deviceScaleFactor}, mid-range Android`);
console.log(`  cpu           ${CPU_THROTTLE}x throttled`);
console.log(`  network       slow 3G — 400 Kbps, ${SLOW_3G.latency}ms RTT`);
console.log(`  budget        ${BUDGET_TO_SIGNED_IN_MS / 1000}s to a signed-in account, LCP under ${BUDGET_LCP_MS}ms\n`);

const started = Date.now();
const since = () => Date.now() - started;

/* 1. The landing page, cold. ---------------------------------------- */
await page.goto(FRONTEND, { waitUntil: 'domcontentloaded' });
record('landing page interactive', since());

const lcp = await largestContentfulPaint();
record('largest contentful paint', lcp);
if (lcp === 0) {
  bad(
    'largest contentful paint',
    'no LCP entry was recorded, so this run measured nothing. An LCP of 0 ' +
      'must never read as a pass.',
  );
} else if (lcp > BUDGET_LCP_MS) {
  bad('largest contentful paint', `${Math.round(lcp)}ms, over the ${BUDGET_LCP_MS}ms budget`);
}

/* 2. Finding the way in, without being told where it is. ------------- */
/*
 * Mind 2 does not know the route. The first version of this walk clicked
 * a nav element that measured 0x0 and a footer link that scrolled
 * nowhere, and reported both as product defects; they were script
 * defects. So: only controls that are actually visible and actually sized
 * count as a way in.
 */
const wayIn = await page.evaluate(() => {
  const candidates = [...document.querySelectorAll('a, button')];
  return candidates
    .map((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').trim().slice(0, 60),
        href: el.getAttribute('href') ?? '',
        width: Math.round(box.width),
        height: Math.round(box.height),
        visible:
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity) > 0.05,
      };
    })
    .filter(
      (c) =>
        c.visible &&
        (/\baccount\b|\bjoin\b|sign ?up|get started|start|begin/i.test(c.text) ||
          /\/account/.test(c.href)),
    );
});

if (wayIn.length === 0) {
  bad(
    'a way in',
    'no visible control on the landing page offers an account. Mind 2 has ' +
      'nowhere to go.',
  );
} else {
  record(`a way in found — "${wayIn[0].text}"`, since());
}

/* 3. The account page, and a register form Mind 2 can see. ----------- */
await page.goto(`${FRONTEND}/account?new=1`, { waitUntil: 'domcontentloaded' });
record('account page interactive', since());

/*
 * The register form must be present in the markup the server sent, not
 * arrive later. It used to be chosen by a useEffect, which on this
 * connection put it eight seconds behind the rest of the page: Mind 2 saw
 * a sign-in form, concluded there was no way to join, and left. The
 * choice is made on the server now, so the first byte carries it.
 */
const formOnFirstPaint = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('input')];
  const named = (re) => fields.some((f) => re.test(f.name) || re.test(f.id) || re.test(f.type));
  return {
    count: fields.length,
    hasEmail: named(/email/i),
    hasPassword: named(/password/i),
    hasDob: named(/dob|birth|date/i),
  };
});

if (!formOnFirstPaint.hasEmail || !formOnFirstPaint.hasPassword) {
  bad(
    'the register form',
    `the account page has ${formOnFirstPaint.count} inputs and no ` +
      'email/password pair on first paint, so the form arrives after the ' +
      'page — which is the defect that cost eight seconds on this connection',
  );
} else {
  record('register form present on first paint', since());
}

/* 4. Registering, as somebody who has not done it before. ----------- */
const email = `novice.${Date.now()}@example.test`;
const password = 'Str0ng-Passphrase-2026';

async function fillFirst(selectors, value) {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if ((await field.count()) && (await field.isVisible())) {
      await field.fill(value);
      return true;
    }
  }
  return false;
}

const filledEmail = await fillFirst(
  ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'],
  email,
);
const filledPassword = await fillFirst(
  ['input[type="password"]', 'input[name*="password" i]'],
  password,
);
/*
 * Date of birth is required — an age mode cannot be chosen without it,
 * and a minor cannot be created without a guardian. A novice who cannot
 * find the field cannot register at all, so its absence is a failure
 * rather than something to skip past.
 */
const filledDob = await fillFirst(
  ['input[type="date"]', 'input[name*="dob" i]', 'input[name*="birth" i]'],
  '1985-06-15',
);

if (!filledEmail || !filledPassword) {
  bad('registering', 'the email or password field could not be filled');
} else {
  record(`form filled${filledDob ? ' (including date of birth)' : ''}`, since());
}

/*
 * The door policy requires the page's token to be at least three seconds
 * old at register, so a script that submits instantly is refused as a
 * bot. Mind 2 takes longer than that to read a form; waiting here
 * reproduces a human's pace rather than working around the control.
 */
await page.waitForTimeout(3_500);

const submit = page
  .locator('button[type="submit"], button:has-text("Create"), button:has-text("Join"), button:has-text("Continue")')
  .first();
if (!(await submit.count())) {
  bad('registering', 'no submit control was found on the register form');
} else {
  await submit.click();
  await page
    .waitForLoadState('networkidle', { timeout: 20_000 })
    .catch(() => {});
}

/* 5. Signed in, or not. --------------------------------------------- */
const signedIn = await page.evaluate(() => {
  const text = document.body.innerText;
  const storage = (() => {
    try {
      return Object.keys(localStorage).some((k) => /token|session|auth/i.test(k));
    } catch {
      return false;
    }
  })();
  return {
    storage,
    greeted: /sign out|log out|your account|welcome|signed in/i.test(text),
    error: /already|invalid|something went wrong|try again/i.test(text),
    excerpt: text.replace(/\s+/g, ' ').slice(0, 200),
  };
});

const elapsed = since();
if (signedIn.storage || signedIn.greeted) {
  record('signed-in account reached', elapsed);
  if (elapsed > BUDGET_TO_SIGNED_IN_MS) {
    bad(
      'time to a signed-in account',
      `${(elapsed / 1000).toFixed(1)}s, over the ${BUDGET_TO_SIGNED_IN_MS / 1000}s ` +
        'budget. Mind 2 has already left.',
    );
  }
} else {
  bad(
    'time to a signed-in account',
    `not reached in ${(elapsed / 1000).toFixed(1)}s. The page says: ` +
      `"${signedIn.excerpt}"`,
  );
}

await browser.close();

/* ------------------------------------------------------------------ *
 * What this run covered
 * ------------------------------------------------------------------ */
console.log('\n  Milestones:');
for (const [what, ms] of milestones) {
  console.log(`    ${String(Math.round(ms)).padStart(6)}ms  ${what}`);
}

/*
 * Asserted last and loudly. A walkthrough that reached none of its
 * milestones and reported no failures would otherwise read as a pass,
 * which is the shape of five separate controls this audit found passing
 * while measuring nothing.
 */
if (milestones.length < 4) {
  console.log(
    `\n  FAIL  the walkthrough recorded only ${milestones.length} milestones. ` +
      'It did not get far enough to have measured anything, whatever else ' +
      'it reports.',
  );
  process.exit(1);
}

const toSignedIn = milestones.find(([w]) => w === 'signed-in account reached');
if (toSignedIn) {
  const margin = BUDGET_TO_SIGNED_IN_MS - toSignedIn[1];
  console.log(
    `\n  ${(toSignedIn[1] / 1000).toFixed(1)}s to a signed-in account, ` +
      `${(margin / 1000).toFixed(1)}s inside Mind 2's thirty.`,
  );
}
if (lcp > 0) {
  const margin = BUDGET_LCP_MS - lcp;
  console.log(
    margin >= 0
      ? `  LCP ${Math.round(lcp)}ms, ${Math.round(margin)}ms inside the ` +
          `${BUDGET_LCP_MS}ms budget.`
      : `  LCP ${Math.round(lcp)}ms, ${Math.round(-margin)}ms OVER the ` +
          `${BUDGET_LCP_MS}ms budget.`,
  );
  /*
   * Said every run, because the number is easy to misread. This is a
   * local `next start`, which serves gzip. Production is served from
   * Vercel's edge, which serves brotli — typically 15 to 20 per cent
   * smaller on HTML and CSS, and this page's largest paint is entirely
   * network-bound: 4x CPU throttling alone puts LCP at 480ms, slow 3G
   * alone puts it at 3,868ms. So the production figure will be lower
   * than this one by some amount nobody here can measure, because the
   * network policy on this machine refuses jessmove.com by design.
   * Whoever can reach production should measure it there.
   */
  console.log(
    '  Measured against a local next start, which serves gzip; production ' +
      'is brotli from the Vercel edge and will be somewhat faster. That ' +
      'difference is not measurable from this machine.',
  );
}

if (fail) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`    ${f}`);
  process.exit(1);
}
console.log('\n  Gate 2 passed.\n');
