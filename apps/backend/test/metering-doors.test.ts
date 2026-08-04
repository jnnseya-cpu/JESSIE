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
  assert.match(controller, /this\.mova\.ask\([^)]*uid\)/s, 'MovaController must hand the service a payer');
  assert.match(controller, /private billTo\(req: Request\)/, 'the payer comes from the session');
  // And a stranger spends the platform's money only within an allowance.
  assert.match(controller, /assertAnonymousAllowance/, 'anonymous use is capped');

  const module = read('../src/mova/mova.module.ts');
  assert.match(module, /AuthModule/, 'the controller cannot read a session without AuthModule');
});

test('FoodLens still charges the member who asked', () => {
  const controller = read('../src/foodlens/foodlens.controller.ts');
  /*
   * The payer and the ledger's owner used to be the same value, so the
   * bill was `billTo: uid` and an anonymous scan carried no payer at all.
   * They have come apart: the ledger still belongs to the member (a
   * visitor has no ledger), while the bill always resolves to somebody —
   * the member, or the platform's own trial budget.
   */
  assert.match(controller, /billTo: this\.payer\(req\)/, 'analysis is billed to somebody, always');
  assert.match(controller, /this\.foodlens\.readBarcode\([^)]*uid\)/s, 'reading a barcode from a photo is billed');
  assert.match(controller, /guardAnonymous\(req, uid, 'foodlens\.analyze'\)/, 'anonymous analysis is capped');
  assert.match(controller, /private who\(req: Request\)/, 'the payer comes from the session');
});

test('every member-facing model call names a payer', () => {
  // The gateway now refuses a call that names no payer, so there is no
  // longer any exception to this — the blog agent, which used to be the
  // deliberate one, bills the platform's own editorial budget.
  const service = read('../src/foodlens/foodlens.service.ts');
  const calls = service.split('this.gateway.complete(').length - 1;
  const billed = service.split('billTo').length - 1;
  assert.ok(calls > 0, 'the module still calls the gateway');
  assert.ok(billed >= calls, `each of the ${calls} calls carries a payer (found ${billed} mentions)`);
});

test('the destructive and the personal routes are behind a door', () => {
  const cases: [string, string, RegExp][] = [
    ['../src/accounts/accounts.controller.ts', "@Post('reset')", /@AdminOnly\(\)\s*\n\s*@Post\('reset'\)/],
    ['../src/accounts/accounts.controller.ts', "@Post('seed')", /@AdminOnly\(\)\s*\n\s*@Post\('seed'\)/],
    ['../src/accounts/accounts.controller.ts', "@Get('profiles')", /@AdminOnly\(\)\s*\n\s*@Get\('profiles'\)/],
    ['../src/accounts/accounts.controller.ts', "@Delete('profiles/:userId')", /@AdminOnly\(\)\s*\n\s*@Delete\('profiles\/:userId'\)/],
    ['../src/mail/mail.controller.ts', "@Get('recent')", /@AdminOnly\(\)\s*\n\s*@Get\('recent'\)/],
    ['../src/comms/comms.controller.ts', "@Get('deliveries')", /@AdminOnly\(\)\s*\n\s*@Get\('deliveries'\)/],
    ['../src/acu/acu.controller.ts', "wallets/:id/topup", /@AdminOnly\(\)\s*\n\s*@Post\('wallets\/:id\/topup'\)/],
    ['../src/acu/acu.controller.ts', "wallets/:id/subscription", /@AdminOnly\(\)\s*\n\s*@Post\('wallets\/:id\/subscription'\)/],
    ['../src/acu/acu.controller.ts', "wallets/:id/spend", /@AdminOnly\(\)\s*\n\s*@Post\('wallets\/:id\/spend'\)/],
    ['../src/acu/acu.controller.ts', "balance/:userId", /@SelfOnly\('userId'\)\s*\n\s*@Get\('balance\/:userId'\)/],
    ['../src/wearables/wearables.controller.ts', "status/:userId", /@SelfOnly\('userId'\)\s*\n\s*@Get\('status\/:userId'\)/],
    ['../src/movements/movements.controller.ts', 'publish', /@AdminOnly\(\)\s*\n\s*@Post\(':id\/publish'\)/],
    ['../src/growth/growth.controller.ts', 'payout', /@AdminOnly\(\)\s*\n\s*@Post\('payout'\)/],
    ['../src/blog/blog.controller.ts', 'agent/draft', /@AdminOnly\(\)\s*\n\s*@Post\('agent\/draft'\)/],
  ];
  for (const [file, what, pattern] of cases) {
    assert.match(read(file), pattern, `${what} in ${file} must not be open to a stranger`);
  }
});

test('a stranger can try the paid features, within an allowance', () => {
  const abuse = read('../src/auth/abuse.service.ts');
  assert.match(abuse, /ANONYMOUS_DAILY_LIMIT/);
  assert.match(abuse, /statusCode: 429/, 'the refusal is a rate limit, not an error');

  const foodlens = read('../src/foodlens/foodlens.controller.ts');
  assert.match(foodlens, /guardAnonymous\(req, uid, 'foodlens\.analyze'\)/);
  assert.match(foodlens, /guardAnonymous\(req, uid, 'foodlens\.barcode\.read'\)/);
  assert.match(read('../src/mova/mova.controller.ts'), /assertAnonymousAllowance/);
});

test('a webhook event is claimed before it is acted on', () => {
  // Read-then-write let two concurrent deliveries of one payment both
  // grant an allowance. The unique key was always the lock; it was being
  // taken too late.
  const service = read('../src/stripe/stripe.service.ts');
  assert.match(service, /private async claim\(/);
  assert.match(service, /ON CONFLICT \(event_id\) DO UPDATE/s, 'the insert is the claim');
  assert.match(service, /RETURNING event_id/s, 'and it reports whether it won');
  assert.match(service, /await this\.release\(id\)/, 'work that throws gives the claim back');
  assert.ok(!/wasSeen/.test(service), 'the read-then-write path is gone');
});
