/**
 * The shelf scanner's basket request, checked against the endpoint that
 * receives it.
 *
 * This file exists because of a break that shipped. Tightening
 * `BasketProductDto` to close a validation hole was correct, and it was
 * verified against eight malformed payloads and one valid one — none of
 * which was the payload the scanner actually sends. The frontend spread
 * the whole scan object, so `found`, `brand`, `note` and the allergen
 * fields went too, and `forbidNonWhitelisted` refused the lot. Every
 * real shop got a 400 and no trolley totals at all, which from the
 * outside looked like the basket feature simply not existing.
 *
 * The same commit made the four front-of-pack figures required on
 * `Per100gDto`, directly under a comment arguing that a required field
 * turns a partial label into a rejected scan. A record with fat but no
 * salt — ordinary on fresh and own-brand lines — was rejected outright.
 *
 * Neither defect was reachable by a unit test of either side. Both are
 * reachable by comparing the two files, which is what this does: the
 * keys one sends against the keys the other declares. A contract held by
 * two files that never meet is not a contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..', '..', '..');
const DTO = readFileSync(
  join(REPO, 'apps', 'backend', 'src', 'foodlens', 'foodlens.dto.ts'),
  'utf8',
);
const SCANNER = readFileSync(
  join(REPO, 'apps', 'frontend', 'app', 'account', 'scanner.tsx'),
  'utf8',
);

/** The properties a DTO class declares, by name. */
function propertiesOf(source: string, className: string): string[] {
  const start = source.indexOf(`export class ${className} {`);
  assert.ok(start > 0, `${className} is not in foodlens.dto.ts`);
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^\s{2}(\w+)[?!]?:/gm)].map((m) => m[1]!);
}

/** The object literal the scanner posts to /foodlens/basket. */
function basketPayloadKeys(): string[] {
  const marker = '.map((s) => ({';
  const start = SCANNER.indexOf(marker);
  assert.ok(start > 0, 'the scanner no longer builds its basket payload as a literal');
  const body = SCANNER.slice(start, SCANNER.indexOf('      }));', start));
  return [...body.matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]!);
}

test('the scan found both sides of the contract', () => {
  /*
   * Asserted before anything is compared. Two empty lists match
   * perfectly and prove nothing, and that is the shape this repository
   * has produced five times.
   */
  const declared = propertiesOf(DTO, 'BasketProductDto');
  const sent = basketPayloadKeys();
  assert.ok(declared.length >= 5, `BasketProductDto declares ${declared.length} properties`);
  assert.ok(sent.length >= 5, `the scanner sends ${sent.length} fields`);
});

test('every field the scanner sends is one the endpoint accepts', () => {
  /*
   * The endpoint validates a closed shape, correctly — an unknown
   * property is refused rather than ignored. That makes this a hard
   * contract rather than a convention, and the cost of breaking it is a
   * total outage of the feature rather than a degraded one.
   */
  const declared = new Set(propertiesOf(DTO, 'BasketProductDto'));
  const sent = basketPayloadKeys();
  const rejected = sent.filter((key) => !declared.has(key));
  assert.deepEqual(
    rejected,
    [],
    'the scanner sends fields BasketProductDto will refuse, so every real ' +
      'scan would return 400: ' + rejected.join(', '),
  );
});

test('a partial nutrition panel is accepted, because labels are partial', () => {
  /*
   * All seven per-100g figures must be optional. A record carrying fat
   * and nothing else is a normal record, and the downstream arithmetic
   * already handles a missing figure by leaving it out of the total and
   * counting the item in `weighed`.
   */
  const start = DTO.indexOf('export class Per100gDto {');
  const body = DTO.slice(start, DTO.indexOf('\n}', start));
  const required = [...body.matchAll(/^\s{2}(?!\/)(?:@\w+\([^)]*\)\s*)*(\w+)!:/gm)].map(
    (m) => m[1]!,
  );
  assert.deepEqual(
    required,
    [],
    'these per-100g figures are required, so a label missing any one of them ' +
      'is rejected outright: ' + required.join(', '),
  );

  for (const field of ['fatG', 'saturatesG', 'sugarsG', 'saltG', 'proteinG', 'carbohydrateG', 'fibreG']) {
    assert.ok(
      new RegExp(`${field}\\?:`).test(body),
      `${field} is not optional on Per100gDto`,
    );
  }
});

test('the analyze input and the shared logic agree that a panel is partial', () => {
  /*
   * The two sides disagreed: `foodlens.logic.ts` typed this as a
   * `Partial` and the service required all four, so the stricter side
   * decided, and it was the one nobody read. Both must be partial or the
   * DTO above cannot be.
   */
  const service = readFileSync(
    join(REPO, 'apps', 'backend', 'src', 'foodlens', 'foodlens.service.ts'),
    'utf8',
  );
  const strict = /per100g\?:\s*\{\s*fatG: number;/.test(service);
  assert.equal(
    strict,
    false,
    'foodlens.service.ts requires all four front-of-pack figures again, which ' +
      'makes a partial label unanalysable',
  );
});

test('the four readings reach the basket, or the shop view is decoration', () => {
  /*
   * The per-item readings are what make the trolley view worth having:
   * one ultra-processed item is not a finding, and nine out of eleven
   * is. If the scanner stops sending them the basket still works and
   * quietly reports nothing, which is the failure mode worth a test.
   */
  const sent = new Set(basketPayloadKeys());
  for (const field of ['nutriGrade', 'novaGroup', 'additives', 'origins']) {
    assert.ok(sent.has(field), `the scanner no longer sends ${field} to the basket`);
  }
});
