import type { Metadata } from 'next';
import {
  BC_AGENTS,
  BODY_PATHWAYS,
  ESCALATION_SIGNALS,
  NON_SCALE_VICTORIES,
  PATHWAY_DEFINITIONS,
  PROHIBITED_MECHANICS,
  SCORE_DIMENSIONS,
  SCORE_LABELS,
  SCORE_WEIGHTS,
} from '@movequest/body-command';
import { Cross, Footer, Nav, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Body Balance — MOVEQUEST',
  description:
    'BodyCommand AI: nineteen agents, nine pathways, one supervisor. BMI is a navigation ' +
    'signal, never a verdict.',
};

const readable = (s: string) =>
  s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function BodyBalance() {
  const supervisor = Object.values(BC_AGENTS).find((a) => a.supervisor)!;
  const reductionPaths = BODY_PATHWAYS.filter(
    (p) => PATHWAY_DEFINITIONS[p].reductionPermitted,
  );

  return (
    <>
      <SkipLink />
      <Nav current="/body-balance" />

      <main id="main">
        <section className="ahero ahero--cool">
          <div className="hero__aura" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap ahero__inner">
            <p className="eyebrow eyebrow--onDark">BodyCommand AI · {BC_AGENTS.ORCH.name}</p>
            <h1>
              BMI is a signal.<br />
              It is not a <em>verdict</em>.
            </h1>
            <p className="ahero__lede">
              BMI cannot tell muscle from fat, and it means something different at eleven than at
              eighty. So it is interpreted alongside waist, trend, muscularity, age and
              measurement confidence — and it contributes nothing at all to the score.
            </p>
          </div>
        </section>

        {/* ---- pathways ---- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Nine pathways</p>
              <h2>
                Only {reductionPaths.length} of {BODY_PATHWAYS.length} permit weight reduction.
              </h2>
              <p className="lede">
                The rest refuse it at the type level, not by convention. A request for reduction
                on a pathway that forbids it does not produce a warning — it produces a different
                pathway.
              </p>
            </div>

            <div className="paths">
              {BODY_PATHWAYS.map((p) => {
                const def = PATHWAY_DEFINITIONS[p];
                return (
                  <article className="path" key={p}>
                    <div className="path__name">{def.label}</div>
                    <p className="path__focus">{def.focus.slice(0, 3).join(' · ')}</p>
                    <div
                      className={`path__flag ${def.reductionPermitted ? 'path__flag--yes' : 'path__flag--no'}`}
                    >
                      {def.reductionPermitted ? 'reduction permitted' : 'reduction blocked'}
                      {!def.automationPermitted && ' · human review'}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---- scorecard ---- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The scorecard</p>
              <h2>Ninety per cent of the score is behaviour.</h2>
              <p className="lede">
                Ten dimensions, totalling exactly one hundred. BMI is not among them. The nearest
                thing to a body measurement is waist trend, at ten per cent — so the score moves
                when the person changes what they do, not what they weigh.
              </p>
            </div>

            <div className="bars">
              {SCORE_DIMENSIONS.map((d) => (
                <div className="bar" key={d}>
                  <div className="bar__label">{SCORE_LABELS[d]}</div>
                  <div className="bar__pct">{SCORE_WEIGHTS[d]}%</div>
                  <div className="bar__track">
                    <div
                      className="bar__fill"
                      style={{ width: `${(SCORE_WEIGHTS[d] / 15) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="bar bar--excluded">
                <div className="bar__label" style={{ color: 'var(--mq-text-2)' }}>
                  BMI — shown separately, weighted at nothing
                </div>
                <div className="bar__pct">0%</div>
                <div className="bar__track">
                  <div className="bar__fill" style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- guardian ---- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Agent {supervisor.number}</p>
              <h2>One agent outranks the other eighteen.</h2>
              <p className="lede">{supervisor.purpose}</p>
            </div>

            <div className="guardian">
              <h3>Signals that pause or restrict automated progression</h3>
              <p>
                Any of these and the guardian narrows what the rest of the system may do. It has
                no input that widens permission — it can only ever restrict.
              </p>
              <ul className="guardian__list">
                {ESCALATION_SIGNALS.map((s) => (
                  <li key={s}>{readable(s)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---- agents ---- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The agent force</p>
              <h2>Nineteen agents, one unified plan.</h2>
              <p className="lede">
                Not nineteen sources of advice — one orchestrator that decides what happens
                today, what waits, when the plan gets easier, and when to stop guiding
                autonomously at all.
              </p>
            </div>

            <div className="spectrum">
              <div className="spectrum__bar" aria-hidden="true" />
              <div className="spectrum__grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {Object.values(BC_AGENTS).map((a) => (
                  <article className="mode" key={a.code}>
                    <div className="mode__age">
                      {String(a.number).padStart(2, '0')}
                      {a.supervisor && ' · supervisor'}
                    </div>
                    <div className="mode__name" style={{ fontSize: 17 }}>
                      {a.name}
                    </div>
                    <div className="mode__spec">
                      {a.meteredAcu ? 'metered' : 'no ACU charge'}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- banned / rewarded ---- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Gamification without harm</p>
              <h2>Reward the behaviour. Never the body.</h2>
            </div>

            <div className="compare">
              <article className="panel panel--never">
                <h3>
                  <Cross />
                  Banned at every age
                </h3>
                <ul>
                  {PROHIBITED_MECHANICS.map((m) => (
                    <li key={m}>
                      <Cross />
                      <span>{readable(m)}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel panel--always">
                <h3>
                  <Tick />
                  The Non-Scale Victory Board
                </h3>
                <p style={{ color: 'var(--mq-text-2)', marginBottom: 16 }}>
                  Deliberately the longer list, and the one the product celebrates.
                </p>
                <ul>
                  {NON_SCALE_VICTORIES.map((v) => (
                    <li key={v}>
                      <Tick />
                      <span>{readable(v)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section cta" id="cta">
          <div className="wrap">
            <h2>Measure less. Understand more.</h2>
            <p>
              BodyCommand serves children and adults from one engine, with the surface a child
              sees governed by a rule the consent switch cannot override.
            </p>
            <div className="cta__row">
              <a className="btn btn--primary" href="mailto:hello@movequest.ai">
                Request access
              </a>
              <a className="btn btn--ghost" href="/for-children">
                How it works for children
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
