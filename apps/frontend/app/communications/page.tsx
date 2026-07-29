import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ADULT_ONLY_EVENTS,
  CATALOGUE_SIZE,
  CHANNEL_DEFINITIONS,
  COACHING_EVENTS,
  EVENT_CATALOGUE,
  EVENT_CATEGORIES,
  GUARDIAN_COPY_EVENTS,
  MANDATORY_EVENTS,
  MESSAGE_CHANNELS,
  WIRED_CHANNELS,
  channelCoverage,
  eventsIn,
  resolveDelivery,
  type EventSeverity,
  type Recipient,
} from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Communication Event Architecture — JESS MOVE',
  description:
    `One event engine — ${CATALOGUE_SIZE} events across ${EVENT_CATEGORIES.length} categories, ` +
    'fanning out to email, in-app, SMS, push and WhatsApp under one set of delivery rules.',
  alternates: { canonical: 'https://jessmove.com/communications' },
};

const SEVERITY_COLOUR: Record<EventSeverity, string> = {
  info: 'var(--jm-information)',
  success: 'var(--jm-excellent)',
  warning: 'var(--jm-monitor)',
  critical: 'var(--jm-critical)',
};

/** Worked examples. Each is resolved at build time by the real function. */
const SCENARIOS: readonly { title: string; event: string; who: string; to: Recipient }[] = [
  {
    title: 'A payment receipt, to a twelve-year-old',
    event: 'payment.successful',
    who: 'Explorer mode · consent irrelevant',
    to: {
      userId: 'child',
      age: 12,
      presence: 'full',
      consentedChannels: [...MESSAGE_CHANNELS],
      inQuietHours: false,
      contextHeld: false,
      coachingSentToday: 0,
      dailyCap: 4,
      hasGuardian: true,
    },
  },
  {
    title: 'A movement nudge, coach switched off',
    event: 'snap.offered',
    who: 'Momentum mode · MOVA off',
    to: {
      userId: 'adult',
      age: 34,
      presence: 'off',
      consentedChannels: ['in_app', 'push', 'email'],
      inQuietHours: false,
      contextHeld: false,
      coachingSentToday: 0,
      dailyCap: 6,
      hasGuardian: false,
    },
  },
  {
    title: 'The same nudge, while driving',
    event: 'snap.offered',
    who: 'Momentum mode · context held',
    to: {
      userId: 'adult',
      age: 34,
      presence: 'full',
      consentedChannels: ['in_app', 'push'],
      inQuietHours: false,
      contextHeld: true,
      coachingSentToday: 1,
      dailyCap: 6,
      hasGuardian: false,
    },
  },
  {
    title: 'A breach notice, everything opted out, 3am',
    event: 'privacy.breach_notification',
    who: 'Balance mode · no consented channels',
    to: {
      userId: 'adult',
      age: 52,
      presence: 'off',
      consentedChannels: [],
      inQuietHours: true,
      contextHeld: true,
      coachingSentToday: 6,
      dailyCap: 6,
      hasGuardian: false,
    },
  },
  {
    title: 'A red flag for a minor, at night',
    event: 'clinical.red_flag_detected',
    who: 'Teen mode · guardian linked',
    to: {
      userId: 'teen',
      age: 15,
      presence: 'quiet',
      consentedChannels: ['in_app'],
      inQuietHours: true,
      contextHeld: false,
      coachingSentToday: 0,
      dailyCap: 4,
      hasGuardian: true,
    },
  },
  {
    title: 'A weekly insight, at night',
    event: 'insight.weekly_ready',
    who: 'Independence mode · quiet hours',
    to: {
      userId: 'later',
      age: 71,
      presence: 'compact',
      consentedChannels: ['email', 'in_app'],
      inQuietHours: true,
      contextHeld: false,
      coachingSentToday: 0,
      dailyCap: 3,
      hasGuardian: false,
    },
  },
];

