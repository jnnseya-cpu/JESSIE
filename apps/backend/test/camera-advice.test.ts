import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  cameraBlockedMessage,
  permissionRoute,
  type Device,
} from '../../frontend/app/account/camera-advice.ts';

/**
 * The advice that sent somebody to a screen with nothing on it.
 *
 * It read: long-press the JESS MOVE icon → App info → Permissions →
 * Camera → Allow. On Android an installed web app borrows the browser's
 * permission and has no camera setting of its own, so App info shows an
 * empty list. Somebody following that instruction concludes the app is
 * broken, and from where they are standing it is.
 */

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36';

const device = (installed: boolean, userAgent: string): Device => ({ installed, userAgent });

test('an installed Android app is sent to the browser, where the setting really is', () => {
  const advice = permissionRoute(device(true, ANDROID));
  assert.match(advice, /Site settings/);
  assert.match(advice, /Camera/);
  assert.match(advice, /jessmove\.com/);
  assert.match(advice, /has no camera setting of its own/, 'and told why App info is empty');
});

test('nothing anywhere sends anybody to App info any more', () => {
  for (const d of [
    device(true, ANDROID),
    device(false, ANDROID),
    device(true, IPHONE),
    device(false, IPHONE),
    device(true, DESKTOP),
    device(false, DESKTOP),
  ]) {
    assert.ok(!/App info/i.test(permissionRoute(d)), `App info survives for ${d.userAgent.slice(0, 20)}`);
    assert.ok(!/App info/i.test(cameraBlockedMessage(d)));
  }
});

test('an installed iPhone app does have its own setting, and is told so', () => {
  assert.match(permissionRoute(device(true, IPHONE)), /Settings → JESS MOVE → Camera/);
});

test('a browser tab is sent to the address bar, not to a home-screen icon', () => {
  assert.match(permissionRoute(device(false, ANDROID)), /left of the web address/);
  assert.ok(!/home screen/i.test(permissionRoute(device(false, ANDROID))));
  assert.match(permissionRoute(device(false, DESKTOP)), /address-bar/);
});

test('every message leads with the answer, not the obstacle', () => {
  for (const d of [device(true, ANDROID), device(true, IPHONE), device(false, DESKTOP)]) {
    const message = cameraBlockedMessage(d);
    // The first sentence must be the way out, not a lecture on permissions.
    const first = message.split(/[.—]/)[0] ?? '';
    assert.match(first, /^Photograph a barcode/, `opened with: ${first}`);
    assert.match(message, /Photograph a barcode/);
    assert.match(message, /Add several at once/, 'the bulk path is offered too');
    // And the menu route is present but last, for the few who want it.
    assert.ok(
      message.indexOf('Photograph a barcode') < message.lastIndexOf('rather have live scanning back'),
      'the route comes after the answer',
    );
  }
});

test('the scanner never offers a permission the browser has already refused', () => {
  const source = readFileSync(new URL('../../frontend/app/account/scanner.tsx', import.meta.url), 'utf8');
  assert.match(source, /navigator\.permissions\?\.query/, 'the state is asked for up front');
  assert.match(source, /cameraState !== 'denied'/, 'and a refused camera is not offered');
  assert.match(source, /addSeveralPhotos/, 'a whole trolley can be added at once');
  assert.match(source, /input\.multiple = true/, 'from several photographs in one go');
});

test('the scanner leads with the way that always works', () => {
  const source = readFileSync(new URL('../../frontend/app/account/scanner.tsx', import.meta.url), 'utf8');
  const photograph = source.indexOf('Photograph a barcode');
  const live = source.indexOf('Scan continuously');
  assert.ok(photograph > 0 && live > photograph, 'the photograph button comes first on the page');
  assert.match(source, /btn btn--primary[^]*Photograph a barcode/, 'and it is the primary button');
  assert.match(source, /!liveRefused/, 'a refused camera stops being offered');
});
