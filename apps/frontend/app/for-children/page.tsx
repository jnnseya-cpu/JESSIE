import type { Metadata } from 'next';
import { AGE_MODE_DEFINITIONS, BODY_COMPOSITION_MIN_AGE } from '@jessmove/shared';
import { Cross, Footer, Nav, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'For children and families — JESS MOVE',
  description:
    'Movement and healthy-weight support for ages 10 to 17, built so a child is never shown a ' +
    'weight target, a body score or a comparison.',
};

const NEVER = [
  'A weight, a BMI number or a calorie figure — shown to a child, in any mode, under any consent',
  'A body-composition target, however gently worded',
  'A leaderboard, ranking or comparison against another named child',
  'Streak-loss messaging, countdowns or punishment for a missed day',
  'Weight-loss contests, fasting challenges or calorie-minimisation games',
  'Open discovery, adult contact, or a public profile',
];

const ALWAYS = [
  'Growth, energy, confidence, food variety, family routines, activity and sleep',
  'A guardian account, with the child as a linked profile — never standalone',
  'Crews that are class-based or family-based, created by a verified adult',
  'Play framing: "Beat the Kettle", "Floor is Lava 90", the Rainbow Mission',
  'Escalation to a professional when the assessment warrants it, not a target',
  'High-privacy defaults under the Age Appropriate Design Code',
];

const DAY = [
  { k: 'Anchor', v: 'Do the two-minute Wake-Up Shake before school.', why: 'It is short, and it is the one that matters most today.', p: '82%', cls: 'slot--anchor' },
  { k: 'Food', v: 'Add one new colour to your plate at dinner.', why: 'More colours means more of the good stuff. No counting, no measuring.', p: '74%', cls: '' },
  { k: 'Movement', v: 'Beat the Kettle — move until it boils.', why: 'A game, not a workout.', p: '79%', cls: '' },
  { k: 'Strength', v: 'Try five Superhero Holds.', why: 'Building strong is about what your body can do.', p: '68%', cls: '' },
  { k: 'Recovery', v: 'Screens down fifteen minutes before bed.', why: 'Sleep is when your body does the growing.', p: '61%', cls: '' },
  { k: 'Optional', v: 'Show a grown-up one move you learned.', why: 'Teaching it makes it stick. Skipping it costs nothing.', p: '55%', cls: 'slot--optional' },
];

