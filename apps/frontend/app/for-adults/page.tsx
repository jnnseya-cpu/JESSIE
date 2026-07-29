import type { Metadata } from 'next';
import { AGE_MODE_DEFINITIONS } from '@jessmove/shared';
import { Footer, Nav, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'For adults — JESS MOVE',
  description:
    'Movement and body-balance support for ages 18 to 100 — nine pathways, of which reduction ' +
    'is only one.',
};

const DAY = [
  { k: 'Anchor', v: 'Walk for ten minutes after lunch.', why: 'Your strongest completion window is straight after eating.', p: '71%', cls: 'slot--anchor' },
  { k: 'Food', v: 'Replace the afternoon sugary drink.', why: 'Your evening meals are already balanced. Drinks are the bigger opportunity.', p: '66%', cls: '' },
  { k: 'Movement', v: 'Complete three desk-break Snaps.', why: 'You have three real gaps in the calendar today.', p: '78%', cls: '' },
  { k: 'Strength', v: 'Two sets of chair-supported presses.', why: 'Protecting muscle matters more than the scale.', p: '64%', cls: '' },
  { k: 'Recovery', v: 'Start bedtime preparation at 22:15.', why: 'Short sleep predicts tomorrow’s afternoon snacking for you.', p: '52%', cls: '' },
  { k: 'Optional', v: 'Add one vegetable colour at dinner.', why: 'Optional. Skipping it costs nothing.', p: '49%', cls: 'slot--optional' },
];

const LATER_LIFE = [
  { mode: 'independence' as const, points: ['Balance, lower-limb strength, grip, gait and dual-task cognition — the falls-prevention stack', 'Chair-supported is the default; standing is opt-up, never opt-out', 'Weekly Steady Check; deterioration notifies the Circle', 'Maximum four tap targets per screen'] },
  { mode: 'vitality' as const, points: ['Voice-first, one action per screen, no timers, no failure states', 'Falls Protocol: a confirmed stability anchor before any balance work', 'Standing work disabled unless a clinician has cleared it', 'Sessions produce CQC-ready activity evidence automatically'] },
];

export default function ForAdults() {
  return (
    <>
      <SkipLink />
      <Nav current="/for-adults" />

      <main id="main">
        <section className="ahero ahero--cool">
          <div className="hero__aura" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap ahero__inner">
            <p className="eyebrow eyebrow--onDark">Ages 18–100 · Standard, Silver and Centennial</p>
            <h1>
              Reduction is one path.<br />
              There are <em>nine</em>.
            </h1>
            <p className="ahero__lede">
              Most products assume everyone wants to lose weight. Five of our nine pathways
              refuse reduction outright — because maintaining, gaining safely, protecting muscle
              and staying independent are the right answer more often than the category admits.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">A day in Standard Mode</p>
              <h2>Six actions, chosen by what you will actually finish.</h2>
              <p className="lede">
                Each is ranked by health value × safety × completion probability ÷ friction.
                Safety is a multiplier, not a weight — an unsafe action ranks zero no matter how
                valuable or effortless it is.
              </p>
            </div>

            <div className="plan">
              {DAY.map((slot) => (
                <div className={`slot ${slot.cls}`} key={slot.k}>
                  <div className="slot__k">{slot.k}</div>
                  <div className="slot__v">
                    {slot.v}
                    <span className="slot__why">{slot.why}</span>
                  </div>
                  <div className="slot__p">{slot.p}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Later life</p>
              <h2>After 65, the goal stops being less.</h2>
              <p className="lede">
                Muscle, balance, appetite and independence matter more than any number on a
                scale. Both later-life pathways refuse weight reduction by default, and an
                unplanned loss is treated as a warning rather than a win.
              </p>
            </div>

            <div className="compare">
              {LATER_LIFE.map(({ mode, points }) => {
                const def = AGE_MODE_DEFINITIONS[mode];
                return (
                  <article className="panel" key={mode}>
                    <h3>
                      {def.label} · {def.minAge}–{def.maxAge}
                    </h3>
                    <p style={{ color: 'var(--jm-text-2)', marginBottom: 18 }}>{def.register}</p>
                    <ul>
                      {points.map((p) => (
                        <li key={p}>
                          <Tick />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="path__flag path__flag--yes" style={{ marginTop: 18 }}>
                      type {def.minBodyPx}px · WCAG {def.contrast} · cap {def.dailyCap}/day
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Off by default</p>
              <h2>Body metrics are opt-in, and never a competition.</h2>
              <p className="lede">
                An adult can choose to see BMI, waist-to-height and weight trend. Nobody is shown
                them without asking, and no version of the product ranks one person’s body
                against another’s — that mechanic is banned at every age, consent or no consent.
              </p>
            </div>

            <div className="api">
              <div className="api__card">
                <div className="api__head">
                  <span>opted out — the default</span>
                  <span>200 OK</span>
                </div>
                <pre className="api__body">
                  <code>
                    {'{\n'}
                    {'  '}<span className="k">&quot;pathway&quot;</span>: <span className="s">&quot;MAINTAIN&quot;</span>,{'\n'}
                    {'  '}<span className="k">&quot;metrics&quot;</span>: <span className="n">null</span>,{'\n'}
                    {'  '}<span className="k">&quot;surfacePolicy&quot;</span>: {'{\n'}
                    {'    '}<span className="k">&quot;mayDisplay&quot;</span>: <span className="n">false</span>,{'\n'}
                    {'    '}<span className="k">&quot;reason&quot;</span>: <span className="s">&quot;Adult, not opted in.&quot;</span>{'\n'}
                    {'  '}{'}\n'}
                    {'}'}
                  </code>
                </pre>
              </div>

              <div className="api__card">
                <div className="api__head">
                  <span>opted in</span>
                  <span>200 OK</span>
                </div>
                <pre className="api__body">
                  <code>
                    {'{\n'}
                    {'  '}<span className="k">&quot;pathway&quot;</span>: <span className="s">&quot;WAIST&quot;</span>,{'\n'}
                    {'  '}<span className="k">&quot;metrics&quot;</span>: {'{\n'}
                    {'    '}<span className="k">&quot;bmi&quot;</span>: <span className="n">30</span>,{'\n'}
                    {'    '}<span className="k">&quot;waistToHeightRatio&quot;</span>: <span className="n">0.583</span>,{'\n'}
                    {'    '}<span className="k">&quot;bmiUnreliable&quot;</span>: <span className="n">false</span>,{'\n'}
                    {'    '}<span className="k">&quot;confidence&quot;</span>: <span className="n">0.95</span>{'\n'}
                    {'  '}{'}\n'}
                    {'}'}
                    {'\n\n'}
                    <span className="c">// waist-to-height is offered below BMI 35,</span>
                    {'\n'}
                    <span className="c">// per NICE — BMI alone is not the verdict</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="section cta" id="cta">
          <div className="wrap">
            <h2>The objective is not a number.</h2>
            <p>
              It is a body and a routine capable of holding the right range without permanent
              dependence on willpower.
            </p>
            <div className="cta__row">
              <a className="btn btn--primary" href="mailto:hello@jessmove.com">
                Request access
              </a>
              <a className="btn btn--ghost" href="/body-balance">
                See how Body Balance works
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
