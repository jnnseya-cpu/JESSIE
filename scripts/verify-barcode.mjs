/**
 * The barcode lookup, against the real database.
 *
 * Everything else about the shelf scanner is proven without a network:
 * the algorithm has twenty-three tests, the readings are checked against
 * realistic record shapes, and the contract between the scanner and the
 * basket endpoint is compared file to file. None of that touches Open
 * Food Facts, and one thing can only be checked there.
 *
 * The lookup asks for named fields. If a field name is wrong — renamed
 * upstream, mistyped here — the API does not complain. It returns the
 * product without that field, the reading comes back "not declared", and
 * the scanner looks like it is working on a record that happens to be
 * sparse. Every product, silently, for as long as nobody checks.
 *
 * That is what this script checks: that each field asked for actually
 * arrives, on products known to carry it. It is deliberately not part of
 * `pnpm test` — a unit suite that depends on a third party's uptime
 * fails for reasons that have nothing to do with the code.
 *
 *   node scripts/verify-barcode.mjs
 *
 * It cannot run on the build machine: outbound HTTPS to
 * world.openfoodfacts.org is refused by the environment's network policy
 * (`CONNECT tunnel failed, 403`). It says so and exits 2 rather than
 * reporting a pass it did not earn.
 */
import { toLabelFacts } from '../apps/backend/dist/foodlens/barcode.logic.js';

const API = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS =
  'product_name,brands,quantity,nutriments,allergens_tags,ingredients_text,' +
  'nova_group,additives_tags,origins,manufacturing_places,countries,' +
  'nutriscore_grade,categories_tags';

/*
 * Long-standing products, chosen because each is certain to carry the
 * field it is here to prove. Named rather than numbered so a failure
 * says which product, and a product that has been delisted since is a
 * legible failure rather than a mystery.
 */
const PRODUCTS = [
  { barcode: '3017620422003', what: 'a spread', expect: ['nutriments', 'nova_group', 'additives_tags', 'nutriscore_grade'] },
  { barcode: '5449000000996', what: 'a cola', expect: ['nutriments', 'categories_tags', 'additives_tags'] },
  { barcode: '8076809513692', what: 'an Italian pantry item', expect: ['nutriments', 'categories_tags'] },
];

let pass = 0;
let fail = 0;
const failures = [];
const ok = (what, extra = '') => {
  pass += 1;
  console.log(`  ok    ${what}${extra ? ` — ${extra}` : ''}`);
};
const bad = (what, extra = '') => {
  fail += 1;
  failures.push(`${what}${extra ? ` — ${extra}` : ''}`);
  console.log(`  FAIL  ${what}${extra ? ` — ${extra}` : ''}`);
};

console.log('\nBARCODE LOOKUP — against the real database');
console.log(`  ${PRODUCTS.length} products, ${FIELDS.split(',').length} fields each\n`);

for (const { barcode, what, expect } of PRODUCTS) {
  let body;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${API}/${barcode}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { 'user-agent': 'JessMove/1.0 (verification; contact jess@jessmove.com)' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      bad(`${what} (${barcode})`, `HTTP ${res.status}`);
      continue;
    }
    body = await res.json();
  } catch (error) {
    const why = String(error.message ?? error);
    if (/CONNECT|ENOTFOUND|EAI_AGAIN|fetch failed|403/i.test(why)) {
      console.log(
        '\n  NOT RUN  This machine cannot reach world.openfoodfacts.org.\n' +
          `           ${why}\n` +
          '           That is the environment network policy, not a fault in\n' +
          '           the lookup, and not a pass. Run this from somewhere with\n' +
          '           outbound access before trusting the shelf scanner against\n' +
          '           real products.\n',
      );
      process.exit(2);
    }
    bad(`${what} (${barcode})`, why);
    continue;
  }

  if (body.status !== 1 || !body.product) {
    bad(`${what} (${barcode})`, 'the database has no record for this barcode any more');
    continue;
  }

  const product = body.product;
  const absent = expect.filter((field) => {
    const value = product[field];
    return value == null || (Array.isArray(value) && value.length === 0);
  });
  if (absent.length > 0) {
    bad(
      `${what} (${barcode})`,
      `asked for ${absent.join(', ')} and the response carried ${absent.length === 1 ? 'none of it' : 'none of them'}. ` +
        'Either the field was renamed upstream or it is mistyped in barcode.service.ts — ' +
        'a wrong field name returns no error, just an empty reading on every product.',
    );
    continue;
  }
  ok(`${what} (${barcode}) carried every field asked for`);

  /*
   * And the mapping, on real data. A field arriving is not the same as
   * the code reading it: this is the step that would catch a shape
   * assumption that only holds for the fixtures.
   */
  const facts = toLabelFacts(barcode, product);
  const readings = [
    facts.nutriScore ? `Nutri-Score ${facts.nutriScore.grade} on the ${facts.nutriCategory} table` : 'no Nutri-Score (panel incomplete)',
    facts.shelf.processing.group ? `NOVA ${facts.shelf.processing.group}` : 'no processing group',
    `${facts.shelf.additives.count} additives`,
    `${facts.shelf.axesRead}/3 non-nutrition axes read`,
  ];
  console.log(`        ${readings.join(' · ')}`);
  console.log(`        ${facts.nutriAgreement.says}`);

  if (facts.shelf.additives.unrecognised.length > 0) {
    // Not a failure: the registry is a named subset and says so. Worth
    // printing, because a long list here is the signal to extend it.
    console.log(`        not in the registry: ${facts.shelf.additives.unrecognised.join(', ')}`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail) {
  console.log('  Failures:');
  for (const f of failures) console.log(`    ${f}`);
  process.exit(1);
}
