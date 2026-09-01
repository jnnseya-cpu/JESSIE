import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const route = process.argv[2] ?? '/';
const out = process.argv[3] ?? '/tmp/mob';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto('http://127.0.0.1:3000' + route, { waitUntil: 'load', timeout: 45000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(500);
const h = await p.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.getBoundingClientRect().height));
const overflow = await p.evaluate(() => {
  const w = document.documentElement.clientWidth;
  return [...document.querySelectorAll('body *')]
    .filter(e => e.getBoundingClientRect().right > w + 1)
    .slice(0, 8)
    .map(e => `${e.tagName}.${typeof e.className === 'string' ? e.className : ''} right=${Math.round(e.getBoundingClientRect().right)} (vw ${w})`);
});
const name = route === '/' ? 'home' : route.replace(/\//g, '-').slice(1);
const n = Number(process.argv[4] ?? 8);
for (let i = 0, y = 0; y < h && i < n; y += 844, i++) {
  await p.screenshot({ path: `${out}/${name}-${String(i).padStart(2, '0')}.png`, fullPage: true, clip: { x: 0, y, width: 390, height: Math.min(844, h - y) } });
}
console.log(`${name}: ${h}px`);
if (overflow.length) console.log('HORIZONTAL OVERFLOW:\n  ' + overflow.join('\n  '));
await b.close();