export default function ForChildren() {
  const explorer = AGE_MODE_DEFINITIONS.explorer;
  const teen = AGE_MODE_DEFINITIONS.teen;

  return (
    <>
      <SkipLink />
      <Nav current="/for-children" />

      <main id="main">
        <section className="ahero ahero--warm">
          <div className="hero__aura" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap ahero__inner">
            <p className="eyebrow eyebrow--onDark">Ages 10–17 · Kid Mode and Teen Mode</p>
            <h1>
              Children are affected too.<br />
              They are <em>not</em> small adults.
            </h1>
            <p className="ahero__lede">
              Inactivity and its consequences reach children as much as adults, so the engine
              serves both. What changes is everything a child actually sees. The assessment
              exists for safety and escalation. The target does not exist at all.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The line we do not cross</p>
              <h2>Assessed for safety. Never handed a number.</h2>
              <p className="lede">
                A clinician may need an age- and sex-adjusted centile to spot a child who needs
                help. A ten-year-old does not need to see it, and showing it does harm. Those two
                facts are not in tension — they just require the product to keep them apart.
              </p>
            </div>

            <div className="compare">
              <article className="panel panel--never">
                <h3>
                  <Cross />
                  A child never sees
                </h3>
                <ul>
                  {NEVER.map((item) => (
                    <li key={item}>
                      <Cross />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="panel panel--always">
                <h3>
                  <Tick />
                  A child always gets
                </h3>
                <ul>
                  {ALWAYS.map((item) => (
                    <li key={item}>
                      <Tick />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Enforced, not promised</p>
              <h2>The consent switch does nothing under 18.</h2>
              <p className="lede">
                Most products make this a setting a parent can turn on. Here it is not a setting.
                A request for a reduction pathway from an eleven-year-old — with body metrics
                explicitly opted in — comes back as growth, with metrics withheld.
              </p>
            </div>

            <div className="api">
              <div className="api__card">
                <div className="api__head">
                  <span>POST /api/body/assess</span>
                  <span>request</span>
                </div>
                <pre className="api__body">
                  <code>
                    {'{\n'}
                    {'  '}<span className="k">&quot;age&quot;</span>: <span className="n">11</span>,{'\n'}
                    {'  '}<span className="k">&quot;requestedPathway&quot;</span>: <span className="s">&quot;REDUCE&quot;</span>,{'\n'}
                    {'  '}<span className="k">&quot;optedIntoBodyMetrics&quot;</span>: <span className="n">true</span>,{'\n'}
                    {'  '}<span className="k">&quot;heightCm&quot;</span>: <span className="n">145</span>,{'\n'}
                    {'  '}<span className="k">&quot;weightKg&quot;</span>: <span className="n">48</span>{'\n'}
                    {'}'}
                  </code>
                </pre>
              </div>

              <div className="api__card">
                <div className="api__head">
                  <span>200 OK</span>
                  <span>response</span>
                </div>
                <pre className="api__body">
                  <code>
                    {'{\n'}
                    {'  '}<span className="k">&quot;pathway&quot;</span>: <span className="s">&quot;CHILD_GROWTH&quot;</span>,{'\n'}
                    {'  '}<span className="k">&quot;metrics&quot;</span>: <span className="n">null</span>,{'\n'}
                    {'  '}<span className="k">&quot;safety&quot;</span>: {'{\n'}
                    {'    '}<span className="k">&quot;reductionPermitted&quot;</span>: <span className="n">false</span>,{'\n'}
                    {'    '}<span className="k">&quot;powersExercised&quot;</span>: [{'\n'}
                    {'      '}<span className="s">&quot;activate_child_safe_mode&quot;</span>,{'\n'}
                    {'      '}<span className="s">&quot;block_weight_loss_plan&quot;</span>{'\n'}
                    {'    '}]{'\n'}
                    {'  '}{'}\n'}
                    {'}'}
                    {'\n\n'}
                    <span className="c">// the opt-in was ignored, by design</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">A day in Kid Mode</p>
              <h2>Six actions. None of them about a body.</h2>
              <p className="lede">
                The anchor is the one that happens even on a difficult day. Everything else is
                optional in practice, and the last one is optional by label.
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

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The two child modes</p>
              <h2>Ten to twelve is not thirteen to seventeen.</h2>
            </div>

            <div className="compare">
              <article className="panel">
                <h3>{explorer.label} · {explorer.minAge}–{explorer.maxAge}</h3>
                <p style={{ color: 'var(--jm-text-2)', marginBottom: 18 }}>{explorer.register}</p>
                <ul>
                  <li><Tick /><span>Guardian account required; no standalone profile</span></li>
                  <li><Tick /><span>{explorer.dailyCap} nudges a day, hard ceiling</span></li>
                  <li><Tick /><span>No free-text with the AI — structured prompts only</span></li>
                  <li><Tick /><span>No biometrics, no precise location, no ambient sensing</span></li>
                  <li><Tick /><span>Reading age {explorer.readingAgeCeiling} · WCAG {explorer.contrast}</span></li>
                </ul>
              </article>

              <article className="panel">
                <h3>{teen.label} · {teen.minAge}–{teen.maxAge}</h3>
                <p style={{ color: 'var(--jm-text-2)', marginBottom: 18 }}>{teen.register}</p>
                <ul>
                  <li><Tick /><span>Self-registration with age assurance</span></li>
                  <li><Tick /><span>Guardian visibility is configurable and disclosed to the teen — never covert</span></li>
                  <li><Tick /><span>{teen.dailyCap} nudges a day</span></li>
                  <li><Tick /><span>Crews inside a school tenancy or invite-only graph</span></li>
                  <li><Tick /><span>Exam-season Focus Snaps; no body-image framing, ever</span></li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section cta" id="cta">
          <div className="wrap">
            <h2>Every body qualifies. Including the small ones.</h2>
            <p>
              Body metrics unlock at {BODY_COMPOSITION_MIN_AGE}, opt-in, never competitive.
              Below that, the product is about growing, moving and feeling capable.
            </p>
            <div className="cta__row">
              <a className="btn btn--primary" href="mailto:schools@jessmove.com">
                Talk to us about schools
              </a>
              <a className="btn btn--ghost" href="mailto:hello@jessmove.com">
                Request access
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
