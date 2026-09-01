/**
 * Measure the metric overrides that make the webfont swap invisible.
 *
 * `font-display: swap` shows Arial first and Inter a moment later. If the
 * two set text at different widths and different cap heights, the page
 * reflows in front of the reader — the jump everybody recognises and
 * nobody can name. `size-adjust` and the ascent/descent overrides on the
 * "Inter Fallback" face remove it.
 *
 * The numbers are measured here rather than copied from a blog post,
 * because they are specific to these font files and to the local fallback
 * this environment actually has. Run it after replacing a woff2:
 *
 *   node scripts/measure-fallback.mjs        # needs the dev server up
 *
 * It prints the four values for each family. Paste them into the
 * "* Fallback" @font-face blocks at the top of globals.css.
 */
import { chromium } from 'playwright';

const BASE = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'load', timeout: 45_000 });
await page.evaluate(() => document.fonts.ready);

const result = await page.evaluate(async () => {
  // A pangram plus the digits: average character width over a sample that
  // exercises every letter, which is what `size-adjust` is correcting.
  const SAMPLE =
    'The quick brown fox jumps over the lazy dog 0123456789 ' +
    'ETAOIN SHRDLU etaoin shrdlu, and again: the quick brown fox.';

  const span = document.createElement('span');
  span.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-weight:400;';
  span.textContent = SAMPLE;
  document.body.append(span);

  const widthIn = (stack) => {
    span.style.fontFamily = stack;
    return span.getBoundingClientRect().width;
  };

  // Cap/x-box height via a canvas text metric — the same ascent and
  // descent the browser uses to lay a line out.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const box = (stack) => {
    ctx.font = `400 100px ${stack}`;
    const m = ctx.measureText(SAMPLE);
    return {
      ascent: m.fontBoundingBoxAscent / 100,
      descent: m.fontBoundingBoxDescent / 100,
    };
  };

  const fallback = 'Arial, "Liberation Sans", sans-serif';
  const out = {};
  for (const family of ['Inter', 'Manrope']) {
    const stack = `"${family}", ${fallback}`;
    await document.fonts.load(`400 100px "${family}"`);
    const real = widthIn(stack);
    const fb = widthIn(fallback);
    const rb = box(stack);
    out[family] = {
      sizeAdjust: (real / fb) * 100,
      ascent: rb.ascent * 100,
      descent: rb.descent * 100,
      realWidth: real,
      fallbackWidth: fb,
    };
  }
  span.remove();
  return out;
});

for (const [family, m] of Object.entries(result)) {
  if (Math.abs(m.realWidth - m.fallbackWidth) < 0.5) {
    console.log(`${family}: NOT LOADED — the sample set identically to the fallback.`);
    continue;
  }
  console.log(`@font-face { /* ${family} Fallback */`);
  console.log(`  size-adjust: ${m.sizeAdjust.toFixed(2)}%;`);
  // The overrides are expressed relative to the *adjusted* em, so the
  // measured ascent has to be divided back through size-adjust.
  const k = m.sizeAdjust / 100;
  console.log(`  ascent-override: ${(m.ascent / k).toFixed(2)}%;`);
  console.log(`  descent-override: ${(m.descent / k).toFixed(2)}%;`);
  console.log(`  line-gap-override: 0%;`);
  console.log(`}`);
}

await browser.close();
