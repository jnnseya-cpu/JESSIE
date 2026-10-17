/*
 * Writes public/sw.js from public/sw.template.js with this build's identity
 * stamped into the cache version, and app/build-info.ts with the same
 * identity so a page can say which build is answering.
 *
 * Why this exists: a browser reinstalls a service worker only when the
 * worker's own bytes differ from the copy it already has. A hand-maintained
 * `VERSION = 'jm-v3'` is byte-identical on every deploy, so the update is
 * never noticed, `activate` never runs, and the shell and asset caches from
 * an old release keep being served — the app on the phone stays on old
 * JavaScript indefinitely, which looks exactly like features disappearing.
 *
 * The stamp is the commit Vercel is building. Locally it falls back to the
 * working tree's HEAD, and finally to the file's own modification time, so
 * this never fails a build.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const template = join(here, '..', 'public', 'sw.template.js');
const output = join(here, '..', 'public', 'sw.js');

function buildId() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return `t${Math.floor(statSync(template).mtimeMs)}`;
  }
}

const id = buildId();
const source = readFileSync(template, 'utf8');
if (!source.includes('__JM_BUILD__')) {
  throw new Error('sw.template.js has no __JM_BUILD__ marker — the stamp would be a no-op');
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, source.replace(/__JM_BUILD__/g, `jm-${id}`));
console.log(`service worker stamped jm-${id} -> ${output}`);

/*
 * The same identity, where a page can read it.
 *
 * `/status` already reports the commit the API answers on, because the
 * backend stamps itself. The site did not stamp itself, so there was no
 * way to tell whether jessmove.com was serving this week's build or one
 * from two months ago — which is the exact question "nothing is live"
 * asks, and it had no answer anybody could look up.
 *
 * Stamped into a file rather than read from the platform at runtime, for
 * the reason the backend does the same: whether a host exposes its git
 * metadata to a running process is the host's decision and it changes.
 * A value compiled into the artefact is a fact about the artefact.
 */
const buildInfo = join(here, '..', 'app', 'build-info.ts');
writeFileSync(
  buildInfo,
  `/**
 * GENERATED FILE — do not edit. Written by scripts/stamp-sw.mjs on every
 * build, so /status can say which build of the site is answering.
 */

export const SITE_COMMIT: string = ${JSON.stringify(id)};
export const SITE_BUILT_AT: string = ${JSON.stringify(new Date().toISOString())};
`,
);
console.log(`site stamped ${id} -> ${buildInfo}`);
