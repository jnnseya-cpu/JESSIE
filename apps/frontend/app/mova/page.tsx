import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AGE_MODES,
  AGE_MODE_DEFINITIONS,
  BRAND,
  MOVA_PRESENCE,
  MOVA_REFUSES,
  MOVA_STATES,
  MOVA_STATE_KEYS,
  NEVER_SEND_TO_MODEL,
  PRESENCE_DEFINITIONS,
  REGISTERS,
  explain,
  mayDeliver,
  reasonLine,
} from '@jessmove/shared';
import { CompareBars, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'MOVA — JESS MOVE',
  description:
    'The AI coach that has to explain itself before it is allowed to speak, can only narrow ' +
    'what safety allowed, and can be switched off entirely without losing a single feature.',
};

const STATE_TONE: Record<string, string> = {
  movement: 'var(--jm-teal)',
  food: 'var(--jm-orange)',
  body: 'var(--jm-purple)',
  recovery: 'var(--jm-sky)',
  success: 'var(--jm-positive)',
  attention: 'var(--jm-monitor)',
  safety: 'var(--jm-critical)',
};

/* The trace is built by the engine — if it were incomplete, this page would
   fail to build rather than render a vague sentence. */
const TRACE = explain({
  trigger: 'You have been seated for 94 minutes.',
  window: 'There are 25 free minutes before your 15:00 call.',
  fit: 'This one is silent, seated and needs no space.',
  ruledOut: [
    'Standing balance sequence — no stable support detected',
    'Stairwell walk — 25 minutes is not enough to get back and settle',
    'Shoulder mobility — offered four hours ago',
  ],
  attribution: {
    trigger: 'Sedentary Pattern Detector',
    window: 'Daily Rhythm',
    fit: 'Micro-Movement Coach',
  },
  confidence: 0.86,
});

const PRESENCE_RETENTION = MOVA_PRESENCE.map((p, i) => ({
  label: PRESENCE_DEFINITIONS[p].label,
  value: 100,
  tone: ['var(--jm-purple)', 'var(--jm-blue)', 'var(--jm-sky)', 'var(--jm-excellent)'][i],
  note: PRESENCE_DEFINITIONS[p].what,
}));

