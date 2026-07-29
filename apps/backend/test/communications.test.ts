import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADULT_ONLY_EVENTS,
  CATALOGUE_SIZE,
  CHANNEL_DEFINITIONS,
  COACHING_EVENTS,
  EVENT_CATALOGUE,
  EVENT_CATEGORIES,
  EVENT_SEVERITIES,
  MANDATORY_EVENTS,
  MESSAGE_CHANNELS,
  TEMPLATE_TOKENS,
  WIRED_CHANNELS,
  channelCoverage,
  deliveryCostGbp,
  eventByKey,
  eventsIn,
  renderSubject,
  resolveDelivery,
  tokensIn,
  type CommEvent,
  type Recipient,
} from '@jessmove/shared';

/* ------------------------------------------------------------------ *
 * Catalogue integrity
 * ------------------------------------------------------------------ */

test('every event key is unique', () => {
  const keys = EVENT_CATALOGUE.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('every event is in a declared category with a declared severity', () => {
  for (const e of EVENT_CATALOGUE) {
    assert.ok(EVENT_CATEGORIES.includes(e.category), `${e.key} category`);
    assert.ok(EVENT_SEVERITIES.includes(e.severity), `${e.key} severity`);
  }
});

test('every event names at least one channel, and every channel is real', () => {
  for (const e of EVENT_CATALOGUE) {
    assert.ok(e.channels.length > 0, `${e.key} has no channel`);
    for (const c of e.channels) {
      assert.ok(MESSAGE_CHANNELS.includes(c), `${e.key} names unknown channel ${c}`);
    }
  }
});

test('every category is populated — an empty one is a modelling mistake', () => {
  for (const c of EVENT_CATEGORIES) {
    assert.ok(eventsIn(c).length > 0, `${c} is empty`);
  }
});

test('the flattened catalogue and the per-category sums agree', () => {
  const summed = EVENT_CATEGORIES.reduce((n, c) => n + eventsIn(c).length, 0);
  assert.equal(summed, CATALOGUE_SIZE);
});

test('every event lands in-app — it is the record of what happened', () => {
  const missing = EVENT_CATALOGUE.filter((e) => !e.channels.includes('in_app'));
  assert.deepEqual(missing.map((e) => e.key), []);
});

test('SMS is reserved for warning and critical traffic', () => {
  const cheap = EVENT_CATALOGUE.filter(
    (e) => e.channels.includes('sms') && e.severity === 'success' && !e.mandatory,
  );
  assert.deepEqual(cheap.map((e) => e.key), []);
});

test('every template token used anywhere is a declared token', () => {
  for (const e of EVENT_CATALOGUE) {
    for (const token of tokensIn(e.subject)) {
      assert.ok(
        (TEMPLATE_TOKENS as readonly string[]).includes(token),
        `${e.key} uses unknown token {{${token}}}`,
      );
    }
  }
});

test('channel coverage counts every reference exactly once', () => {
  const coverage = channelCoverage();
  const total = Object.values(coverage).reduce((a, b) => a + b, 0);
  const expected = EVENT_CATALOGUE.reduce((n, e) => n + e.channels.length, 0);
  assert.equal(total, expected);
  assert.equal(coverage.in_app, CATALOGUE_SIZE);
});

test('the unwired channel is catalogued but has no provider', () => {
  assert.equal(CHANNEL_DEFINITIONS.whatsapp.wired, false);
  assert.ok(!WIRED_CHANNELS.includes('whatsapp'));
  assert.ok(channelCoverage().whatsapp > 0, 'unwired channel should still be modelled');
});

test('eventByKey finds a known event and returns undefined for a made-up one', () => {
  assert.equal(eventByKey('security.alert')?.severity, 'critical');
  assert.equal(eventByKey('nonsense.event'), undefined);
});

/* ------------------------------------------------------------------ *
 * The flags, as policy
 * ------------------------------------------------------------------ */

test('no coaching event is also mandatory — a nudge is never statutory', () => {
  const both = COACHING_EVENTS.filter((e) => e.mandatory);
  assert.deepEqual(both.map((e) => e.key), []);
});

test('every billing, wallet and partner event is adult-only', () => {
  const money = EVENT_CATALOGUE.filter(
    (e) =>
      e.category === 'Subscription & Billing' ||
      e.category === 'ACU Wallet & Spend' ||
      e.category === 'Growth & Partners',
  );
  const leaks = money.filter((e) => !e.adultOnly);
  assert.deepEqual(leaks.map((e) => e.key), []);
});

test('every BodyCommand event is adult-only — C6 holds in the message layer too', () => {
  const leaks = EVENT_CATALOGUE.filter((e) => e.category === 'BodyCommand' && !e.adultOnly);
  assert.deepEqual(leaks.map((e) => e.key), []);
});

test('critical safety events are exempt from quiet hours', () => {
  const silent = EVENT_CATALOGUE.filter(
    (e) => e.severity === 'critical' && e.category === 'Safety & Clinical' && !e.quietHoursExempt,
  );
  assert.deepEqual(silent.map((e) => e.key), []);
});

test('the catalogue has real breadth in every axis it claims', () => {
  assert.ok(CATALOGUE_SIZE > 200, `only ${CATALOGUE_SIZE} events`);
  assert.equal(EVENT_CATEGORIES.length, 15);
  assert.ok(MANDATORY_EVENTS.length > 40);
  assert.ok(ADULT_ONLY_EVENTS.length > 40);
});

/* ------------------------------------------------------------------ *
 * Delivery resolution — the part that is specific to this platform
 * ------------------------------------------------------------------ */

function to(over: Partial<Recipient> = {}): Recipient {
  return {
    userId: 'u_1',
    age: 34,
    presence: 'full',
    consentedChannels: ['email', 'in_app', 'sms', 'push'],
    inQuietHours: false,
    contextHeld: false,
    coachingSentToday: 0,
    dailyCap: 6,
    hasGuardian: false,
    ...over,
  };
}

const need = (key: string): CommEvent => {
  const e = eventByKey(key);
  assert.ok(e, `${key} missing from the catalogue`);
  return e;
};

test('an adult-only event is absent for a minor, not merely suppressed by preference', () => {
  const plan = resolveDelivery(need('payment.successful'), to({ age: 12 }));
  assert.deepEqual(plan.deliver, []);
  assert.deepEqual(plan.suppressed, ['adult_only']);
});

test('no consent setting unlocks an adult-only event for a minor', () => {
  const plan = resolveDelivery(
    need('body.assessment_ready'),
    to({ age: 17, consentedChannels: [...MESSAGE_CHANNELS] }),
  );
  assert.deepEqual(plan.deliver, []);
  assert.deepEqual(plan.suppressed, ['adult_only']);
});

test('age is checked before everything else — a mandatory adult-only event still stops', () => {
  const plan = resolveDelivery(need('payment.failed'), to({ age: 15, inQuietHours: true }));
  assert.deepEqual(plan.suppressed, ['adult_only']);
});

test('coach off means off — a coaching event does not send', () => {
  const plan = resolveDelivery(need('snap.offered'), to({ presence: 'off' }));
  assert.deepEqual(plan.deliver, []);
  assert.deepEqual(plan.suppressed, ['coach_off']);
});

test('a coach set to off does not block a security notice', () => {
  const plan = resolveDelivery(need('security.alert'), to({ presence: 'off' }));
  assert.ok(plan.deliver.includes('email'));
  assert.ok(plan.deliver.includes('sms'));
});

test('Law 2 — a held context blocks a coaching nudge', () => {
  const plan = resolveDelivery(need('snap.offered'), to({ contextHeld: true }));
  assert.deepEqual(plan.suppressed, ['context_held']);
});

test('a held context does not block a clinical escalation', () => {
  const plan = resolveDelivery(need('clinical.red_flag_detected'), to({ contextHeld: true }));
  assert.ok(plan.deliver.length > 0);
});

test('quiet hours stop ordinary traffic and not exempt traffic', () => {
  assert.deepEqual(
    resolveDelivery(need('insight.weekly_ready'), to({ inQuietHours: true })).suppressed,
    ['quiet_hours'],
  );
  assert.ok(
    resolveDelivery(need('account.locked'), to({ inQuietHours: true })).deliver.length > 0,
  );
});

test('the daily cap applies to coaching and nothing else', () => {
  const capped = to({ coachingSentToday: 6, dailyCap: 6 });
  assert.deepEqual(resolveDelivery(need('snap.offered'), capped).suppressed, ['daily_cap']);
  assert.ok(resolveDelivery(need('support.ticket_resolved'), capped).deliver.length > 0);
});

test('an unwired channel is dropped with a reason, and the rest still send', () => {
  const plan = resolveDelivery(need('insight.weekly_ready'), to());
  assert.ok(!plan.deliver.includes('whatsapp'));
  assert.deepEqual(
    plan.dropped.filter((d) => d.channel === 'whatsapp'),
    [{ channel: 'whatsapp', reason: 'no provider configured' }],
  );
  assert.ok(plan.deliver.includes('email'));
});

test('channel consent is honoured for ordinary events', () => {
  const plan = resolveDelivery(
    need('insight.weekly_ready'),
    to({ consentedChannels: ['in_app'] }),
  );
  assert.deepEqual(plan.deliver, ['in_app']);
  assert.ok(plan.dropped.some((d) => d.channel === 'email' && d.reason === 'not consented'));
});

test('a mandatory notice bypasses channel consent', () => {
  const plan = resolveDelivery(need('privacy.breach_notification'), to({ consentedChannels: [] }));
  assert.deepEqual(plan.deliver, ['email', 'in_app', 'sms']);
  assert.match(plan.explanation, /Mandatory/);
});

test('a mandatory notice does not bypass age', () => {
  const plan = resolveDelivery(
    need('invoice.overdue'),
    to({ age: 16, consentedChannels: [] }),
  );
  assert.deepEqual(plan.deliver, []);
  assert.deepEqual(plan.suppressed, ['adult_only']);
});

test('consenting to nothing suppresses an ordinary event with a named reason', () => {
  const plan = resolveDelivery(need('insight.weekly_ready'), to({ consentedChannels: [] }));
  assert.deepEqual(plan.suppressed, ['no_consented_channel']);
});

test('a guardian copy is produced only for a minor with a linked guardian', () => {
  const event = need('clinical.red_flag_detected');
  assert.equal(resolveDelivery(event, to({ age: 12, hasGuardian: true })).guardianCopy, true);
  assert.equal(resolveDelivery(event, to({ age: 12, hasGuardian: false })).guardianCopy, false);
  assert.equal(resolveDelivery(event, to({ age: 40, hasGuardian: true })).guardianCopy, false);
});

test('every plan explains itself — a suppression with no reason is unusable', () => {
  for (const event of EVENT_CATALOGUE) {
    const plan = resolveDelivery(event, to({ age: 12, presence: 'off', inQuietHours: true }));
    assert.ok(plan.explanation.length > 20, `${event.key} has no explanation`);
    if (plan.deliver.length === 0) {
      assert.ok(plan.suppressed.length > 0, `${event.key} sent nothing and said why not`);
    }
  }
});

test('resolution is deterministic', () => {
  const e = need('snap.offered');
  assert.deepEqual(resolveDelivery(e, to()), resolveDelivery(e, to()));
});

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

test('cost is the sum of the delivered channels, and in-app is free', () => {
  const plan = resolveDelivery(need('security.alert'), to());
  assert.equal(
    deliveryCostGbp(plan),
    Number(
      (
        CHANNEL_DEFINITIONS.email.unitCostGbp +
        CHANNEL_DEFINITIONS.in_app.unitCostGbp +
        CHANNEL_DEFINITIONS.sms.unitCostGbp
      ).toFixed(6),
    ),
  );
});

test('a suppressed plan costs nothing', () => {
  assert.equal(deliveryCostGbp(resolveDelivery(need('snap.offered'), to({ presence: 'off' }))), 0);
});

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

test('a known token is interpolated', () => {
  assert.equal(
    renderSubject('{{actor}} invited you to {{item}}', { actor: 'Ada', item: 'Desk Reset' }),
    'Ada invited you to Desk Reset',
  );
});

test('a missing value degrades to a visible placeholder rather than an empty gap', () => {
  assert.equal(renderSubject('Invoice {{number}} is ready', {}), 'Invoice [number] is ready');
});

test('an unknown token throws rather than shipping as literal text', () => {
  assert.throws(
    () => renderSubject('Hello {{firstname}}', {}),
    (e: Error) => e.name === 'UnknownTokenError' && /firstname/.test(e.message),
  );
});

test('every catalogue subject renders without throwing', () => {
  for (const e of EVENT_CATALOGUE) {
    assert.doesNotThrow(() => renderSubject(e.subject, {}), `${e.key} has a bad template`);
  }
});
