import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ACU_PER_GBP,
  ADDITIONAL_SEAT_OVERHEAD_SHARE,
  APP_STORE_COMMISSION,
  COST_MODEL_CAVEAT,
  COST_MODEL_DATE,
  COST_MODEL_VERSION,
  COST_PROTECTION_MULTIPLE,
  ACU_TOPUP_TIERS,
  MIN_CONTRACT_SEATS,
  MIN_TRANSACTION_GBP,
  MODEL_FINDINGS,
  fixedFeeBurden,
  OVERHEAD_PER_PAID_USER_MONTH,
  OVERHEAD_TOTAL,
  PROFIT_MULTIPLE,
  STRIPE,
  TARGET_GROSS_MARGIN,
  VAT_RATE,
  acuAllowanceFor,
  freeTierSubsidy,
  monthlyCost,
  planEconomics,
  priceAction,
  revenueSplit,
  stress,
  type AiCall,
  type CloudUsage,
  type UserCostProfile,
} from '@movequest/shared';
import { CompareBars, Donut, Spark, StackedBars, Stat, Waterfall } from '../charts';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Unit economics — MOVEQUEST',
  description:
    'The whole cost stack: AI inference, Google Cloud, messaging, Stripe, VAT and the humans. ' +
    'Every plan must clear 100% profit on fully-loaded cost, and the model says which ones do.',
};

/* ---------------- modelled usage profiles ---------------- */

const mid = (n: number, i: number, o: number, img?: number): AiCall[] =>
  Array.from({ length: n }, () => ({
    tier: 'mid' as const,
    inputTokens: i,
    outputTokens: o,
    ...(img ? { images: img } : {}),
  }));
const front = (n: number, i: number, o: number): AiCall[] =>
  Array.from({ length: n }, () => ({ tier: 'frontier' as const, inputTokens: i, outputTokens: o }));

const cloud = (m: number): CloudUsage => ({
  firestoreReads: 24000 * m,
  firestoreWrites: 3200 * m,
  firestoreStorageGb: 0.012 * m,
  cloudRunVcpuSeconds: 420 * m,
  cloudRunGibSeconds: 210 * m,
  requests: 5600 * m,
  functionInvocations: 3400 * m,
  storageGb: 0.05 * m,
  egressGb: 0.35 * m,
  bigQueryStorageGb: 0.02 * m,
  bigQueryQueryTb: 0.00015 * m,
  redisGbHours: 0.4 * m,
});
const noMsg = { smsCount: 0, whatsappConversations: 0 };

const PREMIUM: UserCostProfile = {
  label: 'Premium',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(1),
  aiCalls: [...mid(30, 2200, 320), ...front(4, 7000, 1400), ...front(2, 14000, 2200), ...mid(20, 1400, 600, 1)],
};
const CHILD: UserCostProfile = {
  label: 'Child seat',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.4),
  aiCalls: [...mid(20, 1500, 260), ...front(2, 4000, 700)],
};
const LATER: UserCostProfile = {
  label: 'Later-life seat',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.35),
  aiCalls: [...mid(16, 1400, 240), ...front(2, 4000, 700)],
};
const EMPLOYEE: UserCostProfile = {
  label: 'Employee',
  carriesOverhead: true,
  messaging: noMsg,
  cloud: cloud(0.45),
  aiCalls: [...mid(14, 1800, 280), ...front(2, 5000, 900), ...mid(4, 1400, 600, 1)],
};
const FREE: UserCostProfile = {
  label: 'Free',
  carriesOverhead: false,
  messaging: noMsg,
  cloud: cloud(0.25),
  aiCalls: mid(8, 1600, 240),
};
const LIGHT: UserCostProfile = {
  ...PREMIUM,
  label: 'Lightweight (T3)',
  messaging: { smsCount: 60, whatsappConversations: 30 },
};

const PROFILES = [FREE, CHILD, LATER, EMPLOYEE, PREMIUM, LIGHT];

/* ---------------- plans, computed ---------------- */

