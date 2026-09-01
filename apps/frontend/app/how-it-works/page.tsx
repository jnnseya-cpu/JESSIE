import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONCEPT_AGENTS,
  CONTEXT_CATEGORIES,
  GAME_LOOP,
  GAME_WORLDS,
  MOVEMENT_KINDS,
  NINE_QUESTIONS,
  OPPORTUNITY_MULTIPLIERS,
  OPPORTUNITY_PENALTIES,
  OPPORTUNITY_THRESHOLD,
  POINTS_NEVER,
  POINTS_REWARD,
  REWARD_ASSETS,
  SNAP_DURATION_SECONDS,
  TEAM_SCORE_TERMS,
} from '@jessmove/shared';
import { CompareBars, DayTimeline, Spark, Stat, type DaySlot } from '../charts';
import { Cross, Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'How it works — JESS MOVE',
  description:
    'The Movement Opportunity Engine, the twelve agents, the game loop, and how a two-minute ' +
    'gap becomes a completed Snap.',
};

const DAY: readonly DaySlot[] = [
  'busy', 'gap', 'snap', 'busy', 'busy', 'held', 'gap', 'snap',
  'busy', 'busy', 'gap', 'busy', 'snap', 'gap', 'busy', 'held',
];

const READINESS = [58, 62, 60, 66, 71, 68, 74, 77, 73, 79, 82, 80, 85, 88];

const WEIGHT_CONTROL = [
  {
    label: 'You choose the pathway',
    value: 100,
    tone: 'var(--c1)',
    note: 'Nine pathways. Reduction is one of them, never the default and never assumed from a number.',
  },
  {
    label: 'You can change it, any time',
    value: 100,
    tone: 'var(--c2)',
    note: 'Switching pathway is a setting, not a support request, and it never resets your progress.',
  },
  {
    label: 'You can switch the surface off',
    value: 100,
    tone: 'var(--c4)',
    note: 'Turning body metrics off leaves movement, food and energy coaching fully intact.',
  },
];

