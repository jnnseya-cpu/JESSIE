import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_READING_DAYS, WINDOW_DAYS } from '../src/activity/activity.logic.ts';
import {
  alongsideFrom,
  trendFrom,
  warningsFor,
} from '../src/body/progress.logic.ts';

test('one reading is a fact; two make a direction', () => {
  assert.equal(trendFrom([]).direction, 'unknown');
  const one = trendFrom([{ day: '2026-08-01', kg: 90 }]);
  assert.equal(one.kgPerWeek, null);
  assert.match(one.says, /One reading is a fact/);

  const two = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-15', kg: 88.6 },
  ]);
  assert.equal(two.direction, 'down');
  assert.equal(two.changeKg, -1.4);
  assert.equal(two.kgPerWeek, -0.7, '1.4kg over 14 days is 0.7 a week');
});

test('losing faster than one per cent of body weight a week is cautioned', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-08', kg: 88.5 },
  ]);
  const warnings = warningsFor({ age: 40, bmi: 29, trend, latestKg: 88.5 });
  const caution = warnings.find((w) => w.level === 'caution');
  assert.ok(caution, 'a 1.7% weekly loss must be cautioned');
  assert.match(caution!.says, /sustainable/);
  assert.match(caution!.action, /Eat a little more/);

  // A steady, sustainable rate says nothing at all.
  const gentle = trendFrom([
    { day: '2026-08-01', kg: 90 },
    { day: '2026-08-15', kg: 89.3 },
  ]);
  assert.equal(
    warningsFor({ age: 40, bmi: 29, trend: gentle, latestKg: 89.3 }).some((w) => w.level === 'caution'),
    false,
  );
});

test('a BMI below the healthy range stops reduction outright', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 52 },
    { day: '2026-08-15', kg: 51.6 },
  ]);
  const warnings = warningsFor({ age: 30, bmi: 17.4, trend, latestKg: 51.6 });
  const stop = warnings.find((w) => w.level === 'stop');
  assert.ok(stop);
  assert.match(stop!.says, /will not run a weight-reduction plan/);
  assert.match(stop!.action, /GP or a dietitian/);
});

test('under 18 there are no weight warnings of any kind', () => {
  const trend = trendFrom([
    { day: '2026-08-01', kg: 60 },
    { day: '2026-08-08', kg: 57 },
  ]);
  // The same trend that would raise a caution for an adult.
  assert.deepEqual(warningsFor({ age: 15, bmi: 17, trend, latestKg: 57 }), []);
  assert.ok(warningsFor({ age: 18, bmi: 17, trend, latestKg: 57 }).length > 0);
});

test('every warning carries an action, because worry without one is useless', () => {
  const trend = trendFrom([{ day: '2026-08-01', kg: 90 }]);
  const warnings = warningsFor({ age: 40, bmi: 41, trend, latestKg: 90 });
  assert.ok(warnings.length > 0);
  for (const w of warnings) assert.ok(w.action.length > 10, w.says);
});

test('what you did is reported beside the trend, never as its cause', () => {
  const alongside = alongsideFrom({ daysMoved: 9, mealsChecked: 4, windowDays: 14 });
  assert.match(alongside.says, /not as its cause/);
  assert.match(alongside.says, /9 of 14/);
  assert.match(alongsideFrom({ daysMoved: 0, mealsChecked: 0, windowDays: 14 }).says, /Nothing recorded/);
});

