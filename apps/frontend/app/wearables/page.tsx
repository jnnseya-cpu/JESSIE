import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DATA_SCOPES,
  DEGRADATION,
  DELIVERY_TIERS,
  DISAGREEMENT_TOLERANCE_PCT,
  NEVER_INGESTED,
  PROVIDERS,
  PROVIDER_DEFINITIONS,
  REFUSAL_REASON,
  REVOCATION_GUARANTEES,
  STALE_AFTER_MINUTES,
  disclosureFor,
  isStale,
  resolveConflict,
  shouldWidenForDisagreement,
} from '@jessmove/shared';
import { CompareBars, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'Wearables — JESS MOVE',
  description:
    'Apple Health, Health Connect, Fitbit, Garmin, Samsung, Oura and Polar — each individually ' +
    'revocable, none of them required to start, and nine data types deliberately refused.',
};

/* Two watches, disagreeing. Resolved by the engine. */
const READINGS = [
  { provider: 'fitbit' as const, scope: 'steps' as const, value: 5240, ageMinutes: 34 },
  { provider: 'apple_health' as const, scope: 'steps' as const, value: 4110, ageMinutes: 6 },
  { provider: 'garmin' as const, scope: 'steps' as const, value: 4880, ageMinutes: 220 },
];
const RESOLUTION = resolveConflict(READINGS);

const LAG = PROVIDERS.map((p) => ({
  label: PROVIDER_DEFINITIONS[p].label,
  value: PROVIDER_DEFINITIONS[p].typicalLagMinutes,
  tone:
    PROVIDER_DEFINITIONS[p].transport === 'on_device' ? 'var(--jm-excellent)' : 'var(--jm-blue)',
  note:
    PROVIDER_DEFINITIONS[p].transport === 'on_device'
      ? 'On device — raw data never leaves your phone.'
      : 'Cloud OAuth — the provider holds a copy either way.',
}));

const GARMIN_DISCLOSURE = disclosureFor('garmin');