export default function HowItWorks() {
  return (
    <>
      <SkipLink />
      <Nav current="/how-it-works" />

      <main id="main">
        <PageHero
          crumb="How it works"
          eyebrow="The engine"
          title={
            <>
              It finds the gap.<br />
              Then it earns the interruption.
            </>
          }
          lede={
            `Every candidate moment is scored. Below the threshold the system says nothing at ` +
            `all — silence is a valid, logged outcome. Above it, you get one Snap of ` +
            `${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max} seconds, matched to the body ` +
            `you actually have and the room you are actually in.`
          }
        />

        {/* the score */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Step one</p>
              <h2>The Movement Opportunity Score.</h2>
              <p className="lede">
                Seven factors multiply and three penalties subtract. Everything is normalised to
                0–1 so no single large input can dominate, and safety confidence sits in the
                multiplied half — a zero there kills the recommendation regardless of how good
                the moment otherwise looks.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">The formula</h3>
                  <span className="card__tag" style={{ color: 'var(--i-excellent)' }}>
                    fires at ≥ {OPPORTUNITY_THRESHOLD}
                  </span>
                </div>
                <p className="card__note" style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5 }}>
                  score = ({OPPORTUNITY_MULTIPLIERS.join(' × ')}) − mean({OPPORTUNITY_PENALTIES.join(', ')})
                </p>
                <ul className="pills">
                  {OPPORTUNITY_MULTIPLIERS.map((f) => (
                    <li key={f} style={{ borderColor: 'var(--jm-teal)' }}>
                      × {f.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </li>
                  ))}
                  {OPPORTUNITY_PENALTIES.map((f) => (
                    <li key={f} style={{ borderColor: 'var(--jm-coral)' }}>
                      − {f.replace(/([A-Z])/g, ' $1').toLowerCase()}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">The nine questions</h3>
                </div>
                <ol className="prose" style={{ margin: 0, paddingLeft: 20, fontSize: 15.5 }}>
                  {NINE_QUESTIONS.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </article>
            </div>
          </div>
        </section>

        {/* the day */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Step two</p>
              <h2>A day, scored end to end.</h2>
              <p className="lede">
                The engine does not wait for a timer to run out. It builds a model of your day
                from calendar structure, device inactivity, wearable signal and — where you have
                enabled them — commute pattern, weather and location category.
              </p>
            </div>

            <div className="dash">
              <article className="card card--8">
                <div className="card__head">
                  <h3 className="card__t">Gaps found, used and deliberately skipped</h3>
                  <span className="card__tag">08:00 → 16:00</span>
                </div>
                <DayTimeline slots={DAY} from={8} />
              </article>

              <article className="card card--4">
                <div className="card__head">
                  <h3 className="card__t">Readiness</h3>
                  <span className="card__tag">14 days</span>
                </div>
                <div className="card__big" style={{ color: 'var(--ic1)' }}>
                  {READINESS[READINESS.length - 1]}
                </div>
                <Spark series={READINESS} label="Readiness trend" tone="var(--c1)" />
              </article>
            </div>

            <h3 style={{ margin: '46px 0 16px', fontSize: 22 }}>
              Contexts the engine must recognise
            </h3>
            <ul className="pills pills--ink">
              {CONTEXT_CATEGORIES.map((c) => (
                <li key={c}>{c.replace(/_/g, ' ')}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* agents */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Step three</p>
              <h2>Twelve agents, each owning one decision.</h2>
              <p className="lede">
                No agent may take another agent’s decision. Safety can only narrow. Recovery can
                veto the whole day. Accessibility rewrites the experience rather than adding an
                alternative link at the bottom.
              </p>
            </div>
            <div className="tiles">
              {CONCEPT_AGENTS.map((a) => (
                <article
                  className="tile"
                  key={a.n}
                  style={{ ['--tone' as string]: `var(--c${(a.n % 6) + 1})` }}
                >
                  <div className="tile__n">AGENT {String(a.n).padStart(2, '0')}</div>
                  <h3>{a.name}</h3>
                  <p>{a.role}</p>
                  <ul>
                    {a.does.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* the loop */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Step four</p>
              <h2>The loop that makes the next one better.</h2>
            </div>
            <div className="steps">
              {GAME_LOOP.map((s, i) => (
                <div className="steprow" key={s}>
                  <div className="steprow__n">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{s}</h3>
                  </div>
                </div>
              ))}
            </div>

            <div className="dash" style={{ marginTop: 44 }}>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What earns points</h3>
                  <span className="card__tag" style={{ color: 'var(--i-excellent)' }}>
                    <Tick /> permitted
                  </span>
                </div>
                <ul className="pills">
                  {POINTS_REWARD.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What never earns points</h3>
                  <span className="card__tag" style={{ color: 'var(--i-critical)' }}>
                    <Cross /> banned
                  </span>
                </div>
                <ul className="pills">
                  {POINTS_NEVER.map((p) => (
                    <li key={p} style={{ borderColor: 'var(--jm-critical)' }}>
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Asserted in continuous integration. A build that scores movement on calories,
                  weight or appearance does not ship.
                </p>
              </article>
            </div>

            <h3 style={{ margin: '44px 0 14px', fontSize: 22 }}>Team Score</h3>
            <p className="lede" style={{ marginBottom: 18 }}>
              {TEAM_SCORE_TERMS.map((t) => t.label).join(' + ')}. Physical capability is absent by design — that is
              what lets a ten-year-old, a wheelchair user and an eighty-eight-year-old share one
              leaderboard fairly.
            </p>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Movement kinds</h3>
                </div>
                <ul className="pills">
                  {MOVEMENT_KINDS.map((m) => (
                    <li key={m}>{m.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Worlds &amp; rewards</h3>
                </div>
                <ul className="pills">
                  {GAME_WORLDS.map((w) => (
                    <li key={w} style={{ borderColor: 'var(--jm-orange)' }}>
                      {w}
                    </li>
                  ))}
                </ul>
                <ul className="pills">
                  {REWARD_ASSETS.slice(0, 6).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* weight */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Weight, and control of it</p>
              <h2>Managing your weight is your decision to make — and to unmake.</h2>
              <p className="lede">
                For adults, supporting weight management is a primary aim of the platform. What
                the product refuses to do is decide on your behalf that a lower number is the
                goal, or make that number the thing you are measured against in public.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Three controls that are always yours</h3>
                </div>
                <CompareBars rows={WEIGHT_CONTROL} unit="%" />
              </article>
              <article className="card card--5" style={{ gap: 14 }}>
                <Stat
                  k="Pathways"
                  v="9"
                  sub="Reduce, Waist, Maintain, Recomposition, Gain, Child Growth, Older-Adult Independence, Limited Mobility, Professional Support."
                  tone="var(--c1)"
                />
                <Stat
                  k="Under 18"
                  v="Never"
                  sub="No weight, BMI, calorie or appearance framing, in any mode, under any consent setting."
                  tone="var(--jm-critical)"
                />
              </article>
            </div>

            <p className="lede" style={{ marginTop: 30 }}>
              The full pathway model, the safety gate and the scorecard are documented on{' '}
              <Link href="/body-balance" style={{ color: 'var(--i-teal)', fontWeight: 600 }}>
                Body Balance
              </Link>
              .
            </p>
          </div>
        </section>

        <JoinCta
          heading="See it against your own week."
          says="The engine reads the shape of your calendar, not its contents, and finds the gaps that are actually movable. It needs your week to show you anything."
          talkTo="/developers"
          talkLabel="For developers"
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