test('a daily plan never invents a finding about the person reading it', () => {
  /*
   * `/body/plan` returned the same six actions to every adult, and five
   * of them carried a sentence that read as something measured:
   *
   *   "Your evening meals are already balanced. Drinks are the bigger
   *    opportunity."
   *   "You have three real gaps in the calendar today."
   *   "Short sleep predicts tomorrow's afternoon snacking for you."
   *
   * Nothing computed any of it. No meal was read, no calendar was
   * consulted, no correlation was fitted — the Dynamic Adherence and
   * Root-Cause agents that would produce such sentences are specified in
   * `BC_AGENTS` and do not run. On a health surface an invented
   * observation about somebody's diet or sleep is not a wording problem,
   * and a member who checks their calendar and finds no three gaps has
   * been given a reason to disbelieve everything else the platform says.
   *
   * The rule this holds: a rationale may state why an action is worth
   * doing for anybody. It may not address the reader in the second
   * person about what their own data shows, until something has actually
   * looked.
   */
  const service = readFileSync(
    new URL('../src/body/body.service.ts', import.meta.url),
    'utf8',
  );

  const rationales = [...service.matchAll(/^\s+'([^']{20,})',\n\s+\),/gm)].map((m) => m[1]!);
  assert.ok(rationales.length >= 8, 'the rationale sentences moved — this check is now blind');

  /*
   * Narrower than "no second person", because the second person is not
   * the problem. "Building strong is about what your body can do" is a
   * framing statement and is true for anybody. "Your evening meals are
   * already balanced" is a finding. What separates them is the assertion
   * of state — a possessive followed by a copula, a count of things the
   * member supposedly has, or a prediction addressed to them.
   */
  const asserts = [
    /\byour\s+[\w-]+(\s+[\w-]+)?\s+(is|are|was|were)\b/i,
    /\byou have\b/i,
    /\bfor you\b/i,
    /\byour strongest\b/i,
    /\bpredicts\b/i,
  ];
  for (const line of rationales) {
    for (const pattern of asserts) {
      assert.doesNotMatch(
        line,
        pattern,
        `a hardcoded rationale states a finding about the reader: "${line}"`,
      );
    }
  }

  /*
   * And the same for the completion probabilities, which were a decimal
   * per action, hand-written, identical for every member, and typed as
   * coming "from the Dynamic Adherence Agent". Nullable is the honest
   * shape: it distinguishes "not modelled" from "modelled as unlikely".
   */
  const planType = readFileSync(
    new URL('../../../packages/body-command/src/plan.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    planType,
    /completionProbability: number \| null/,
    'completionProbability is non-nullable again, so an unmodelled action must invent a number',
  );
  assert.doesNotMatch(
    service,
    /completionProbability:\s*0\.\d+/,
    'a hardcoded completion probability is back in the plan builder',
  );
});

test('the trajectory is one reading a day, latest winning', () => {
  /*
   * Readings had two durable homes: a row per reading in
   * `member_activity`, and a copy in the autosaved `member_state` blob.
   * The account page computed its trend from the blob and sent it up in
   * the request body, so `warningsFor` — which can return a `stop` — was
   * a function of an array the browser was holding rather than of what
   * the member had recorded.
   *
   * Neither copy was being lost; both are Postgres tables. The defect
   * was that the product treated the copy it could not vouch for as the
   * record, while the one with a row per reading was written and never
   * read back. This keeps the row.
   *
   * `ActivityService` is decorated, so it cannot be imported under the
   * type-stripping runner. The collapsing rule is the part worth
   * holding and it is pure, so it is asserted here and the SQL that
   * implements the same rule is read from the source below.
   */
  const rows = [
    { day: '2026-09-01', kg: 92.4, at: '2026-09-01T07:00:00Z' },
    { day: '2026-09-01', kg: 92.1, at: '2026-09-01T19:00:00Z' },
    { day: '2026-09-08', kg: 91.6, at: '2026-09-08T07:00:00Z' },
  ];
  const latestPerDay = new Map<string, { day: string; kg: number }>();
  for (const row of rows) latestPerDay.set(row.day, { day: row.day, kg: row.kg });
  const readings = [...latestPerDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  assert.equal(readings.length, 2, 'a second reading on one day created a second day');
  assert.equal(readings[0]!.kg, 92.1, 'the earlier reading of the day won');
  assert.equal(trendFrom(readings).direction, 'down');

  const service = readFileSync(
    new URL('../src/activity/activity.service.ts', import.meta.url),
    'utf8',
  );
  // Only readings, only this member, and ordered so "latest wins" means
  // what it says.
  assert.match(service, /kind = 'body_read'/);
  assert.match(service, /value IS NOT NULL/);
  assert.match(service, /WHERE user_id = \$1/);
  assert.match(service, /ORDER BY at ASC/);
});

test('the trajectory horizon is not the dashboard window', () => {
  /*
   * A fortnight is the right frame for a completion curve and the wrong
   * one for weight: a sustainable rate is fractions of a kilogram a
   * week, so fourteen days of readings is mostly hydration and cannot
   * separate a plateau from noise. If these two ever become the same
   * number again, the trajectory has quietly been narrowed to a
   * fortnight and every plateau will read as a stall.
   */
  assert.ok(
    BODY_READING_DAYS > WINDOW_DAYS * 4,
    'the reading horizon has collapsed towards the dashboard window',
  );
});

test('another member’s trajectory is not readable', () => {
  /*
   * The route takes a user id in the path, which is the shape that
   * invites reading somebody else's. `SelfOnly` compares it against the
   * session; the repository's own `admin-guard.test.ts` sweeps every
   * controller for unguarded routes, and this asserts the specific
   * decorator on the specific route so a refactor cannot quietly widen
   * it to the whole cohort.
   */
  const controller = readFileSync(
    new URL('../src/body/body.controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    controller,
    /@SelfOnly\('userId'\)\s*\n\s*@Get\('trajectory\/:userId'\)/,
    'the trajectory route lost its SelfOnly guard',
  );
});
