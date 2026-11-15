/**
 * Where `"type": "module"` may be declared, and where it must not.
 *
 * Every test run used to print MODULE_TYPELESS_PACKAGE_JSON about seventy
 * times — once per file Node parsed as CommonJS, failed on, and reparsed
 * as ESM, with the warning noting the cost each time. The noise was the
 * smaller half: a warning that always fires is a warning nobody reads,
 * and this one sat above every test result in the log, which is exactly
 * where a real warning would have to compete with it.
 *
 * Node's own advice is to add `"type": "module"` to the package's
 * package.json. **Taking that advice breaks the application.** The
 * backend compiles to CommonJS in `dist/` and the API loads it with
 * `require()`; declaring the backend package ESM makes every file in
 * `dist/` an ES module and the server stops starting. The failure is at
 * boot, in production, and the change that causes it looks like
 * housekeeping.
 *
 * So the declaration is scoped to the directories holding `.ts` sources
 * and tests, where Node's nearest-package.json lookup finds it and the
 * compiled output does not. This file holds that arrangement in place
 * from both sides: the scoped files must exist, and the package roots
 * that compile to CommonJS must stay silent about their type.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..');
const read = (...parts: string[]) =>
  JSON.parse(readFileSync(join(REPO, ...parts), 'utf8')) as Record<string, unknown>;

/** Directories whose `.ts` files Node loads directly, under type stripping. */
const SCOPED = [
  ['apps', 'backend', 'src'],
  ['apps', 'backend', 'test'],
  ['packages', 'shared', 'src'],
  ['packages', 'foodlens', 'src'],
  ['packages', 'foodlens', 'test'],
  ['packages', 'body-command', 'src'],
  ['packages', 'body-command', 'test'],
];

/** Packages that compile to CommonJS and are loaded with `require()`. */
const COMMONJS_PACKAGES = [
  ['apps', 'backend'],
  ['packages', 'shared'],
  ['packages', 'foodlens'],
  ['packages', 'body-command'],
];

test('every directory Node loads TypeScript from declares itself ESM', () => {
  const missing: string[] = [];
  for (const parts of SCOPED) {
    const path = join(REPO, ...parts, 'package.json');
    if (!existsSync(path)) {
      missing.push(parts.join('/'));
      continue;
    }
    const manifest = read(...parts, 'package.json');
    if (manifest.type !== 'module') missing.push(`${parts.join('/')} (type is not module)`);
  }
  assert.deepEqual(
    missing,
    [],
    'these directories will emit MODULE_TYPELESS_PACKAGE_JSON on every run: ' +
      missing.join(', '),
  );
});

test('a scoped marker is not a package, so pnpm will not adopt it', () => {
  /*
   * The workspace globs are `apps/*` and `packages/*`, so none of these
   * paths is matched — but a `name` would make one look like a package
   * to anything that walks the tree, and a `version` would invite
   * somebody to publish it.
   */
  for (const parts of SCOPED) {
    const manifest = read(...parts, 'package.json');
    assert.equal(manifest.name, undefined, `${parts.join('/')} has a name`);
    assert.equal(manifest.version, undefined, `${parts.join('/')} has a version`);
    assert.ok(
      manifest['//'],
      `${parts.join('/')} carries no explanation, and a bare package.json in a ` +
        'source directory is the kind of thing somebody deletes as debris',
    );
  }
});

test('no package that compiles to CommonJS declares itself ESM', () => {
  /*
   * The load-bearing assertion. Adding `"type": "module"` to any of
   * these is the fix Node suggests and it breaks the API at boot: the
   * compiled output in `dist/` is CommonJS, and the package root is the
   * nearest package.json that `dist/` resolves to.
   */
  const broken: string[] = [];
  for (const parts of COMMONJS_PACKAGES) {
    const manifest = read(...parts, 'package.json');
    if (manifest.type === 'module') broken.push(parts.join('/'));
  }
  assert.deepEqual(
    broken,
    [],
    'these packages compile to CommonJS and are loaded with require(), so ' +
      'declaring them ESM stops the server starting: ' + broken.join(', '),
  );
});

test('the build still emits CommonJS, whatever the source directories say', () => {
  /*
   * The scoped markers must not reach the compiler's output. `tsc` emits
   * the module format in `tsconfig.base.json`, and `moduleResolution:
   * node` does not read `type` at all — but that is an argument, and
   * this is a check.
   */
  const base = read('tsconfig.base.json');
  const options = base.compilerOptions as Record<string, unknown>;
  assert.equal(options.module, 'commonjs');
  assert.equal(
    options.moduleResolution,
    'node',
    'a resolver that reads package.json "type" would make the scoped ' +
      'markers change how the build resolves imports',
  );

  // And nothing copies them into dist.
  for (const parts of COMMONJS_PACKAGES) {
    const stray = join(REPO, ...parts, 'dist', 'package.json');
    assert.ok(
      !existsSync(stray),
      `${parts.join('/')}/dist/package.json exists — a marker was copied into ` +
        'the build output, which would make the compiled CommonJS unloadable',
    );
  }
});
