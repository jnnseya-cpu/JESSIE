import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SPLASH_TARGETS,
  parseSplashFile,
  splashEntries,
  splashFile,
  splashMedia,
} from '../../frontend/app/splash-targets.ts';

/**
 * The launch screen.
 *
 * Two failures are being guarded against, and neither of them throws.
 *
 * A launch image that no device matches simply does not appear — iOS falls
 * back to the blank white rectangle the whole feature exists to remove, and
 * nothing anywhere reports a problem. That is why the media queries and the
 * generated filenames are asserted against each other rather than eyeballed.
 *
 * The second is worse and points the other way: the in-document splash is a
 * full-screen cover, and if its `display-mode: standalone` guard is ever
 * removed it lands on the marketing pages and the blog — the pages whose
 * entire job is that a stranger arrives, reads and registers — and on
 * anything crawling them. That would look like a styling change in a diff
 * and behave like taking the front of the site offline.
 */

const APP = new URL('../../frontend/app/', import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, APP), 'utf8');

/* ------------------------------------------------------------------ *
 * The images iOS will actually ask for
 * ------------------------------------------------------------------ */

test('every device is covered in both orientations', () => {
  const entries = splashEntries();
  assert.equal(entries.length, SPLASH_TARGETS.length * 2);

  // An iPad lives in landscape. A portrait-only list means the most common
  // way the device is held is the one that shows nothing.
  for (const target of SPLASH_TARGETS) {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const media = splashMedia(target, orientation);
      assert.ok(
        entries.some((e) => e.media === media),
        `${target.device} has no ${orientation} launch image`,
      );
    }
  }
});

test('a media query pins width, height, density and orientation', () => {
  // All four clauses are load-bearing. Without density the 414×896 devices
  // collide — an iPhone 11 and an XS Max are identical in CSS pixels and
  // differ only in scale — and one of them gets an image at the wrong
  // resolution, which iOS refuses and replaces with a blank screen.
  for (const { media } of splashEntries()) {
    assert.match(media, /\(device-width: \d+px\)/);
    assert.match(media, /\(device-height: \d+px\)/);
    assert.match(media, /\(-webkit-device-pixel-ratio: \d\)/);
    assert.match(media, /\(orientation: (portrait|landscape)\)/);
  }
});

test('no two devices claim the same media query', () => {
  const seen = new Map<string, string>();
  for (const { media, device } of splashEntries()) {
    const already = seen.get(media);
    assert.equal(
      already,
      undefined,
      `${device} and ${already} both match ${media} — one of them will never be used`,
    );
    seen.set(media, device);
  }
});

test('a filename is the image’s real pixel size, and swaps with orientation', () => {
  // iPhone 15 Pro Max: 440×956 at 3x.
  const target = SPLASH_TARGETS.find((t) => t.width === 440 && t.height === 956);
  assert.ok(target, 'the 440×956 device is missing from the list');
  assert.equal(splashFile(target, 'portrait'), '1320x2868.png');
  assert.equal(splashFile(target, 'landscape'), '2868x1320.png');
});

test('the renderer refuses a size nothing legitimate would ask for', () => {
  assert.deepEqual(parseSplashFile('1290x2796.png'), { width: 1290, height: 2796 });

  // The route renders whatever it is asked for, so the bound is what stops
  // a crafted request turning a static route into an expensive one.
  assert.equal(parseSplashFile('99999x99999.png'), null);
  assert.equal(parseSplashFile('10x10.png'), null);
  assert.equal(parseSplashFile('1290x2796.jpg'), null);
  assert.equal(parseSplashFile('../../etc/passwd'), null);
  assert.equal(parseSplashFile('1290x2796.png.png'), null);
});

/* ------------------------------------------------------------------ *
 * Every referenced image must be one the build produces
 * ------------------------------------------------------------------ */

test('the head tags and the generated images come from one list', () => {
  const layout = read('layout.tsx');
  const route = read('splash/[file]/route.tsx');

  // If either side ever hard-codes its own list, these assertions are the
  // thing that notices — thirty-six media queries and thirty-six filenames
  // maintained separately will not stay in agreement for long.
  assert.match(layout, /startupImage:\s*splashEntries\(\)/);
  assert.match(route, /generateStaticParams/);
  assert.match(route, /splashFile\(target, 'portrait'\)/);
  assert.match(route, /splashFile\(target, 'landscape'\)/);

  // Pre-rendered, so nothing is generated on demand in front of somebody
  // who is waiting for an app to open.
  assert.match(route, /export const dynamicParams = false/);
});

/* ------------------------------------------------------------------ *
 * The cover must never reach the open web
 * ------------------------------------------------------------------ */

test('the in-document splash is hidden outside an installed app', () => {
  const css = read('globals.css');
  const block = css.slice(css.indexOf('.splash { display: none; }'));
  assert.ok(block.length > 0, 'the splash styles are missing their default');

  // Hidden by default, and every visible rule inside the standalone query.
  assert.match(css, /\.splash \{ display: none; \}/);

  const standalone = block.indexOf('@media (display-mode: standalone)');
  assert.ok(standalone > 0, 'the splash is not gated on display-mode');

  const positioned = block.indexOf('position: fixed');
  assert.ok(
    positioned > standalone,
    'the full-screen cover is declared outside the standalone guard — it would sit on the marketing pages',
  );
});

test('the splash clears itself even if the application never loads', () => {
  const css = read('globals.css');

  // The ready flag is the normal path.
  assert.match(css, /:root\[data-app-ready\] \.splash/);

  // The timer is the floor. Without it a bundle that fails to load leaves
  // somebody looking at a permanent brand panel instead of the site, which
  // turns every front-end failure into a blank screen.
  assert.match(css, /animation: splash-give-up/);
  assert.match(css, /@keyframes splash-give-up/);

  // Cleared means cleared: it must not keep swallowing taps.
  assert.match(css, /visibility: hidden/);
  assert.match(css, /pointer-events: none/);
});

test('the splash is server-rendered and invisible to assistive technology', () => {
  const splash = read('splash.tsx');
  const layout = read('layout.tsx');

  // In the first bytes of HTML, before the application it is covering.
  assert.ok(
    layout.indexOf('<LaunchSplash />') < layout.indexOf('{children}'),
    'the launch screen renders after the layout it is meant to cover',
  );

  assert.match(splash, /aria-hidden="true"/);
  // Nothing focusable: a decorative layer that can be tabbed into is a trap.
  assert.doesNotMatch(splash, /<button|<a |tabIndex/);
});

test('somebody who asked for less motion still gets the launch screen', () => {
  const css = read('globals.css');
  const reduce = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduce, /\.splash__mark/);
  assert.match(reduce, /animation: none/);
  // Reduced motion removes the movement, never the panel — hiding it would
  // put the blank screen back for the people most likely to be disoriented.
  assert.doesNotMatch(reduce, /\.splash \{[^}]*display: none/);
});
