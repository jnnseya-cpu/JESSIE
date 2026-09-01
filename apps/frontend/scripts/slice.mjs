import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const route = process.argv[2] ?? '/';
const out = process.argv[3] ?? '/tmp/slices';
const width = Number(process.argv[4] ?? 1440);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await p.goto('http://127.0.0.1:3000' + route, { waitUntil: 'load', timeout: 45000 });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
const h = await p.evaluate(() => document.body.scrollHeight);
const name = route === '/' ? 'home' : route.replace(/\//g,'-').slice(1);
let i = 0;
for (let y = 0; y < h && i < 14; y += 900, i++) {
  await p.screenshot({ path: `${out}/${name}-${String(i).padStart(2,'0')}.png`, fullPage: true, clip: { x:0, y, width, height: Math.min(900, h-y) } });
}
console.log(`${name}: height ${h}, ${i} slices`);
await b.close();
