/**
 * Where Chromium is, resolved once for every browser-driven check.
 *
 * This file exists because of a silent failure, not a preference. Eight
 * scripts each hard-coded `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
 * The build image later shipped chromium-1243 at a differently shaped path
 * (`chrome-linux64`), and every one of those scripts stopped being able to
 * launch a browser. They did not report a product defect — they could not
 * run at all, which is worse, because a check that cannot run looks like a
 * check that found nothing.
 *
 * So the path lives in exactly one place, it prefers the stable symlink the
 * image maintains over any version-numbered directory, and when it cannot
 * find a browser it throws with the reason. A browser-driven check must
 * fail loudly or pass honestly; there is no third outcome.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PW_ROOT = '/opt/pw-browsers';

/** Candidate paths, most stable first. */
function* candidates() {
  // An explicit override always wins, so CI or a developer can point at
  // their own build without editing any script.
  if (process.env.CHROMIUM) yield process.env.CHROMIUM;

  // The symlink the image keeps pointing at the current build. This is the
  // path CLAUDE.md documents, and the only one that survived the version
  // bump that broke the eight hard-coded copies.
  yield join(PW_ROOT, 'chromium');

  // Version-numbered installs, newest first, under either layout Playwright
  // has used (`chrome-linux` before 1243, `chrome-linux64` from 1243).
  let versioned = [];
  try {
    versioned = readdirSync(PW_ROOT)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort(
        (a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]),
      );
  } catch {
    versioned = [];
  }
  for (const dir of versioned) {
    yield join(PW_ROOT, dir, 'chrome-linux64', 'chrome');
    yield join(PW_ROOT, dir, 'chrome-linux', 'chrome');
  }
}

/**
 * The Chromium executable to hand to `chromium.launch({ executablePath })`.
 *
 * Throws rather than returning a guess. Playwright's own error for a
 * missing executable names a path the reader did not choose and cannot
 * find, which sent one earlier debugging session after the wrong problem.
 */
export function chromiumPath() {
  const tried = [];
  for (const path of candidates()) {
    tried.push(path);
    if (existsSync(path)) return path;
  }
  throw new Error(
    'No Chromium found for the browser-driven checks. Tried, in order:\n' +
      tried.map((p) => `  ${p}`).join('\n') +
      '\nSet CHROMIUM to an executable, or install one under ' +
      `${PW_ROOT}. Do not run "playwright install" in this ` +
      'environment — it fetches a build the pinned Playwright will not use.',
  );
}

/** Launch options every check shares, so none of them drifts. */
export function launchOptions(extra = {}) {
  return {
    executablePath: chromiumPath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...extra,
  };
}
