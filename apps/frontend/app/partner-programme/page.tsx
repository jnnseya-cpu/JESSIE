import type { Metadata } from 'next';
import Link from 'next/link';
import {
  COMMISSION_RATE,
  COMMISSION_UNLOCK_REFERRALS,
  EXECUTIVE_APPROVAL_ABOVE_GBP,
  LADDER_ACU_REWARD,
  LIFETIME_CAP_PER_CUSTOMER_GBP,
  MANUAL_REVIEW_ABOVE_GBP,
  NEVER_COMMISSIONABLE,
  PARTNER_KIND_DEFINITIONS,
  PARTNER_KINDS,
  PAYOUT_MINIMUM_GBP,
  PAYOUT_RULES,
  PROGRAMME_SUMMARY,
  REWARD_LADDER,
  REWARD_PATH,
  RISK_PATH,
  TRUST_HOLD_THRESHOLD,
  TRUST_REJECT_THRESHOLD,
  TRUST_SIGNALS,
  TRUST_SIGNAL_DEFINITIONS,
  VALIDATION_WINDOW_DAYS,
  commissionFor,
  payoutDecision,
  trustScore,
  verifiedNetRevenue,
} from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Growth Partner Programme — JESS MOVE',
  description:
    `Refer paying users, collect ACUs and privileges, then unlock ${COMMISSION_RATE * 100}% ` +
    `lifetime commission after ${COMMISSION_UNLOCK_REFERRALS} paid referrals. Paid on verified ` +
    'net revenue only.',
  alternates: { canonical: 'https://jessmove.com/partner-programme' },
};

/* A worked example, computed by the real function at build time. */
const WORKED = {
  paymentReceivedGbp: 2400,
  taxGbp: 400,
  paymentFeesGbp: 58.4,
  refundsGbp: 120,
  chargebacksGbp: 0,
  discountsGbp: 180,
  creditsGbp: 40,
  freeAcuValueGbp: 25,
  promotionalValueGbp: 60,
  fraudDeductionsGbp: 0,
};

const DEDUCTION_LABELS: readonly [keyof typeof WORKED, string][] = [
  ['taxGbp', 'VAT and tax'],
  ['paymentFeesGbp', 'Payment fees'],
  ['refundsGbp', 'Refunds'],
  ['chargebacksGbp', 'Chargebacks'],
  ['discountsGbp', 'Discounts'],
  ['creditsGbp', 'Credits'],
  ['freeAcuValueGbp', 'Free ACUs'],
  ['promotionalValueGbp', 'Promotional value'],
  ['fraudDeductionsGbp', 'Fraud deductions'],
];

const TRUST_EXAMPLES: readonly { label: string; signals: (typeof TRUST_SIGNALS)[number][] }[] = [
  { label: 'A clean referral', signals: [] },
  { label: 'Signed up over a VPN', signals: ['vpn_or_proxy'] },
  { label: 'Same network, VPN', signals: ['same_ip', 'vpn_or_proxy'] },
  { label: 'Same device, sudden volume', signals: ['same_device', 'velocity_spike'] },
  { label: 'Same payment card', signals: ['same_payment_card'] },
  { label: 'Already a customer', signals: ['existing_customer'] },
];

const PAYOUT_EXAMPLES: readonly {
  label: string;
  opts: Parameters<typeof payoutDecision>[0];
}[] = [
  { label: '£340, verified, KYC done', opts: { balanceGbp: 340, kycComplete: true, oldestEarningAgeDays: 46 } },
  { label: '£18, everything else fine', opts: { balanceGbp: 18, kycComplete: true, oldestEarningAgeDays: 46 } },
  { label: '£500, KYC not started', opts: { balanceGbp: 500, kycComplete: false, oldestEarningAgeDays: 60 } },
  { label: '£900 earned 12 days ago', opts: { balanceGbp: 900, kycComplete: true, oldestEarningAgeDays: 12 } },
  { label: '£1,400, past the window', opts: { balanceGbp: 1400, kycComplete: true, oldestEarningAgeDays: 50 } },
  { label: '£120 with a £100 chargeback', opts: { balanceGbp: 120, kycComplete: true, oldestEarningAgeDays: 50, clawbackGbp: 100 } },
];