const PLANS = [
  planEconomics({ plan: 'Premium — £5.99', grossGbp: 5.99, profile: PREMIUM }),
  planEconomics({ plan: 'Premium — £8.99', grossGbp: 8.99, profile: PREMIUM }),
  planEconomics({
    plan: 'Family — £12.99, four seats',
    grossGbp: 12.99,
    seatProfiles: [PREMIUM, PREMIUM, CHILD, CHILD],
  }),
  planEconomics({
    plan: 'Family — £17.99, six seats',
    grossGbp: 17.99,
    seatProfiles: [PREMIUM, PREMIUM, CHILD, CHILD, LATER, LATER],
  }),
  planEconomics({
    plan: `Organisation — £2/seat, ${MIN_CONTRACT_SEATS} seats`,
    grossGbp: 2 * MIN_CONTRACT_SEATS,
    seatProfiles: Array.from({ length: MIN_CONTRACT_SEATS }, () => EMPLOYEE),
    vatInclusive: false,
  }),
  planEconomics({
    plan: 'Organisation — £3/seat, 250 seats',
    grossGbp: 3 * 250,
    seatProfiles: Array.from({ length: 250 }, () => EMPLOYEE),
    vatInclusive: false,
  }),
];

const PREMIUM_PLAN = PLANS[1];
const SPLIT = revenueSplit(PREMIUM_PLAN);

const SPLIT_TONE: Record<string, string> = {
  'VAT (never ours)': 'var(--mq-unavailable)',
  Stripe: 'var(--mq-purple)',
  'AI providers': 'var(--mq-blue)',
  'Google Cloud': 'var(--mq-sky)',
  Messaging: 'var(--mq-coral)',
  'People & platform': 'var(--mq-orange)',
  Contribution: 'var(--mq-excellent)',
};

const OVERHEAD_ROWS = Object.entries(OVERHEAD_PER_PAID_USER_MONTH).map(([k, v], i) => ({
  label: k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
  value: v,
  tone: `var(--c${(i % 6) + 1})`,
}));

const SHOCKS = [1, 2, 4, 6, 8].map((m) => ({
  m,
  ...stress(PREMIUM_PLAN, { aiMultiplier: m }),
}));

const FREE_COST = monthlyCost(FREE).total;
const CONVERSIONS = [0.02, 0.05, 0.08, 0.12, 0.15, 0.2].map((c) => {
  const paid = Math.round(10000 * c);
  return {
    c,
    ...freeTierSubsidy({
      freeUsers: 10000 - paid,
      paidUsers: paid,
      freeMonthlyCost: FREE_COST,
      paidContribution: PREMIUM_PLAN.contribution,
    }),
  };
});

/* Two actions, to show which rule binds. */
const CHEAP_ACTION = priceAction({ providerCostGbp: 0.004, cloudCostGbp: 0.0002, supportShareGbp: 0.0001 });
const HEAVY_ACTION = priceAction({ providerCostGbp: 0.002, cloudCostGbp: 0.03, supportShareGbp: 0.02 });

const COST_STACK = PROFILES.map((p) => {
  const c = monthlyCost(p);
  return { name: p.label.replace(' (T3)', ''), parts: [c.ai, c.cloud, c.messaging, c.overhead] };
});