export default function Communications() {
  const coverage = channelCoverage();
  const maxCoverage = Math.max(...Object.values(coverage));

  return (
    <>
      <SkipLink />
      <Nav current="/communications" />

      <main id="main">
        <PageHero
          crumb="Communications"
          eyebrow="Event architecture"
          title="One event engine. Every message the platform can send."
          lede={
            `${CATALOGUE_SIZE} catalogued events across ${EVENT_CATEGORIES.length} categories, ` +
            'fanning out to five channels under one set of delivery rules. Nothing in this ' +
            'platform sends a message by building a string inside a service.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--3 card--light">
                <div className="stat__k">Catalogue events</div>
                <div className="stat__v">{CATALOGUE_SIZE}</div>
                <p className="card__note">{EVENT_CATEGORIES.length} categories</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Mandatory notices</div>
                <div className="stat__v">{MANDATORY_EVENTS.length}</div>
                <p className="card__note">bypass channel preferences — never age</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Adult-only</div>
                <div className="stat__v">{ADULT_ONLY_EVENTS.length}</div>
                <p className="card__note">absent below 18, not consent-gated</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Channels wired</div>
                <div className="stat__v">
                  {WIRED_CHANNELS.length}
                  <span style={{ fontSize: '0.5em', opacity: 0.55 }}> / {MESSAGE_CHANNELS.length}</span>
                </div>
                <p className="card__note">email · in-app · sms · push · whatsapp</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Resolution order</p>
              <h2>Five checks, and the order is the argument.</h2>
              <p className="lede">
                A platform serving ten-year-olds and ninety-year-olds from one engine cannot have
                a single “send to user” path. Every message goes through the same function, and
                that function is pure — which is why the rules below are unit tests rather than
                log output somebody has to read.
              </p>
            </div>

            <div className="steps">
              {[
                {
                  h: 'Age',
                  p: 'An adult-only event does not exist below 18. Not suppressed by preference, not unlockable by consent, not reachable by an administrator. It is checked first because it is the only rule with no override anywhere in the platform.',
                },
                {
                  h: 'Coach presence',
                  p: 'If MOVA is off, coaching messages do not send — and no severity overrides that, because a person who turned the coach off did not ask for a louder coach. Statutory notices are a different class and are unaffected.',
                },
                {
                  h: 'Context — Law 2',
                  p: 'A nudge fired into a moment the person cannot move is a defect, not a delivery. A held context blocks the send and the hold is recorded as the correct outcome rather than a failure.',
                },
                {
                  h: 'Quiet hours and the daily cap',
                  p: 'Ordinary traffic waits until morning. The cap is per person and per mode. Exempt events — security, safety, clinical, breach — pass, and nothing else does.',
                },
                {
                  h: 'Channel consent',
                  p: 'The last check, and the only one a mandatory notice bypasses. Mandatory means “we will tell you about your own security, money and data whatever your preferences say”. It has never meant “ignore the age rules”.',
                },
              ].map((s, i) => (
                <div className="steprow" key={s.h}>
                  <div className="steprow__n">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{s.h}</h3>
                    <p>{s.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Worked examples</p>
              <h2>Resolved by the real function, at build time.</h2>
              <p className="lede">
                Nothing below is illustrative. Each card calls{' '}
                <code>resolveDelivery</code> with the recipient described and prints what came
                back, including the explanation.
              </p>
            </div>

            <div className="dash">
              {SCENARIOS.map((s) => {
                const event = EVENT_CATALOGUE.find((e) => e.key === s.event)!;
                const plan = resolveDelivery(event, s.to);
                const sent = plan.deliver.length > 0;
                return (
                  <article className="card card--6 card--light" key={s.title}>
                    <div className="card__head">
                      <h3 className="card__t">{s.title}</h3>
                      <span
                        className="card__tag"
                        style={{ color: sent ? 'var(--jm-excellent)' : 'var(--jm-monitor)' }}
                      >
                        {sent ? 'delivered' : 'suppressed'}
                      </span>
                    </div>
                    <p className="card__note" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {event.key}
                    </p>
                    <p className="card__note">{s.who}</p>
                    <ul className="pills">
                      {sent ? (
                        plan.deliver.map((c) => (
                          <li key={c} style={{ borderColor: 'var(--jm-excellent)' }}>
                            {CHANNEL_DEFINITIONS[c].label}
                          </li>
                        ))
                      ) : (
                        plan.suppressed.map((r) => (
                          <li key={r} style={{ borderColor: 'var(--jm-monitor)' }}>
                            {r.replace(/_/g, ' ')}
                          </li>
                        ))
                      )}
                      {plan.guardianCopy && (
                        <li style={{ borderColor: 'var(--jm-purple)' }}>+ guardian copy</li>
                      )}
                    </ul>
                    <p className="card__note">{plan.explanation}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Channel coverage</p>
              <h2>How many events name each channel by default.</h2>
              <p className="lede">
                Every event lands in-app, because that is the record of what happened. SMS is
                reserved for warning and critical traffic — it costs eighty times what an email
                costs, and a catalogue that forgets this is a catalogue that produces a surprising
                invoice.
              </p>
            </div>

            <div className="bars">
              {MESSAGE_CHANNELS.map((c) => {
                const def = CHANNEL_DEFINITIONS[c];
                return (
                  <div className="bar" key={c}>
                    <div className="bar__label">
                      {def.label}
                      {!def.wired && (
                        <span style={{ opacity: 0.55 }}> · no provider</span>
                      )}
                    </div>
                    <div className="bar__track">
                      <div
                        className="bar__fill"
                        style={{
                          width: `${Math.max(1.5, (coverage[c] / maxCoverage) * 100)}%`,
                          background: def.wired ? 'var(--jm-teal)' : 'var(--jm-divider-d)',
                        }}
                      />
                    </div>
                    <div className="bar__pct">
                      {coverage[c]} {coverage[c] === 1 ? 'event' : 'events'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="dash" style={{ marginTop: 40 }}>
              {MESSAGE_CHANNELS.map((c) => {
                const def = CHANNEL_DEFINITIONS[c];
                return (
                  <article className="card card--4" key={c}>
                    <div className="card__head">
                      <h3 className="card__t">{def.label}</h3>
                      <span
                        className="card__tag"
                        style={{ color: def.wired ? 'var(--jm-excellent)' : 'var(--jm-unavailable)' }}
                      >
                        {def.wired ? 'wired' : 'unwired'}
                      </span>
                    </div>
                    <p className="card__note">{def.note}</p>
                    <p className="card__note" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      £{def.unitCostGbp.toFixed(5)} per message
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The catalogue</p>
              <h2>
                {CATALOGUE_SIZE} events, {EVENT_CATEGORIES.length} categories.
              </h2>
              <p className="lede">
                Every message the platform can send. A <strong>mandatory</strong> notice bypasses
                channel preferences. An <strong>adult-only</strong> event does not exist below 18.
                A <strong>guardian copy</strong> reaches the linked guardian when the subject is a
                minor. <strong>Coaching</strong> obeys presence, context and the daily cap.
              </p>
            </div>

            {EVENT_CATEGORIES.map((category) => {
              const events = eventsIn(category);
              return (
                <section key={category} style={{ marginBottom: 44 }}>
                  <h3 style={{ fontSize: 21, margin: '0 0 4px' }}>{category}</h3>
                  <p className="card__note" style={{ marginBottom: 16 }}>
                    {events.length} events
                  </p>
                  <div className="tablewrap">
                    <table className="policylist">
                      <tbody>
                        {events.map((e) => (
                          <tr className="policyrow" key={e.key}>
                            <td style={{ minWidth: 210 }}>
                              <strong>{e.name}</strong>
                              <br />
                              <code style={{ fontSize: 12.5, opacity: 0.6 }}>{e.key}</code>
                            </td>
                            <td>{e.subject}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <span style={{ color: SEVERITY_COLOUR[e.severity], fontWeight: 600 }}>
                                {e.severity}
                              </span>
                            </td>
                            <td style={{ minWidth: 190 }}>
                              <ul className="pills" style={{ margin: 0 }}>
                                {e.channels.map((c) => (
                                  <li
                                    key={c}
                                    style={{
                                      opacity: CHANNEL_DEFINITIONS[c].wired ? 1 : 0.45,
                                      fontSize: 12,
                                    }}
                                  >
                                    {c.replace('_', '-')}
                                  </li>
                                ))}
                              </ul>
                            </td>
                            <td style={{ minWidth: 150 }}>
                              <ul className="pills" style={{ margin: 0 }}>
                                {e.mandatory && (
                                  <li style={{ borderColor: 'var(--jm-coral)', fontSize: 12 }}>
                                    mandatory
                                  </li>
                                )}
                                {e.adultOnly && (
                                  <li style={{ borderColor: 'var(--jm-purple)', fontSize: 12 }}>
                                    18+
                                  </li>
                                )}
                                {e.guardianCopy && (
                                  <li style={{ borderColor: 'var(--jm-sky)', fontSize: 12 }}>
                                    guardian
                                  </li>
                                )}
                                {e.coaching && (
                                  <li style={{ borderColor: 'var(--jm-lime)', fontSize: 12 }}>
                                    coaching
                                  </li>
                                )}
                                {e.quietHoursExempt && (
                                  <li style={{ borderColor: 'var(--jm-orange)', fontSize: 12 }}>
                                    night
                                  </li>
                                )}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Counts</p>
              <h2>What the flags actually cover.</h2>
            </div>
            <div className="dash">
              <article className="card card--3 card--light">
                <div className="stat__k">Mandatory</div>
                <div className="stat__v">{MANDATORY_EVENTS.length}</div>
                <p className="card__note">bypass channel preferences</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Adult-only</div>
                <div className="stat__v">{ADULT_ONLY_EVENTS.length}</div>
                <p className="card__note">every billing, wallet, partner and BodyCommand event</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Guardian copy</div>
                <div className="stat__v">{GUARDIAN_COPY_EVENTS.length}</div>
                <p className="card__note">safety, clinical, moderation and data rights</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Coaching</div>
                <div className="stat__v">{COACHING_EVENTS.length}</div>
                <p className="card__note">none of them are mandatory — a nudge is never statutory</p>
              </article>
            </div>

            <p className="lede" style={{ marginTop: 34 }}>
              Templates render through one function that <strong>throws on an unknown token</strong>,
              so <code>{'{{firstname}}'}</code> cannot ship as literal text in a live subject line.
              Every subject in the catalogue is asserted to render in the test suite.
            </p>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Fire any event and read the decision.</h2>
            <p>
              <code>POST /comms/preview</code> resolves without sending —
              the dry run behind “why did I not get this?”. With no provider key set, a send is
              recorded as <code>sandbox</code>: the resolution, the rendered subject, the channel
              set and the cost are all real, and only the network call is absent.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/console">
                Open the API console
              </Link>
              <Link className="btn btn--ghost" href="/developers">
                Developer reference
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
