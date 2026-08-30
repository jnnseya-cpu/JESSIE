/**
 * Finds specification that is declared and never runs.
 *
 * This repository keeps its business truth in `packages/*` — pricing,
 * policies, registries, limits — and the application imports it. That is
 * the right shape, and it has one failure mode: a constant or a function
 * can be written, exported, documented in a paragraph, and then never
 * imported by anything. It looks like a rule. It is a comment.
 *
 * The audit found five of these, and every one was a real defect:
 *
 *   ACU_TOPUP_TIERS       published a volume bonus that was never granted
 *   PAST_DUE_GRACE_DAYS   a grace period that never expired, so past_due
 *                         was permanent entitlement on a dead card
 *   depositAnnualMonth    written for annual plans, called by nothing, so
 *                         a year's allowance landed on day one
 *   entitled()            an entitlement check nothing consulted
 *   autoTopUpDue          an automatic top-up nothing could trigger
 *
 * Nothing in the toolchain reports this. There is no linter here, and a
 * linter would not catch it anyway — the export is used, by the barrel
 * file that re-exports it.
 *
 *   node scripts/find-unwired.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where specification lives, and where it has to be used to count. */
const SPEC_DIRS = [
  'packages/shared/src',
  'packages/body-command/src',
  'packages/foodlens/src',
];
const CONSUMER_GLOBS = ['apps/backend/src', 'apps/frontend/app', 'packages'];

const listFiles = (dir) =>
  execFileSync('find', [join(root, dir), '-name', '*.ts', '-o', '-name', '*.tsx'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

/**
 * Exported names, by file.
 *
 * Deliberately does not collect types and interfaces. A type that is only
 * used to type something is doing its whole job; an unused one is untidy,
 * not a lie about behaviour. What matters here is values — constants and
 * functions that claim the system does something.
 */
function exportsIn(file) {
  const src = readFileSync(file, 'utf8');
  const names = [];
  const patterns = [
    /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+const\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+class\s+([A-Za-z_$][\w$]*)/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) names.push(m[1]);
  }
  return names;
}

/** Every use of a name outside the file that declares it and outside tests. */
function usedElsewhere(name, declaringFile) {
  let out = '';
  try {
    out = execFileSync(
      'grep',
      [
        '-rw',
        '--include=*.ts',
        '--include=*.tsx',
        '-l',
        name,
        ...CONSUMER_GLOBS.map((d) => join(root, d)),
      ],
      { encoding: 'utf8' },
    );
  } catch {
    return [];
  }

  return out
    .split('\n')
    .filter(Boolean)
    .map((p) => relative(root, p))
    .filter((p) => !p.endsWith(relative(root, declaringFile)))
    .filter((p) => !/\.test\.tsx?$/.test(p))
    .filter((p) => !/\/dist\//.test(p))
    // A barrel re-export is not a use. `export * from './billing'` makes
    // every symbol in the file look consumed, which is exactly how this
    // rot stayed invisible.
    .filter((p) => !/(^|\/)index\.ts$/.test(p));
}

/** Every mention of a name anywhere, including tests and its own file. */
function allMentions(name) {
  try {
    return execFileSync(
      'grep',
      ['-rw', '--include=*.ts', '--include=*.tsx', '-l', name, join(root, 'apps'), join(root, 'packages')],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .map((p) => relative(root, p))
      .filter((p) => !/\/dist\//.test(p));
  } catch {
    return [];
  }
}

/**
 * Three buckets, because they are three different problems.
 *
 * `dead`     nothing anywhere refers to it. It is a leftover.
 * `testOnly` only a test refers to it. This is the dangerous one: the
 *            test makes the rule look covered while the product never
 *            consults it. Every defect in the list above was this shape.
 * `internal` used inside its own module and exported anyway. Untidy at
 *            worst — the export is a contract for tests or for a future
 *            caller, and it is not a claim that something runs.
 */
const dead = [];
const testOnly = [];
const internal = [];

for (const dir of SPEC_DIRS) {
  for (const file of listFiles(dir)) {
    const rel = relative(root, file);
    if (/\.test\.tsx?$/.test(rel)) continue;

    const ownFile = readFileSync(file, 'utf8');

    for (const name of exportsIn(file)) {
      if (usedElsewhere(name, file).length > 0) continue;

      const mentions = allMentions(name);
      const inTests = mentions.filter((p) => /\.test\.tsx?$/.test(p));

      // Two mentions inside its own file means the declaration plus a use.
      const usesInOwnFile =
        (ownFile.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) ?? []).length > 1;

      if (usesInOwnFile) internal.push({ name, file: rel, tests: inTests.length });
      else if (inTests.length > 0) testOnly.push({ name, file: rel, tests: inTests });
      else dead.push({ name, file: rel });
    }
  }
}

const findings = [...dead, ...testOnly];

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const group = (rows) => {
  const byFile = new Map();
  for (const r of rows) {
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r.name);
  }
  for (const [file, names] of [...byFile.entries()].sort()) {
    console.log(`  ${file}`);
    console.log(`      ${names.sort().join(', ')}`);
  }
};

console.log('\nSpecification that does not run\n');

console.log(`A. ASSERTED BY A TEST, CONSULTED BY NOTHING — ${testOnly.length}`);
console.log('   The rule looks covered. The product never reads it. Every');
console.log('   defect this scanner was written for had exactly this shape.\n');
if (testOnly.length) group(testOnly);
else console.log('  none\n');

console.log(`\nB. REFERRED TO NOWHERE AT ALL — ${dead.length}`);
console.log('   Not even a test. A leftover, or a rule nobody finished.\n');
if (dead.length) group(dead);
else console.log('  none\n');

console.log(`\nC. USED ONLY INSIDE ITS OWN MODULE — ${internal.length}`);
console.log('   Exported for a test or a future caller. Untidy at worst: it');
console.log('   does not claim that anything runs. Not listed.\n');

console.log(`\n  ${findings.length} to decide (A + B), ${internal.length} benign (C)\n`);
console.log('  Each is a decision, not automatically a defect:');
console.log('    wire it     — the rule was meant to run and does not');
console.log('    delete it   — it is not a rule, it is a leftover');
console.log('    keep it     — it is a published contract, and the reason');
console.log('                  belongs in a comment above it\n');

/*
 * `--json` writes the machine-readable form the baseline test compares
 * against. Seventy-seven items are not a change anybody should make in
 * one commit — the useful guarantee is that the number goes down and
 * never up, which is what the baseline enforces.
 */
if (process.argv.includes('--json')) {
  const out = {
    testOnly: testOnly.map((f) => `${f.file}:${f.name}`).sort(),
    dead: dead.map((f) => `${f.file}:${f.name}`).sort(),
  };
  console.log(JSON.stringify(out, null, 2));
}

process.exit(0);
