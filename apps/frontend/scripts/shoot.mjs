/**
 * Capture what the site actually looks like, so design judgements are made
 * against pixels rather than against source.
 *
 * `networkidle` is deliberately not used: the Next App Router prefetches
 * every visible link, so the network never goes idle and the wait always
 * times out. `load` plus a fonts-ready await is the honest signal.
 *
 *   node scripts/shoot.mjs [outDir] [width] [route ...]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES = [
  '/', '/get-started', '/how-it-works', '/micro-movement', '/foodlens', '/mova',
  '/body-balance', '/challenges', '/wearables', '/for-adults', '/for-children',
  '/about', '/assurance', '/blog', '/status', '/contact', '/policies',
  '/terms', '/privacy', '/account', '/try', '/industries', '/developers',
  '/partner-programme', '/growth', '/communications', '/console',
];

const outDir = process.argv[2] ?? '/tmp/shots';
const width = Number(process.argv[3] ?? 1440);
const routes = process.argv.length > 4 ? process.argv.slice(4) : ROUTES;
const base = process.env.SHOOT_BASE ?? 'http://127.0.0.1:3000';

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });

for (const route of routes) {
  const name = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 45_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
    console.log(`ok    ${route}`);
  } catch (err) {
    console.log(`FAIL  ${route}  ${err.message.split('\n')[0]}`);
  }
}

await browser.close();