const money = (n: number): string =>
  `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PartnerProgramme() {
  const net = verifiedNetRevenue(WORKED);
  const deducted = WORKED.paymentReceivedGbp - net;

  const eligibleResult = commissionFor(WORKED, {
    kind: 'approved_influencer',
    verifiedPaidReferrals: 0,
    lifetimeAlreadyPaidGbp: 0,
  });
  const notYetResult = commissionFor(WORKED, {
    kind: 'normal',
    verifiedPaidReferrals: 13,
    lifetimeAlreadyPaidGbp: 0,
  });
  const cappedResult = commissionFor(
    { ...WORKED, paymentReceivedGbp: 900_000, taxGbp: 0, discountsGbp: 0, creditsGbp: 0, refundsGbp: 0, promotionalValueGbp: 0, freeAcuValueGbp: 0, paymentFeesGbp: 0 },
    { kind: 'approved_influencer', verifiedPaidReferrals: 0, lifetimeAlreadyPaidGbp: 19_400 },
  );

  return (
    <>
      <SkipLink />
      <Nav current="/growth" />

      <main id="main">
        <PageHero
          crumb="Growth Partner Programme"
          eyebrow="Grow Jess Move. Unlock rewards."
          title="Earn for real growth."
          lede={
            `Refer paying users, collect ACUs and privileges, then unlock ` +
            `${COMMISSION_RATE * 100}% lifetime commission after ${COMMISSION_UNLOCK_REFERRALS} ` +
            'paid referrals. This is not a loose referral scheme — cash unlocks only after real ' +
            'paid growth, and it is paid only on money the business actually kept.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--3 card--light">
                <div className="stat__k">Commission rate</div>
                <div className="stat__v">{COMMISSION_RATE * 100}%</div>
                <p className="card__note">of verified net revenue, for the life of the customer</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Monthly cap</div>
                <div className="stat__v">None</div>
                <p className="card__note">there is no ceiling on what you earn in a month</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Lifetime cap</div>
                <div className="stat__v">£{(LIFETIME_CAP_PER_CUSTOMER_GBP / 1000).toFixed(0)}k</div>
                <p className="card__note">per customer, not per partner</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Cash unlocks at</div>
                <div className="stat__v">{COMMISSION_UNLOCK_REFERRALS}</div>
                <p className="card__note">verified paid referrals</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The reward ladder</p>
              <h2>ACUs and privileges first. Cash at twenty.</h2>
              <p className="lede">
                Every rung is reached on <strong>verified paid</strong> referrals — approved or
                paid, never pending, never held. A referral that is later reversed comes back off
                the count.
              </p>
            </div>

            <div className="tablewrap">
              <table className="policylist">
                <tbody>
                  {REWARD_LADDER.map((rung) => (
                    <tr className="policyrow" key={rung.status}>
                      <td style={{ width: 130 }}>
                        <strong style={{ fontSize: 20 }}>{rung.paidReferrals}</strong>
                        <br />
                        <span style={{ opacity: 0.55, fontSize: 13 }}>paid referrals</span>
                      </td>
                      <td>
                        <strong>{rung.label}</strong>
                      </td>
                      <td>{rung.reward}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {LADDER_ACU_REWARD[rung.status].toLocaleString('en-GB')} ACU
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {rung.cashUnlocked ? (
                          <span style={{ color: 'var(--jm-excellent)', fontWeight: 600 }}>
                            cash unlocked
                          </span>
                        ) : (
                          <span style={{ opacity: 0.5 }}>no cash yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dash" style={{ marginTop: 40 }}>
              {PARTNER_KINDS.map((kind) => {
                const def = PARTNER_KIND_DEFINITIONS[kind];
                return (
                  <article className="card card--4 card--light" key={kind}>
                    <div className="card__head">
                      <h3 className="card__t">{def.label}</h3>
                      <span
                        className="card__tag"
                        style={{
                          color: def.earnsCashImmediately
                            ? 'var(--jm-excellent)'
                            : 'var(--jm-monitor)',
                        }}
                      >
                        {def.earnsCashImmediately ? 'cash eligible' : 'rewards only'}
                      </span>
                    </div>
                    <p className="card__note">{def.summary}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Margin protection</p>
              <h2>What actually pays.</h2>
              <p className="lede">
                Commission is paid on <strong>Verified Net Revenue</strong> — money received from
                the customer, minus every deduction below. A programme that pays on gross pays out
                on revenue it never had, and that is why most referral schemes quietly close.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">A worked example</h3>
                  <span className="card__tag">computed at build time</span>
                </div>
                <div className="tablewrap">
                  <table className="policylist">
                    <tbody>
                      <tr className="policyrow">
                        <td>
                          <strong>Payment received</strong>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {money(WORKED.paymentReceivedGbp)}
                        </td>
                      </tr>
                      {DEDUCTION_LABELS.map(([key, label]) => (
                        <tr className="policyrow" key={key}>
                          <td style={{ opacity: 0.75 }}>− {label}</td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              opacity: WORKED[key] === 0 ? 0.4 : 0.85,
                            }}
                          >
                            {money(WORKED[key])}
                          </td>
                        </tr>
                      ))}
                      <tr className="policyrow">
                        <td>
                          <strong>Verified Net Revenue</strong>
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                          }}
                        >
                          {money(net)}
                        </td>
                      </tr>
                      <tr className="policyrow">
                        <td>
                          <strong>Commission at {COMMISSION_RATE * 100}%</strong>
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: 'var(--jm-excellent)',
                          }}
                        >
                          {money(eligibleResult.commissionGbp)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  {money(deducted)} of the {money(WORKED.paymentReceivedGbp)} received never
                  reaches the commissionable base. Paying {COMMISSION_RATE * 100}% of gross would
                  have cost {money(WORKED.paymentReceivedGbp * COMMISSION_RATE)} instead of{' '}
                  {money(eligibleResult.commissionGbp)}.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Never commissionable</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                    {NEVER_COMMISSIONABLE.length}
                  </span>
                </div>
                <ul className="pills">
                  {NEVER_COMMISSIONABLE.map((n) => (
                    <li key={n} style={{ borderColor: 'var(--jm-critical)' }}>
                      {n}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Whatever the trust score says. These are excluded by definition, not by
                  judgement.
                </p>
              </article>
            </div>

            <div className="dash" style={{ marginTop: 34 }}>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Same revenue, 13 referrals</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>
                    not yet
                  </span>
                </div>
                <p className="card__big">{money(notYetResult.commissionGbp)}</p>
                <p className="card__note">{notYetResult.reason}</p>
                <p className="card__note">
                  {money(notYetResult.grossCommissionGbp)} is what it would pay once unlocked. The
                  figure is shown all along so nothing is a surprise at twenty.
                </p>
              </article>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Same revenue, influencer</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    payable
                  </span>
                </div>
                <p className="card__big">{money(eligibleResult.commissionGbp)}</p>
                <p className="card__note">{eligibleResult.reason}</p>
              </article>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Near the lifetime cap</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>
                    capped
                  </span>
                </div>
                <p className="card__big">{money(cappedResult.commissionGbp)}</p>
                <p className="card__note">
                  {money(cappedResult.grossCommissionGbp)} earned at the rate, {money(600)} of
                  headroom left on this customer. {cappedResult.reason}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Anti-fraud</p>
              <h2>Every referral carries a trust score.</h2>
              <p className="lede">
                A hundred to start, with points deducted per signal. Below{' '}
                {TRUST_HOLD_THRESHOLD} it is held for review; below {TRUST_REJECT_THRESHOLD} it is
                rejected. Five signals are disqualifying on their own, whatever the score.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">The signals</h3>
                </div>
                <div className="tablewrap">
                  <table className="policylist">
                    <tbody>
                      {TRUST_SIGNALS.map((s) => {
                        const def = TRUST_SIGNAL_DEFINITIONS[s];
                        return (
                          <tr className="policyrow" key={s}>
                            <td>{def.label}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              −{def.penalty}
                            </td>
                            <td style={{ whiteSpace: 'nowrap', width: 120 }}>
                              {def.fatal ? (
                                <span style={{ color: 'var(--jm-critical)', fontWeight: 600 }}>
                                  disqualifying
                                </span>
                              ) : (
                                <span style={{ opacity: 0.5 }}>cumulative</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Scored for real</h3>
                  <span className="card__tag">live function</span>
                </div>
                {TRUST_EXAMPLES.map((ex) => {
                  const t = trustScore(ex.signals);
                  const colour =
                    t.verdict === 'verified'
                      ? 'var(--jm-excellent)'
                      : t.verdict === 'held'
                        ? 'var(--jm-monitor)'
                        : 'var(--jm-critical)';
                  return (
                    <div className="metric" key={ex.label}>
                      <span className="metric__k">{ex.label}</span>
                      <span className="metric__v" style={{ color: colour }}>
                        {t.score} · {t.verdict}
                      </span>
                    </div>
                  );
                })}
              </article>
            </div>

            <div className="dash" style={{ marginTop: 34 }}>
              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Reward path</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    forward only
                  </span>
                </div>
                <ul className="pills">
                  {REWARD_PATH.map((s) => (
                    <li key={s} style={{ borderColor: 'var(--jm-excellent)' }}>
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Only <strong>approved</strong> and <strong>paid</strong> count towards the
                  ladder. A paid referral can still be reversed, because a refund arrives after
                  the money leaves.
                </p>
              </article>
              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Risk path</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                    terminal
                  </span>
                </div>
                <ul className="pills">
                  {RISK_PATH.map((s) => (
                    <li key={s} style={{ borderColor: 'var(--jm-critical)' }}>
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  A held referral can recover to verified or be rejected — nothing else. Rejected
                  and reversed are ends, not stages.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Payouts</p>
              <h2>When money actually moves.</h2>
              <p className="lede">
                A blocked payout is <strong>carried forward, never forfeited</strong>. A scheme
                that voids a sub-minimum balance is one that keeps money it owes, and partners
                notice.
              </p>
            </div>

            <div className="dash">
              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">The rules</h3>
                </div>
                <ul className="checklist">
                  {PAYOUT_RULES.map((r) => (
                    <li key={r}>
                      <Tick />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Decided for real</h3>
                  <span className="card__tag">live function</span>
                </div>
                <div className="tablewrap">
                  <table className="policylist">
                    <tbody>
                      {PAYOUT_EXAMPLES.map((ex) => {
                        const d = payoutDecision(ex.opts);
                        const ok = d.payableGbp > 0;
                        return (
                          <tr className="policyrow" key={ex.label}>
                            <td>{ex.label}</td>
                            <td
                              style={{
                                fontFamily: 'var(--font-mono)',
                                color: ok ? 'var(--jm-excellent)' : 'var(--jm-monitor)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {ok ? money(d.payableGbp) : '—'}
                            </td>
                            <td style={{ opacity: 0.75 }}>{d.reason}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  The £{PAYOUT_MINIMUM_GBP} payout floor is separate from, and higher than, the
                  platform’s £5 minimum charge — the money moves the other way and the fee
                  structure is different. Above £
                  {MANUAL_REVIEW_ABOVE_GBP.toLocaleString('en-GB')} a payout is reviewed by hand;
                  above £{EXECUTIVE_APPROVAL_ABOVE_GBP.toLocaleString('en-GB')} it needs executive
                  approval. Validation takes {VALIDATION_WINDOW_DAYS.min}–
                  {VALIDATION_WINDOW_DAYS.max} days, which is how long a refund or chargeback
                  realistically takes to appear.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <article className="card card--12 card--light">
              <div className="card__head">
                <h3 className="card__t">The programme, in one paragraph</h3>
              </div>
              <p className="lede" style={{ margin: 0 }}>
                {PROGRAMME_SUMMARY}
              </p>
            </article>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Your influence. Jess Move growth.</h2>
            <p>
              Earn {COMMISSION_RATE * 100}% from verified customer revenue, with no monthly cap —
              up to £{LIFETIME_CAP_PER_CUSTOMER_GBP.toLocaleString('en-GB')} lifetime per
              customer.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/contact">
                Join the Growth Partner Programme
              </Link>
              <Link className="btn btn--ghost" href="/growth">
                Creator &amp; community tiers
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
