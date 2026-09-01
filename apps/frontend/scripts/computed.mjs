/**
 * Print the computed style of a selector on a route. Answers "which of the
 * competing rules actually won" without reading 7,500 lines of cascade.
 *
 *   node scripts/computed.mjs /  ".hero .btn--primary"  color background-image
 */
import { chromium } from 'playwright';

const [route, selector, ...props] = process.argv.slice(2);
const base = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + route, { waitUntil: 'load', timeout: 45_000 });
await page.evaluate(() => document.fonts.ready);

const out = await page.evaluate(
  ([sel, keys]) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const picked = {};
    for (const k of keys) picked[k] = cs.getPropertyValue(k);
    return { text: el.textContent?.trim().slice(0, 40), picked };
  },
  [selector, props.length ? props : ['font-family', 'color', 'background-color', 'border-radius']],
);

console.log(selector, JSON.stringify(out, null, 2));
await browser.close();