export default function Wearables() {
  return (
    <>
      <SkipLink />
      <Nav current="/wearables" />

      <main id="main">
        <PageHero
          crumb="Wearables"
          eyebrow="Integrations"
          title={
            <>
              Seven providers.<br />
              None of them required.
            </>
          }
          lede={
            `The floor of this product is a phone that receives a text message. A wearable ` +
            `improves the estimate; it never gates the experience. Every connection is revocable ` +
            `on its own, and this page states exactly what revoking each one costs — because ` +
            `"you can turn it off" means nothing if nobody tells you the price.`
          }
        />

        {/* ---------------- providers ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-sky)' }}>
                What connects
              </p>
              <h2>Two of them never let your data off the phone.</h2>
              <p className="lede">
                On-device providers classify locally and hand over a summary. Cloud providers
                already hold your data — connecting them shares it with us as well, and the table
                says so rather than implying a difference that does not exist.
              </p>
            </div>

            <article className="card card--light">
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">Provider</th>
                      <th scope="col">Requests</th>
                      <th scope="col">Transport</th>
                      <th scope="col">Raw data leaves device</th>
                      <th scope="col">Typical lag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROVIDERS.map((p) => {
                      const d = PROVIDER_DEFINITIONS[p];
                      return (
                        <tr key={p}>
                          <td style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{d.label}</td>
                          <td>{d.requests.map((r) => r.replace(/_/g, ' ')).join(', ')}</td>
                          <td>
                            <code>{d.transport.replace(/_/g, '-')}</code>
                          </td>
                          <td>
                            {d.rawDataLeavesDevice ? (
                              <span style={{ color: 'var(--jm-monitor)' }}>Yes</span>
                            ) : (
                              <span style={{ color: 'var(--jm-excellent)' }}>
                                <Tick /> No
                              </span>
                            )}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            ~{d.typicalLagMinutes} min
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dash" style={{ marginTop: 22 }}>
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">How stale a reading is by the time we see it</h3>
                  <span className="card__tag">minutes</span>
                </div>
                <CompareBars rows={LAG} max={35} unit=" min" />
              </article>
              <article className="card card--5 card--light" style={{ gap: 14 }}>
                <Stat
                  k="Required to start"
                  v="None"
                  sub={`The lightweight tier reaches any phone that receives a message. ${DELIVERY_TIERS.length} delivery tiers exist precisely so a wearable is never a prerequisite.`}
                  tone="var(--jm-excellent)"
                />
                <Stat
                  k="Stale after"
                  v={`${STALE_AFTER_MINUTES / 60}h`}
                  sub="Past this, a reading is labelled rather than used silently. A confident number from three hours ago is worse than an honest gap."
                  tone="var(--jm-monitor)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- refusals ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">What is refused</p>
              <h2>Nine data types we could have, and do not take.</h2>
              <p className="lede">
                Several of these are available from the providers above with one extra scope.
                They are deliberately left on the table.
              </p>
            </div>

            <div className="tiles">
              {NEVER_INGESTED.map((n) => (
                <article
                  className="tile tile--ink"
                  key={n}
                  style={{ ['--tone' as string]: 'var(--jm-critical)' }}
                >
                  <div className="tile__n">
                    <Cross /> NEVER
                  </div>
                  <p style={{ fontSize: 16 }}>{n.replace(/^./, (c) => c.toUpperCase())}</p>
                </article>
              ))}
            </div>

            <article className="card" style={{ marginTop: 26 }}>
              <div className="card__head">
                <h3 className="card__t">Why, when somebody inevitably asks</h3>
              </div>
              <p className="card__note" style={{ fontSize: 16 }}>
                {REFUSAL_REASON}
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- degradation ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Revocation</p>
              <h2>Turning one off degrades one input. Here is which.</h2>
              <p className="lede">
                This table is rendered verbatim in the consent centre. Every row names what gets
                less precise <em>and</em> what carries on working, because a consent screen that
                only lists what you lose is designed to stop you leaving.
              </p>
            </div>

            <article className="card card--light">
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">Scope</th>
                      <th scope="col">
                        <Cross /> Loses precision
                      </th>
                      <th scope="col">
                        <Check /> Still works
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DATA_SCOPES.map((s) => (
                      <tr key={s}>
                        <td style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>
                          {s.replace(/_/g, ' ')}
                        </td>
                        <td style={{ opacity: 0.8 }}>{DEGRADATION[s].losesPrecision}</td>
                        <td style={{ color: 'var(--jm-excellent)' }}>{DEGRADATION[s].stillWorks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dash" style={{ marginTop: 22 }}>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Four guarantees on disconnecting</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    shown before you connect
                  </span>
                </div>
                <ul className="checklist">
                  {REVOCATION_GUARANTEES.map((g) => (
                    <li key={g}>
                      <Check />
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">The disclosure, before a single tap</h3>
                  <span className="card__tag">Garmin, as an example</span>
                </div>
                <p className="card__note">
                  <strong>Accesses:</strong>{' '}
                  {GARMIN_DISCLOSURE.accesses.map((a) => a.replace(/_/g, ' ')).join(', ')}.
                </p>
                <p className="card__note">
                  <strong>Why:</strong> {GARMIN_DISCLOSURE.whyNeeded}
                </p>
                <p className="card__note">
                  <strong>Will not access:</strong> {GARMIN_DISCLOSURE.willNotAccess.length} data
                  types, listed above.
                </p>
                <p className="card__note">
                  <strong>To disconnect:</strong> {GARMIN_DISCLOSURE.howToDisconnect}
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- conflict ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Disagreement</p>
              <h2>Two watches disagree more often than anyone expects.</h2>
              <p className="lede">
                Resolution is deterministic and stated: freshest first, then on-device over
                cloud. And when the sources are far enough apart, the engine stops picking a
                winner and widens its own uncertainty instead.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Three sources, one step count</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>
                    {RESOLUTION.disagreementPct}% apart
                  </span>
                </div>
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Reading</th>
                        <th scope="col">Age</th>
                        <th scope="col">Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {READINGS.map((r) => (
                        <tr key={r.provider}>
                          <td style={{ fontWeight: 600 }}>
                            {PROVIDER_DEFINITIONS[r.provider].label}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {r.value.toLocaleString('en-GB')}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {r.ageMinutes} min
                            {isStale(r) && (
                              <>
                                {' '}
                                <span style={{ color: 'var(--jm-monitor)', fontWeight: 600 }}>
                                  stale
                                </span>
                              </>
                            )}
                          </td>
                          <td>
                            {r.provider === RESOLUTION.chosen.provider ? (
                              <span style={{ color: 'var(--jm-excellent)', fontWeight: 600 }}>
                                <Tick /> chosen
                              </span>
                            ) : (
                              <span style={{ opacity: 0.4 }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  <strong>{RESOLUTION.because}</strong> Garmin was dropped for being past the{' '}
                  {STALE_AFTER_MINUTES / 60}-hour staleness line rather than for being wrong.
                </p>
              </article>

              <article className="card card--5 card--light" style={{ gap: 14 }}>
                <Stat
                  k="Disagreement"
                  v={`${RESOLUTION.disagreementPct}%`}
                  sub={`Tolerance is ${DISAGREEMENT_TOLERANCE_PCT}%. ${
                    shouldWidenForDisagreement(RESOLUTION.disagreementPct)
                      ? 'This exceeds it, so readiness carries a wider band today rather than a false precision.'
                      : 'Within tolerance, so the chosen reading stands as it is.'
                  }`}
                  tone="var(--jm-monitor)"
                />
                <Stat
                  k="Tie-break order"
                  v="3 rules"
                  sub="Freshest, then on-device over cloud, then the provider that natively owns the scope. Deterministic, so the same inputs always give the same answer."
                  tone="var(--jm-blue)"
                />
              </article>
            </div>
          </div>
        </section>

        <JoinCta
          heading="Connect nothing, and start anyway."
          says="Every wearable is optional and individually revocable. The platform finds your gaps from the shape of your day whether or not a watch is involved."
          talkTo="/privacy"
          talkLabel="What we store"
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
