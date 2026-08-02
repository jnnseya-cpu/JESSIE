/*
 * Writes src/build-info.ts with the commit this build was made from.
 *
 * Runtime environment variables are the obvious way to do this, and they
 * are not reliable: whether a platform exposes its git metadata to a
 * running function is a platform decision that changes. Stamping the value
 * into the build makes the answer a fact about the artefact rather than a
 * fact about where it happens to be running.
 *
 * Why it matters at all: a long stretch of this project was spent on a
 * fault whose entire answer was "the code you are reading is not the code
 * that is deployed" — a build that failed silently, a service worker
 * serving a bundle from weeks earlier. One request should be able to
 * settle that, and now one can.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', 'src', 'build-info.ts');

function commit() {
  const fromPlatform = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA;
  if (fromPlatform) return fromPlatform;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function branch() {
  const fromPlatform = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.GIT_BRANCH;
  if (fromPlatform) return fromPlatform;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const sha = commit();
const literal = (value) => (value === null ? 'null' : JSON.stringify(value));

writeFileSync(
  output,
  `/**
 * GENERATED FILE — do not edit. Written by scripts/stamp-build.mjs on every
 * build, so /health can say which commit is actually answering.
 */

export const BUILD_COMMIT: string | null = ${literal(sha)};
export const BUILD_BRANCH: string | null = ${literal(branch())};
export const BUILT_AT: string = ${JSON.stringify(new Date().toISOString())};
`,
);

console.log(`build stamped ${sha?.slice(0, 7) ?? 'unknown'} -> ${output}`);
