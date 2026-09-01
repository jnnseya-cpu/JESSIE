/**
 * Measure the real contrast of the brand palette used as *text*.
 *
 * §5 says colour is never the only signal and §25 sets an AA floor, but
 * the stylesheet paints headings, statistics and labels in the vivid
 * brand hues on the light ground. Seven of the eight fail AA there. This
 * script proves it, and finds the lightness cap that fixes every one of
 * them without changing a single hue.
 *
 *   node scripts/measure-contrast.mjs        # needs the dev server up
 *
 * The browser does the colour conversion — `oklch(from ... )` resolved by
 * the same engine that will render it — so the numbers are the ones
 * readers actually get, not a re-implementation of the conversion.
 */
import { chromium } from 'playwright';

const HUES = {
  teal: '#00a99d',
  lime: '#b7e436',
  orange: '#f59e3d',
  blue: '#3487f7',
  sky: '#67c5eb',
  purple: '#7656e8',
  magenta: '#d84f9a',
  coral: '#ff6b5e',
};

/** The two light grounds text sits on: --jm-bg and --jm-surface. */
const GROUNDS = { '--jm-bg': '#f4f8f7', '--jm-surface': '#ffffff' };

/** And the three dark ones, where the same hue has the opposite problem. */
const DARK_GROUNDS = {
  '--jm-navy': '#102a43',
  '--jm-surface-d': '#102a3a',
  '--jm-elevated-d': '#17384a',
};

const AA_TEXT = 4.5;

const CAPS = [0.62, 0.58, 0.55, 0.52, 0.5, 0.48, 0.45];
const FLOORS = [0.66, 0.7, 0.74, 0.78, 0.82, 0.86];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
await page.goto(process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000', {
  waitUntil: 'load',
  timeout: 45_000,
});

const rows = await page.evaluate(
  ([hues, caps, floors]) => {
    /*
     * Painted, not read off the computed style. `getComputedStyle` returns
     * a relative colour still in `oklch(...)` form, and an oklch triple
     * parsed as if it were an rgb one produces plausible-looking numbers
     * that mean nothing — the first version of this script "passed" every
     * lightness cap identically because of it. Filling one pixel and
     * reading it back gives the sRGB the display actually receives,
     * including the browser's own gamut mapping for out-of-gamut chroma.
     */
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const resolve = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      // A value the canvas rejects leaves fillStyle at its previous
      // setting, so it is reset to a sentinel that could never be a
      // legitimate answer here.
      ctx.fillStyle = '#010203';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    };
    const out = { supportsRelative: CSS.supports('color', 'oklch(from red l c h)'), values: {} };
    for (const [name, hex] of Object.entries(hues)) {
      out.values[name] = { vivid: resolve(hex), caps: {}, floors: {} };
      for (const cap of caps) {
        out.values[name].caps[cap] = resolve(`oklch(from ${hex} calc(min(l, ${cap})) c h)`);
      }
      for (const floor of floors) {
        out.values[name].floors[floor] = resolve(`oklch(from ${hex} calc(max(l, ${floor})) c h)`);
      }
    }
    return out;
  },
  [HUES, CAPS, FLOORS],
);

if (!rows.supportsRelative) {
  console.log('This browser has no relative colour syntax; nothing to measure.');
  process.exit(1);
}

const parse = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map((n) => Number(n) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hexOf = (name) => parse(`rgb(${name})`);

console.log('Vivid brand hues used as text:');
for (const [name, v] of Object.entries(rows.values)) {
  const worst = Math.min(
    ...Object.values(GROUNDS).map((g) => ratio(parse(v.vivid), hexOf(hexToRgb(g)))),
  );
  console.log(`  ${name.padEnd(8)} ${worst.toFixed(2)}:1  ${worst >= AA_TEXT ? 'pass' : 'FAIL'}`);
}

console.log('\nLightness cap needed so every hue clears AA on both grounds:');
for (const cap of CAPS) {
  const worst = Math.min(
    ...Object.entries(rows.values).flatMap(([, v]) =>
      Object.values(GROUNDS).map((g) => ratio(parse(v.caps[cap]), hexOf(hexToRgb(g)))),
    ),
  );
  const offender = Object.entries(rows.values)
    .map(([n, v]) => [
      n,
      Math.min(...Object.values(GROUNDS).map((g) => ratio(parse(v.caps[cap]), hexOf(hexToRgb(g))))),
    ])
    .sort((a, b) => a[1] - b[1])[0];
  console.log(
    `  min(l, ${cap})  worst ${worst.toFixed(2)}:1 (${offender[0]})  ${
      worst >= AA_TEXT ? 'PASSES' : 'fails'
    }`,
  );
}

console.log('\nLightness floor needed so every hue clears AA on the dark grounds:');
for (const floor of FLOORS) {
  const scored = Object.entries(rows.values)
    .map(([n, v]) => [
      n,
      Math.min(
        ...Object.values(DARK_GROUNDS).map((g) =>
          ratio(parse(v.floors[floor]), hexOf(hexToRgb(g))),
        ),
      ),
    ])
    .sort((a, b) => a[1] - b[1]);
  const [name, worst] = scored[0];
  console.log(
    `  max(l, ${floor})  worst ${worst.toFixed(2)}:1 (${name})  ${
      worst >= AA_TEXT ? 'PASSES' : 'fails'
    }`,
  );
}

function hexToRgb(h) {
  const n = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return n.join(',');
}

await browser.close();
