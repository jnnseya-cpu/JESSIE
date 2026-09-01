/**
 * Structural sanity across every route, at desktop and at 390px.
 *
 * Contrast is measured elsewhere; this catches the other way a page
 * breaks — something wider than the viewport, something with no height,
 * text clipped by a fixed-height box, or a tap target below the 48px
 * this platform promises in §25.
 *
 *   node scripts/audit-layout.mjs
 */
import { chromium } from 'playwright';

const ROUTES = [
  '/', '/get-started', '/how-it-works', '/micro-movement', '/foodlens', '/mova',
  '/body-balance', '/challenges', '/wearables', '/for-adults', '/for-children',
  '/about', '/assurance', '/blog', '/status', '/contact', '/policies',
  '/terms', '/privacy', '/account', '/try', '/industries', '/developers',
  '/partner-programme', '/growth', '/communications', '/console', '/offline',
];

const WIDTHS = [1440, 390];
const base = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

let problems = 0;

for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const route of ROUTES) {
    await page.goto(base + route, { waitUntil: 'load', timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    const found = await page.evaluate((vw) => {
      const out = { overflow: [], clipped: [], small: [] };
      const name = (e) =>
        e.tagName.toLowerCase() +
        (typeof e.className === 'string' && e.className
          ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '');

      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;

        // Wider than the viewport, and not inside something that clips it.
        if (r.right > vw + 1) {
          let clippedByAncestor = false;
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n);
            if (o.overflowX === 'hidden' || o.overflowX === 'auto' || o.overflowX === 'scroll') {
              clippedByAncestor = true;
              break;
            }
          }
          if (!clippedByAncestor) out.overflow.push(`${name(el)} right=${Math.round(r.right)}`);
        }

        /*
         * Text taller than the box holding it, with no scroll offered.
         *
         * An absolutely-positioned child inflates scrollHeight without
         * anything being clipped — the hero aura is 780px of decoration
         * inside a 530px band by design — so an element with one is not
         * evidence. Nor is a 1px box: that is the honeypot field, which
         * is meant to be invisible.
         */
        const hasAbsChild = [...el.children].some((c) => {
          const p = getComputedStyle(c).position;
          return p === 'absolute' || p === 'fixed';
        });
        if (
          el.clientHeight > 2 &&
          !hasAbsChild &&
          el.scrollHeight > el.clientHeight + 2 &&
          cs.overflowY === 'hidden'
        ) {
          out.clipped.push(`${name(el)} ${el.scrollHeight}>${el.clientHeight}`);
        }

        // §25 — every interactive target clears 48px.
        if (
          (el.tagName === 'BUTTON' || (el.tagName === 'A' && el.getAttribute('href'))) &&
          cs.display !== 'inline' &&
          r.height < 24
        ) {
          out.small.push(`${name(el)} ${Math.round(r.height)}px`);
        }
      }
      return out;
    }, width);

    const issues = [
      ...found.overflow.map((s) => `overflow  ${s}`),
      ...found.clipped.map((s) => `clipped   ${s}`),
      ...found.small.map((s) => `target    ${s}`),
    ];
    if (issues.length) {
      problems += issues.length;
      console.log(`${width}px ${route}`);
      for (const i of [...new Set(issues)].slice(0, 6)) console.log(`    ${i}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(problems ? `\n${problems} layout problems.` : '\nNo layout problems at 1440px or 390px.');
process.exit(problems ? 1 : 0);