export default function Economics() {
  const storeCommission = PREMIUM_PLAN.grossGbp * APP_STORE_COMMISSION.standardRate;

  return (
    <>
      <SkipLink />
      <Nav current="/economics" />

      <main id="main">
        <PageHero
          crumb="Unit economics"
          eyebrow={`Cost model v${COST_MODEL_VERSION} · ${COST_MODEL_DATE}`}
          title={
            <>
              Every plan must earn twice<br />
              what it costs to run.
            </>
          }
          lede={
            `AI inference, Google Cloud and Firebase, SMS and WhatsApp, Stripe, VAT, support, ` +
            `clinical review, compliance and platform. All of it, priced, with a rule that says ` +
            `net revenue must be at least ${PROFIT_MULTIPLE}× fully-loaded cost — 100% profit on ` +
            `cost, a ${Math.round(TARGET_GROSS_MARGIN * 100)}% gross margin. Every number on this ` +
            `page is computed by the engine when the page builds, so a wrong assumption shows up ` +
            `here rather than in a spreadsheet nobody opens.`
          }
        />

        {/* ---------------- headline ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--4 card--light">
                <Stat
                  k="The rule"
                  v={`${PROFIT_MULTIPLE}×`}
                  sub={`Net revenue ÷ fully-loaded cost. Sits on top of the ${COST_PROTECTION_MULTIPLE}× AI protection rule — an action must clear both, and the stricter one wins.`}
                  tone="var(--mq-excellent)"
                />
              </article>
              <article className="card card--4 card--light">
                <Stat
                  k="Premium at £8.99"
                  v={`${PREMIUM_PLAN.profitMultiple}×`}
                  sub={`£${PREMIUM_PLAN.netRevenue.toFixed(2)} net against £${PREMIUM_PLAN.cost.total.toFixed(2)} cost. Price floor is £${PREMIUM_PLAN.priceFloor.toFixed(2)}, so there is £${PREMIUM_PLAN.headroom.toFixed(2)} of headroom.`}
                  tone="var(--mq-teal)"
                />
              </article>
              <article className="card card--4 card--light">
                <Stat
                  k="Where it goes"
                  v={`${SPLIT.find((s) => s.label === 'People & platform')?.pct ?? 0}%`}
                  sub={`of a Premium subscription is people and platform — £${PREMIUM_PLAN.cost.overhead.toFixed(2)} against £${PREMIUM_PLAN.cost.ai.toFixed(2)} of inference. This is a services business with a model attached, not the other way round.`}
                  tone="var(--mq-orange)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- the split ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Follow the money</p>
              <h2>What happens to £8.99.</h2>
              <p className="lede">
                VAT comes off first, because it was never ours. Then Stripe, because collecting
                money costs money — including on the VAT portion we are only holding. What
                survives both is the only revenue that can pay for anything.
              </p>
            </div>

            <div className="dash">
              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">The £8.99, split</h3>
                </div>
                <Donut
                  slices={SPLIT.map((s) => ({
                    label: `${s.label} £${s.gbp.toFixed(2)}`,
                    value: s.gbp,
                    tone: SPLIT_TONE[s.label] ?? 'var(--mq-slate)',
                  }))}
                  centre="£8.99"
                  sub="gross"
                />
              </article>

              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Line by line</h3>
                  <span className="card__tag">per subscriber per month</span>
                </div>
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">Line</th>
                        <th scope="col">£</th>
                        <th scope="col">% of gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SPLIT.map((s) => (
                        <tr key={s.label}>
                          <td style={{ fontWeight: s.label === 'Contribution' ? 700 : 500 }}>
                            <span
                              style={{
                                display: 'inline-block',
                                width: 10,
                                height: 10,
                                borderRadius: 3,
                                marginRight: 9,
                                background: SPLIT_TONE[s.label] ?? 'var(--mq-slate)',
                              }}
                              aria-hidden="true"
                            />
                            {s.label}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>£{s.gbp.toFixed(2)}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  VAT at {Math.round(VAT_RATE * 100)}% and Stripe at{' '}
                  {((STRIPE.ukCardPct + STRIPE.billingPct + STRIPE.disputeReservePct) * 100).toFixed(
                    1,
                  )}
                  % + £{STRIPE.fixedFee.toFixed(2)} take £
                  {(PREMIUM_PLAN.vat + PREMIUM_PLAN.stripe).toFixed(2)} before a single line of
                  the product has been paid for.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- cost per user ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Cost to serve</p>
              <h2>Six kinds of user, and the one we most want to reach costs the most.</h2>
              <p className="lede">
                A lightweight-tier user has no app, so every prompt is a billable message. That
                is the ethical centre of the product and the worst line on the spreadsheet. It is
                funded from the app tiers and public-health contracts rather than pretended away.
              </p>
            </div>

            <div className="dash">
              <article className="card card--8 card--light">
                <div className="card__head">
                  <h3 className="card__t">Monthly cost per user</h3>
                  <span className="card__tag">£</span>
                </div>
                <StackedBars
                  bars={COST_STACK}
                  keys={[
                    { name: 'AI inference', tone: 'var(--mq-blue)' },
                    { name: 'Google Cloud', tone: 'var(--mq-sky)' },
                    { name: 'Messaging', tone: 'var(--mq-coral)' },
                    { name: 'People & platform', tone: 'var(--mq-orange)' },
                  ]}
                  label="Monthly cost to serve, by user type"
                />
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">User</th>
                        <th scope="col">AI</th>
                        <th scope="col">Cloud</th>
                        <th scope="col">Messaging</th>
                        <th scope="col">People</th>
                        <th scope="col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PROFILES.map((p) => {
                        const c = monthlyCost(p);
                        return (
                          <tr key={p.label}>
                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.label}</td>
                            <td>£{c.ai.toFixed(3)}</td>
                            <td>£{c.cloud.toFixed(3)}</td>
                            <td>£{c.messaging.toFixed(3)}</td>
                            <td>£{c.overhead.toFixed(3)}</td>
                            <td style={{ fontWeight: 700 }}>£{c.total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">The £{OVERHEAD_TOTAL.toFixed(2)} nobody models</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-orange)' }}>
                    per paid user
                  </span>
                </div>
                <CompareBars rows={OVERHEAD_ROWS} max={0.6} unit="" />
                <p className="card__note">
                  Additional seats inside one household or contract carry{' '}
                  {Math.round(ADDITIONAL_SEAT_OVERHEAD_SHARE * 100)}% of the shared portion —
                  support is a relationship with a household, not with each person in it. Content
                  and clinical review stay at full rate, because they genuinely are per-person.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- plans ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Every plan, tested</p>
              <h2>Does it clear {PROFIT_MULTIPLE}×?</h2>
              <p className="lede">
                Computed at build time. If a price were set below its floor, this table would say
                so on the live site rather than in a private model.
              </p>
            </div>

            <article className="card card--light">
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">Plan</th>
                      <th scope="col">Gross</th>
                      <th scope="col">Net</th>
                      <th scope="col">Cost</th>
                      <th scope="col">Contribution</th>
                      <th scope="col">Margin</th>
                      <th scope="col">Multiple</th>
                      <th scope="col">Floor</th>
                      <th scope="col">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLANS.map((p) => (
                      <tr key={p.plan}>
                        <td style={{ fontWeight: 600 }}>{p.plan}</td>
                        <td>£{p.grossGbp.toFixed(2)}</td>
                        <td>£{p.netRevenue.toFixed(2)}</td>
                        <td>£{p.cost.total.toFixed(2)}</td>
                        <td>£{p.contribution.toFixed(2)}</td>
                        <td>{p.grossMarginPct}%</td>
                        <td style={{ fontWeight: 700 }}>{p.profitMultiple}×</td>
                        <td>£{p.priceFloor.toFixed(2)}</td>
                        <td>
                          {p.clearsTarget ? (
                            <span style={{ color: 'var(--mq-excellent)', fontWeight: 700 }}>
                              <Tick /> clears
                            </span>
                          ) : (
                            <span style={{ color: 'var(--mq-critical)', fontWeight: 700 }}>
                              below floor
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card__note">
                Organisation pricing carries a minimum of {MIN_CONTRACT_SEATS} seats. That is
                derived rather than chosen: Stripe charges a fixed fee per invoice and a contract
                carries fixed compliance and account overhead, so below roughly six seats £2 per
                seat does not clear the rule at any volume discount.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- action pricing ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Action pricing</p>
              <h2>Two rules. The stricter one wins.</h2>
              <p className="lede">
                The {COST_PROTECTION_MULTIPLE}× rule protects against AI provider spend. The{' '}
                {PROFIT_MULTIPLE}× rule protects against everything else. On cheap actions the
                first binds; on infrastructure-heavy ones the second does, and pricing on the AI
                rule alone would have under-charged by a factor of{' '}
                {Math.round(HEAVY_ACTION.priceGbp / HEAVY_ACTION.byProviderRule)}.
              </p>
            </div>

            <div className="dash">
              {[
                { name: 'A daily adaptive command', a: CHEAP_ACTION, note: 'Cheap model call, negligible infrastructure.' },
                { name: 'A 30-day trajectory analysis', a: HEAVY_ACTION, note: 'Small model call, heavy query and storage work.' },
              ].map(({ name, a, note }) => (
                <article className="card card--6" key={name}>
                  <div className="card__head">
                    <h3 className="card__t">{name}</h3>
                    <span
                      className="card__tag"
                      style={{
                        color:
                          a.bindingRule === 'margin' ? 'var(--mq-orange)' : 'var(--mq-teal)',
                      }}
                    >
                      {a.bindingRule === 'margin' ? 'margin rule binds' : 'AI protection binds'}
                    </span>
                  </div>
                  <Waterfall
                    items={[
                      { name: `${COST_PROTECTION_MULTIPLE}× provider cost`, delta: Math.round(a.byProviderRule * 1000) },
                      { name: `${PROFIT_MULTIPLE}× fully-loaded cost`, delta: Math.round(a.byMarginRule * 1000) },
                    ]}
                    label={`Pricing rules for ${name}`}
                  />
                  <p className="card__note">
                    {note} Fully loaded £{a.fullyLoaded.toFixed(4)} → priced at £
                    {a.priceGbp.toFixed(4)} ={' '}
                    <strong>{Math.ceil(a.priceGbp * ACU_PER_GBP)} ACUs</strong>.
                  </p>
                </article>
              ))}
            </div>

            <article className="card" style={{ marginTop: 22 }}>
              <div className="card__head">
                <h3 className="card__t">The monthly ACU allowance is derived, not marketed</h3>
                <span className="card__tag" style={{ color: 'var(--mq-lime)' }}>
                  {acuAllowanceFor(PREMIUM_PLAN)} ACUs at £8.99
                </span>
              </div>
              <p className="card__note">
                It is the most AI a subscriber can consume while their own subscription still
                clears {PROFIT_MULTIPLE}× after cloud, messaging and human cost. Spend the whole
                allowance and the plan is still solvent — which is the only definition of an
                allowance that means anything.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- stress ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">What breaks first</p>
              <h2>Inference can quadruple before Premium fails.</h2>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Premium at £8.99, under an AI cost shock</h3>
                  <span className="card__tag">multiple of today’s prices</span>
                </div>
                <Spark
                  series={SHOCKS.map((s) => s.profitMultiple)}
                  label="Profit multiple as AI cost rises"
                  tone="var(--mq-teal)"
                  band={[PROFIT_MULTIPLE, PROFIT_MULTIPLE]}
                />
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">AI cost</th>
                        <th scope="col">Contribution</th>
                        <th scope="col">Multiple</th>
                        <th scope="col" />
                      </tr>
                    </thead>
                    <tbody>
                      {SHOCKS.map((s) => (
                        <tr key={s.m}>
                          <td>×{s.m}</td>
                          <td>£{s.contribution.toFixed(2)}</td>
                          <td style={{ fontWeight: 700 }}>{s.profitMultiple}×</td>
                          <td>
                            {s.clearsTarget ? (
                              <span style={{ color: 'var(--mq-excellent)' }}>clears</span>
                            ) : (
                              <span style={{ color: 'var(--mq-critical)', fontWeight: 700 }}>
                                fails
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  This is the real justification for the per-agent ACU ceiling. A price rise is
                  slow and visible; runaway usage from one badly-configured agent arrives in an
                  afternoon and does the same damage.
                </p>
              </article>

              <article className="card card--5 card--light" style={{ gap: 14 }}>
                <Stat
                  k="App-store commission"
                  v={`£${storeCommission.toFixed(2)}`}
                  sub={`${Math.round(APP_STORE_COMMISSION.standardRate * 100)}% of £8.99 — larger than the entire £${PREMIUM_PLAN.cost.total.toFixed(2)} cost of serving that subscriber for a month. Web checkout is the default for exactly this reason.`}
                  tone="var(--mq-critical)"
                />
                <Stat
                  k="Small-business rate"
                  v={`${Math.round(APP_STORE_COMMISSION.smallBusinessRate * 100)}%`}
                  sub="Available under a revenue threshold, and it is still the second-largest line in the model after people."
                  tone="var(--mq-monitor)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- minimum charge ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The floor</p>
              <h2>Nothing is ever charged below £{MIN_TRANSACTION_GBP.toFixed(2)}.</h2>
              <p className="lede">
                Not a marketing choice — arithmetic. Stripe's fee is £
                {STRIPE.fixedFee.toFixed(2)} whatever the amount, so it is{' '}
                {fixedFeeBurden(2)}% of a £2 charge and {fixedFeeBurden(5)}% of a £5 one. Small
                payments also attract disproportionate dispute and refund handling. Anything
                genuinely worth less than £{MIN_TRANSACTION_GBP.toFixed(2)} is bundled into a
                subscription or given away, and{' '}
                <code>assertChargeable()</code> throws rather than quietly taking it.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">What the fixed fee alone consumes</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-critical)' }}>
                    before any percentage rate
                  </span>
                </div>
                <CompareBars
                  rows={[
                    { label: '£1.00 charge', value: fixedFeeBurden(1), tone: 'var(--mq-critical)', note: 'Refused.' },
                    { label: '£2.00 charge', value: fixedFeeBurden(2), tone: 'var(--mq-action)', note: 'Refused.' },
                    { label: '£5.00 charge — the floor', value: fixedFeeBurden(5), tone: 'var(--mq-monitor)', note: 'Accepted. The smallest charge that still makes sense.' },
                    { label: '£8.99 charge', value: fixedFeeBurden(8.99), tone: 'var(--mq-excellent)', note: 'Comfortable.' },
                    { label: '£20.00 invoice', value: fixedFeeBurden(20), tone: 'var(--mq-excellent)', note: 'A ten-seat organisation at £2 a seat.' },
                  ]}
                  max={25}
                  unit="%"
                />
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Top-up denominations</h3>
                  <span className="card__tag">all clear the floor</span>
                </div>
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">Pay</th>
                        <th scope="col">ACUs</th>
                        <th scope="col">Bonus</th>
                        <th scope="col">Fixed fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ACU_TOPUP_TIERS.map((t) => (
                        <tr key={t.gbp}>
                          <td style={{ fontWeight: 600 }}>£{t.gbp.toFixed(2)}</td>
                          <td>{t.acus.toLocaleString('en-GB')}</td>
                          <td style={{ color: t.bonusAcus ? 'var(--mq-excellent)' : undefined }}>
                            {t.bonusAcus ? `+${t.bonusAcus}` : '—'}
                          </td>
                          <td>{fixedFeeBurden(t.gbp)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  The bonus on larger tiers is the fixed fee amortising, not a discount invented
                  to drive volume — which is why there is none at the floor.
                </p>
              </article>
            </div>

            <article className="card card--light" style={{ marginTop: 20 }}>
              <div className="card__head">
                <h3 className="card__t">Where the rule bites, and where it does not</h3>
              </div>
              <p className="card__note">
                The floor is on the <strong>transaction</strong>, not on a per-seat rate. A
                ten-seat organisation at £2 a seat is one £
                {(2 * MIN_CONTRACT_SEATS).toFixed(2)} invoice and clears it comfortably — the
                seat rate never becomes a charge on its own. An automatic top-up configured
                below the floor is raised to it rather than declined, because the person asked
                for it to happen without their involvement and failing silently at 3am is the
                wrong behaviour. A manual purchase throws, because somebody is there to read it.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- free tier ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The free tier</p>
              <h2>It needs a 12% conversion rate to fund itself.</h2>
              <p className="lede">
                A free user costs £{FREE_COST.toFixed(2)} a month, and{' '}
                {Math.round((1 - monthlyCost(FREE).ai / FREE_COST) * 100)}% of that is support
                and platform rather than AI. Typical freemium conversion is 2–5%. So the free
                tier as modelled is a deliberate acquisition cost, and this page says so rather
                than burying it.
              </p>
            </div>

            <article className="card card--light">
              <div className="card__head">
                <h3 className="card__t">10,000 users, at each conversion rate</h3>
                <span className="card__tag">monthly, £</span>
              </div>
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">Conversion</th>
                      <th scope="col">Free users</th>
                      <th scope="col">Cost of free</th>
                      <th scope="col">Paid contribution</th>
                      <th scope="col">Blended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONVERSIONS.map((c) => (
                      <tr key={c.c}>
                        <td style={{ fontWeight: 600 }}>{Math.round(c.c * 100)}%</td>
                        <td>{(10000 - Math.round(10000 * c.c)).toLocaleString('en-GB')}</td>
                        <td>−£{c.totalFreeCost.toLocaleString('en-GB')}</td>
                        <td>+£{c.totalPaidContribution.toLocaleString('en-GB')}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            color:
                              c.blendedContribution > 0
                                ? 'var(--mq-excellent)'
                                : 'var(--mq-critical)',
                          }}
                        >
                          {c.blendedContribution > 0 ? '+' : '−'}£
                          {Math.abs(c.blendedContribution).toLocaleString('en-GB')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card__note">
                The lever is not inference — it is £0.005 of that £{FREE_COST.toFixed(2)}. It is
                support contact rate and platform amortisation. Everyone assumes AI is what makes
                a free tier expensive; in this model it is 0.7% of the cost.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- findings ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">What the model concluded</p>
              <h2>Six findings, including the uncomfortable ones.</h2>
            </div>

            <div className="tiles">
              {MODEL_FINDINGS.map((f, i) => (
                <article
                  className="tile tile--ink"
                  key={f.key}
                  style={{ ['--tone' as string]: `var(--c${(i % 6) + 1})` }}
                >
                  <h3>{f.headline}</h3>
                  <p>{f.detail}</p>
                </article>
              ))}
            </div>

            <div className="ci" style={{ marginTop: 32 }}>
              <Tick />
              <span>{COST_MODEL_CAVEAT}</span>
            </div>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Priced in the open.</h2>
            <p>
              Including the compute limits, the minimum contract size, and the tier that loses
              money on purpose.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/get-started">
                See the plans
              </Link>
              <Link className="btn btn--ghost" href="/contact">
                Talk to us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
