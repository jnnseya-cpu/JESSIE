import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Two holes this suite exists to keep shut.
 *
 * **The raw gateway was open.** `POST /ai/complete` took any agent, any
 * model and up to 128,000 tokens from anyone on the internet, billed to
 * nobody. It was both a way to spend the platform's provider budget and a
 * way around every under-18 protection, since the module endpoints are
 * where the age register and the published refusals live.
 *
 * **The coach was free.** MovaService has always accepted a payer, but the
 * controller never handed it one, so the most-used model call on the
 * platform never touched a wallet. "The ACUs don't go down" was a correct
 * observation about a real defect.
 *
 * These are decorator and wiring facts, which cannot be exercised without
 * standing up Nest, so they are asserted against the source that carries
 * them. A rename that breaks this test is a rename that needs a human.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the raw gateway is staff-only on both routes', () => {
  const source = read('../src/ai/ai.controller.ts');

  const providers = source.slice(source.indexOf("@Get('providers')") - 200, source.indexOf("@Get('providers')"));
  assert.match(providers, /@AdminOnly\(\)/, 'GET /ai/providers must be staff-only');

  const complete = source.slice(source.indexOf("@Post('complete')") - 200, source.indexOf("@Post('complete')"));
  assert.match(complete, /@AdminOnly\(\)/, 'POST /ai/complete must be staff-only');
});

test('a raw completion is charged to the administrator who asked for it', () => {
  const source = read('../src/ai/ai.controller.ts');
  assert.match(source, /billTo: uid/, 'staff use is metered like everyone else');
  assert.match(source, /UnauthorizedException/, 'no session, no completion');
});

test('the coach charges the member who asked', () => {
  const controller = read('../src/mova/mova.controller.ts');
  assert.match(
    controller,
    /this\.mova\.ask\([^)]*this\.billTo\(req\)\)/s,
    'MovaController must hand the service a payer',
  );
  assert.match(controller, /private billTo\(req: Request\)/, 'the payer comes from the session');

  const module = read('../src/mova/mova.module.ts');
  assert.match(module, /AuthModule/, 'the controller cannot read a session without AuthModule');
});

test('FoodLens still charges the member who asked', () => {
  const controller = read('../src/foodlens/foodlens.controller.ts');
  // The payer and the ledger's owner are the same session, resolved once.
  assert.match(controller, /billTo: uid/, 'analysis is billed');
  assert.match(controller, /readBarcode\([^)]*this\.who\(req\)\)/s, 'reading a barcode from a photo is billed');
  assert.match(controller, /private who\(req: Request\)/, 'the payer comes from the session');
});

test('every member-facing model call names a payer', () => {
  // The gateway meters on `billTo`; a call site that omits it is a bill
  // nobody sees. The blog agent is the platform's own cost, not a
  // member's, and is the one deliberate exception.
  const service = read('../src/foodlens/foodlens.service.ts');
  const calls = service.split('this.gateway.complete(').length - 1;
  const billed = service.split('billTo').length - 1;
  assert.ok(calls > 0, 'the module still calls the gateway');
  assert.ok(billed >= calls, `each of the ${calls} calls carries a payer (found ${billed} mentions)`);
});
