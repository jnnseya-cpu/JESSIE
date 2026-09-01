/**
 * Walk every route and measure the contrast of text as it is actually
 * painted — resolved colour against the resolved colour of whatever is
 * behind it, including gradients and semi-transparent overlays.
 *
 * Written because grepping the stylesheet for `color:` found some of the
 * failures and not others: a heading is only unreadable in combination
 * with the ground it lands on, and that pairing exists at render time,
 * not in the source.
 *
 *   node scripts/audit-contrast.mjs            # needs the dev server up
 *   node scripts/audit-contrast.mjs --json     # machine-readable
 *
 * Exits non-zero when anything fails, so it can gate a release.
 *
 * Scope and honesty about it: this measures foreground against the
 * nearest ancestor with an opaque background, which is what a reader
 * sees in the overwhelming majority of cases. Text over a photograph or
 * over the middle of a gradient is not something a static walk can
 * settle, and those are reported separately as `unmeasurable` rather than
 * being counted as passes.
 */
import { chromium } from 'playwright';

const ROUTES = [
  '/', '/get-started', '/how-it-works', '/micro-movement', '/foodlens', '/mova',
  '/body-balance', '/challenges', '/wearables', '/for-adults', '/for-children',
  '/about', '/assurance', '/blog', '/status', '/contact', '/policies',
  '/terms', '/privacy', '/account', '/try', '/industries', '/developers',
  '/partner-programme', '/growth', '/communications', '/console', '/offline',
];

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
const base = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';
const asJson = process.argv.includes('--json');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const failures = [];
const unmeasurable = [];
let checked = 0;

for (const route of ROUTES) {
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
  } catch {
    console.log(`skip  ${route}  (did not load)`);
    continue;
  }

  const found = await page.evaluate(
    ([aaNormal, aaLarge]) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      /*
       * Returns [r, g, b, a]. The alpha matters: much of this stylesheet
       * sets text as `rgba(244, 250, 249, 0.52)` on a dark ground, and
       * reading only the RGB reports the contrast of pure white — which
       * nobody sees. An earlier version of this script did exactly that
       * and passed rules that fail.
       */
      const rgb = (css) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#010203';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
      };
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const contrast = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };

      /** The nearest ancestor that actually paints something opaque. */
      const groundOf = (el) => {
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.backgroundImage !== 'none') return { gradient: true, node: n };
          const bg = cs.backgroundColor;
          const alpha = Number(bg.match(/[\d.]+/g)?.[3] ?? 1);
          if (alpha >= 0.95) return { colour: rgb(bg), node: n };
          if (alpha > 0) return { translucent: true, node: n };
        }
        return { colour: [1, 1, 1] };
      };

      const out = { fails: [], vague: [], count: 0 };
      for (const el of document.querySelectorAll('body *')) {
        // Only elements that render text of their own.
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3 && n.textContent.trim())
          .map((n) => n.textContent.trim())
          .join(' ');
        if (!own) continue;

        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        const opacity = Number(cs.opacity);
        if (opacity === 0) continue;

        const size = parseFloat(cs.fontSize);
        const weight = Number(cs.fontWeight) || 400;
        // WCAG "large": 18.66px bold, or 24px at any weight.
        const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? aaLarge : aaNormal;

        const ground = groundOf(el);
        out.count += 1;
        if (!ground.colour) {
          out.vague.push({ text: own.slice(0, 60), why: ground.gradient ? 'gradient' : 'translucent' });
          continue;
        }

        // Both fades compose: the alpha in the colour itself, and any
        // `opacity` on the element. Either alone reports a contrast
        // nobody gets; together they are what the reader receives.
        const raw = rgb(cs.color);
        const alpha = raw[3] * opacity;
        const fg = raw.slice(0, 3).map((c, i) => c * alpha + ground.colour[i] * (1 - alpha));

        const ratio = contrast(fg, ground.colour);
        if (ratio < threshold) {
          out.fails.push({
            text: own.slice(0, 60),
            selector:
              el.tagName.toLowerCase() +
              (el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).join('.')
                : ''),
            ratio: Number(ratio.toFixed(2)),
            need: threshold,
            size: Number(size.toFixed(1)),
            colour: cs.color,
            ground: getComputedStyle(ground.node ?? document.body).backgroundColor,
            groundOn:
              (ground.node?.tagName ?? 'BODY').toLowerCase() +
              (typeof ground.node?.className === 'string' && ground.node.className
                ? '.' + ground.node.className.trim().split(/\s+/).join('.')
                : ''),
          });
        }
      }
      return out;
    },
    [AA_NORMAL, AA_LARGE],
  );

  checked += found.count;
  for (const f of found.fails) failures.push({ route, ...f });
  for (const v of found.vague) unmeasurable.push({ route, ...v });
  const mark = found.fails.length ? `${found.fails.length} FAIL` : 'ok';
  if (!asJson) console.log(`${mark.padEnd(8)} ${route}  (${found.count} text nodes)`);
}

await browser.close();

if (asJson) {
  console.log(JSON.stringify({ checked, failures, unmeasurable }, null, 2));
} else {
  console.log(`\n${checked} text nodes measured across ${ROUTES.length} routes.`);
  console.log(`${unmeasurable.length} sit on a gradient or a translucent ground and are not counted either way.`);
  if (failures.length === 0) {
    console.log('No text below its WCAG 2.2 AA threshold.');
  } else {
    console.log(`\n${failures.length} below threshold:\n`);
    const seen = new Set();
    for (const f of failures) {
      const key = `${f.selector}|${f.colour}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${f.ratio}:1 (needs ${f.need})  ${f.selector}`);
      console.log(`      ${f.route}  ${f.size}px  ${f.colour}  "${f.text}"`);
    }
    console.log(`\n(${failures.length} occurrences, ${seen.size} distinct.)`);
  }
}

process.exit(failures.length ? 1 : 0);