export default function Mova() {
  return (
    <>
      <SkipLink />
      <Nav current="/mova" />

      <main id="main">
        <PageHero
          crumb="MOVA"
          eyebrow="Movement Optimisation and Vitality Assistant"
          title={
            <>
              A coach that has to explain itself<br />
              before it is allowed to speak.
            </>
          }
          lede={
            'MOVA is not an avatar of a doctor or a fitness model. It is an assistant with three ' +
            'hard constraints: it must produce a machine-readable reason for every suggestion, it ' +
            'may only narrow what the safety layer already allowed, and it can be switched off ' +
            'completely without the product losing a single capability.'
          }
        />

        {/* ---------------- the reason trace ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-purple)' }}>
                Constraint one — explainability
              </p>
              <h2>“Why this?” is not a feature. It is the precondition.</h2>
              <p className="lede">
                Every suggestion carries a trace with three required parts. If any is missing,{' '}
                <code>explain()</code> throws and nothing is shown — because a system that cannot
                say why it interrupted you has not earned the interruption.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">The card you actually see</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-purple)' }}>
                    confidence {Math.round(TRACE.confidence * 100)}%
                  </span>
                </div>
                <p style={{ fontSize: 18, lineHeight: 1.55 }}>{reasonLine(TRACE)}</p>

                <div className="card__head" style={{ marginTop: 6 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    And what it ruled out on the way
                  </h3>
                </div>
                <ul className="prose" style={{ margin: 0, paddingLeft: 20, fontSize: 15 }}>
                  {TRACE.ruledOut.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="card__note">
                  The rejected options are shown because they are the most useful part. A
                  suggestion is only meaningful next to the things it beat.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">The trace beneath it</h3>
                  <span className="card__tag">auditable</span>
                </div>
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">Part</th>
                        <th scope="col">Produced by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['trigger', 'window', 'fit'] as const).map((k) => (
                        <tr key={k}>
                          <td>
                            <code>{k}</code>
                          </td>
                          <td>{TRACE.attribution[k]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card__note">
                  Each part names the agent that produced it, so a bad suggestion can be traced
                  to the component that caused it rather than blamed on &ldquo;the AI&rdquo;.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- presence ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Constraint two — the off switch</p>
              <h2>Off is a mode, not a punishment.</h2>
              <p className="lede">
                Most products make their assistant load-bearing, so turning it off breaks
                everything. Here the coach sits on top of the engine rather than inside it — the
                data-only experience keeps every chart, every reading and the entire movement
                library.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">What each setting keeps</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    all four fully supported
                  </span>
                </div>
                <CompareBars rows={PRESENCE_RETENTION} unit="%" />
                <p className="card__note">
                  Every bar is full because none of these settings removes a capability. What
                  changes is how much personality arrives with it.
                </p>
              </article>

              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Off — data only</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    still yours
                  </span>
                </div>
                <ul className="pills pills--ink">
                  {PRESENCE_DEFINITIONS.off.retains.map((r) => (
                    <li key={r} style={{ borderColor: 'var(--jm-excellent)' }}>
                      {r}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Asserted in continuous integration:{' '}
                  <code>capabilitiesLostByTurningOff()</code> returns an empty list, and a build
                  that changes that fails.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- states ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Context</p>
              <h2>Seven states. Colour is the second signal, never the first.</h2>
              <p className="lede">
                MOVA changes colour with what it is doing, and always prints the state name
                alongside — a person who cannot distinguish teal from sky still knows whether
                they are being coached or warned.
              </p>
            </div>

            <div className="tiles">
              {MOVA_STATE_KEYS.map((k) => {
                const s = MOVA_STATES[k];
                return (
                  <article className="tile" key={k} style={{ ['--tone' as string]: STATE_TONE[k] }}>
                    <div className="tile__band" style={{ background: STATE_TONE[k] }} aria-hidden="true" />
                    <h3>{s.label}</h3>
                    <p>{s.means}</p>
                    <ul>
                      <li>
                        {s.mayInterruptQuiet
                          ? 'May reach you in Quiet mode.'
                          : 'Silent in Quiet mode.'}
                      </li>
                    </ul>
                  </article>
                );
              })}
            </div>

            <article className="card card--light" style={{ marginTop: 26 }}>
              <div className="card__head">
                <h3 className="card__t">What reaches you in each setting</h3>
                <span className="card__tag">delivery matrix</span>
              </div>
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">State</th>
                      {MOVA_PRESENCE.map((p) => (
                        <th scope="col" key={p}>
                          {PRESENCE_DEFINITIONS[p].label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOVA_STATE_KEYS.map((k) => (
                      <tr key={k}>
                        <td style={{ fontWeight: 600 }}>{MOVA_STATES[k].label}</td>
                        {MOVA_PRESENCE.map((p) => (
                          <td key={p}>
                            {mayDeliver(k, p) ? (
                              <span style={{ color: 'var(--jm-excellent)' }}>
                                <Tick />
                              </span>
                            ) : (
                              <span style={{ opacity: 0.35 }}>
                                <Cross />
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card__note">
                Note the bottom-right cell. <strong>Off means off, including for safety.</strong>{' '}
                A coach that decides its own warnings are important enough to ignore your setting
                is not switched off — it is just quieter, and that is a different product.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- register ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Register</p>
              <h2>One personality. {AGE_MODES.length} voices.</h2>
              <p className="lede">
                The same reasoning arrives in six registers. This is not a tone slider — the
                register is derived from mode, which is derived from a verified age band, and it
                carries different prohibitions in each.
              </p>
            </div>

            <div className="tablewrap">
              <table className="endpoints">
                <thead>
                  <tr>
                    <th scope="col">Mode</th>
                    <th scope="col">How it opens</th>
                    <th scope="col">What it never does</th>
                  </tr>
                </thead>
                <tbody>
                  {AGE_MODES.map((m) => (
                    <tr key={m}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {AGE_MODE_DEFINITIONS[m].label}
                        <br />
                        <small style={{ opacity: 0.55 }}>
                          {AGE_MODE_DEFINITIONS[m].minAge}–{AGE_MODE_DEFINITIONS[m].maxAge}
                        </small>
                      </td>
                      <td>“{REGISTERS[m].opens}”</td>
                      <td style={{ opacity: 0.75 }}>{REGISTERS[m].never}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------------- refusals ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Constraint three — refusals</p>
              <h2>Seven things MOVA will not do, however it is asked.</h2>
              <p className="lede">
                These are refusals rather than confidence thresholds. A better model does not
                unlock them, and neither does insisting.
              </p>
            </div>

            <div className="tablewrap">
              <table className="endpoints">
                <thead>
                  <tr>
                    <th scope="col">Asked to</th>
                    <th scope="col">Does instead</th>
                  </tr>
                </thead>
                <tbody>
                  {MOVA_REFUSES.map((r) => (
                    <tr key={r.ask}>
                      <td style={{ color: 'var(--jm-coral)', fontWeight: 600 }}>{r.ask}</td>
                      <td>{r.instead}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dash" style={{ marginTop: 28 }}>
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Never sent to a model provider</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                    redacted at the gateway
                  </span>
                </div>
                <ul className="pills pills--ink">
                  {NEVER_SEND_TO_MODEL.map((n) => (
                    <li key={n} style={{ borderColor: 'var(--jm-critical)' }}>
                      {n}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Enforced in the AI gateway rather than in the prompt, because a prompt is a
                  request and a gateway is a wall.
                </p>
              </article>

              <article className="card card--5" style={{ gap: 14 }}>
                <Stat
                  k="Can widen safety?"
                  v="Never"
                  sub="MOVA may narrow what the safety layer allowed. It may not widen it, and it cannot invent a movement outside the reviewed library."
                  tone="var(--jm-critical)"
                />
                <Stat
                  k="Claims to be human?"
                  v="Never"
                  sub="MOVA speaks in first person and states that it is software whenever asked, in every mode."
                  tone="var(--jm-purple)"
                />
              </article>
            </div>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Meet {BRAND.coach}.</h2>
            <p>Or turn it off on day one and keep the whole engine. Both are supported.</p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/get-started">
                Start free
              </Link>
              <Link className="btn btn--ghost" href="/micro-movement">
                What it actually suggests
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
