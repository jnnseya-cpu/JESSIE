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
 * Scope and honesty about it: translucent ancestors are composited and
 * gradients are measured at every colour stop, so the only thing left
 * unmeasured is text over a raster image — reported as `unmeasurable`
 * rather than counted as a pass. A stop list is also not quite the
 * painted pixels: an interpolation between two stops can be marginally
 * darker than either, so a result that only just clears the threshold on
 * a gradient deserves an eye as well as a number.
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

      /*
       * The ground, composited.
       *
       * The first version stopped at the first translucent ancestor and
       * reported the node as unmeasurable. That is 1,121 of 7,274 nodes,
       * and one of them was the site navigation — a bar at
       * `rgba(16, 42, 67, 0.82)` over whatever the page starts with. A
       * regression that put dark grey link text on that dark bar sailed
       * through the audit and was only caught by looking at a screenshot.
       *
       * So translucent layers are now stacked: walk to the first opaque
       * ancestor collecting the semi-transparent fills on the way, then
       * composite them back down in paint order. Only a gradient still
       * defeats it, because a gradient has no single colour to composite
       * and text over one is a judgement rather than a measurement.
       */
      const groundOf = (el) => {
        const stack = [];
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const image = cs.backgroundImage;
          if (image !== 'none') {
            /*
             * A gradient is not one colour, so it is measured as several:
             * every colour stop in it, each composited down through the
             * translucent layers above and the ground below, and the text
             * is judged against the worst of them.
             *
             * Skipping gradients instead is what let a regression put dark
             * grey nav links on the dark nav bar, and it would have
             * silenced every card on the site the moment `.card--light`
             * was given a fill that runs white to off-white. A stop list
             * is not the same as sampling the painted pixels — a mid-stop
             * interpolation can be marginally darker than either end — but
             * it is measurement rather than an exemption.
             */
            const stops = [...image.matchAll(/rgba?\([^)]*\)/g)].map((m) => rgb(m[0]));
            if (stops.length) {
              /*
               * What the gradient is painted *on* is this element's own
               * background-color first — `background: <gradient>, navy`
               * is shorthand for exactly that — and only then whatever is
               * behind the element. Reading the parent's ground instead
               * reported the closing call-to-action, a navy band, as
               * white, and its white heading as 1:1 against it.
               */
              const own = rgb(cs.backgroundColor);
              const behind = groundOf(n.parentElement ?? document.body).colours?.[0] ?? [1, 1, 1];
              const base = own.slice(0, 3).map((c, k) => c * own[3] + behind[k] * (1 - own[3]));
              const colours = stops.map((s) =>
                composite(stack, [
                  ...s.slice(0, 3).map((c, k) => c * s[3] + base[k] * (1 - s[3])),
                  1,
                ]),
              );
              return { colours, node: n };
            }
            return { gradient: true, node: n };
          }
          const layer = rgb(cs.backgroundColor);
          if (layer[3] >= 0.95) return { colours: [composite(stack, layer)], node: stack[0]?.node ?? n };
          if (layer[3] > 0) stack.push({ layer, node: n });
        }
        return { colours: [composite(stack, [1, 1, 1, 1])], node: stack[0]?.node ?? document.body };
      };

      /** Paint `stack` (nearest first) back down onto an opaque base. */
      const composite = (stack, base) => {
        let out = base.slice(0, 3);
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          const [r, g, b, a] = stack[i].layer;
          out = [r, g, b].map((c, k) => c * a + out[k] * (1 - a));
        }
        return out;
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
        if (!ground.colours) {
          out.vague.push({ text: own.slice(0, 60), why: 'unresolvable background image' });
          continue;
        }

        // Both fades compose: the alpha in the colour itself, and any
        // `opacity` on the element. Either alone reports a contrast
        // nobody gets; together they are what the reader receives. Where
        // the ground is a gradient there are several candidates, and the
        // one that matters is the worst.
        const raw = rgb(cs.color);
        const alpha = raw[3] * opacity;
        let ratio = Infinity;
        let worstGround = ground.colours[0];
        for (const g of ground.colours) {
          const fg = raw.slice(0, 3).map((c, i) => c * alpha + g[i] * (1 - alpha));
          const r = contrast(fg, g);
          if (r < ratio) {
            ratio = r;
            worstGround = g;
          }
        }
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
            ground: `rgb(${worstGround.map((c) => Math.round(c * 255)).join(', ')})`,
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
  if (unmeasurable.length) {
    console.log(
      `${unmeasurable.length} sit on a background image this cannot resolve and are not counted either way.`,
    );
  }
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
