/*
 * Writes public/sw.js from public/sw.template.js with this build's identity
 * stamped into the cache version.
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
