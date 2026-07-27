import Link from 'next/link';
import {
  AGE_MODES,
  AGE_MODE_DEFINITIONS,
  BRAND,
  CONSENT_SCOPES,
  FLAGSHIP_PROMISE,
  K_ANONYMITY_THRESHOLD,
  MOVEMENT_VARIANTS,
  NUDGE_CONVERSION_TARGET,
  PERSONALITY,
  PLANS,
  SNAP_DURATION_SECONDS,
  TAGLINE,
  VARIANT_LABELS,
} from '@movequest/shared';
import {
  AgeColumns,
  BalanceRing,
  CompareBars,
  ConfidenceCone,
  DayTimeline,
  Donut,
  FanChart,
  Heatmap,
  Radar,
  Spark,
  StackedBars,
  Stat,
  TrafficLights,
  Waterfall,
  type DaySlot,
} from './charts';
import { Check, Footer, Nav, SkipLink, Tick, VariantGlyph } from './ui';

/* ---------------- static, deterministic sample data ---------------- */

const MODE_TONE: Record<string, string> = {
  explorer: 'var(--mode-explorer)',
  teen: 'var(--mode-teen)',
  momentum: 'var(--mode-momentum)',
  balance: 'var(--mode-balance)',
  independence: 'var(--mode-independence)',
  vitality: 'var(--mode-vitality)',
};

/** §14 — the six segments of the Body Balance master ring. */
const BALANCE = [
  { label: 'Move', value: 82, tone: 'var(--mq-teal)' },
  { label: 'Food', value: 66, tone: 'var(--mq-orange)' },
  { label: 'Strength', value: 71, tone: 'var(--mq-magenta)' },
  { label: 'Recovery', value: 74, tone: 'var(--mq-sky)' },
  { label: 'Consistency', value: 88, tone: 'var(--mq-lime)' },
  { label: 'Progress', value: 79, tone: 'var(--mq-purple)' },
];

const COMPLETION = [41, 46, 44, 52, 58, 55, 61, 64, 60, 67, 71, 69, 74, 78];

const DAY: readonly DaySlot[] = [
  'busy', 'busy', 'gap', 'snap', 'busy', 'busy', 'busy', 'gap',
  'snap', 'busy', 'held', 'gap', 'busy', 'busy', 'snap', 'gap',
  'busy', 'busy', 'gap', 'snap', 'busy', 'held', 'gap', 'busy',
];

const CONVERSION = [
  {
    label: 'MoveQuest target',
    value: Math.round(NUDGE_CONVERSION_TARGET * 100),
    tone: 'var(--mq-teal)',
    note: 'Prompt to completed micro-movement. The number the whole engine is optimised against.',
  },
  {
    label: 'Generic reminder apps',
    value: 11,
    tone: 'var(--mq-coral)',
    note: 'Best case for a notification that knows nothing about your day. Worst case is 4%.',
  },
];

const WHEEL_LABELS = [
  'Protein', 'Fibre', 'Saturates', 'Sugars', 'Salt', 'Micronutrients',
  'Hydration', 'Plant points', 'Processing', 'Portion', 'Timing', 'Confidence',
];
const WHEEL_VALUES = [72, 58, 40, 34, 45, 66, 80, 62, 48, 70, 76, 54];

/** UK front-of-pack bands at the published per-100g thresholds. */
const TRAFFIC = [
  { name: 'Fat', grams: 11.4, band: 'amber' as const, of: 25 },
  { name: 'Saturates', grams: 3.2, band: 'amber' as const, of: 8 },
  { name: 'Sugars', grams: 4.1, band: 'green' as const, of: 30 },
  { name: 'Salt', grams: 1.7, band: 'red' as const, of: 2.5 },
];

const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HEAT_HOURS = ['08', '10', '12', '14', '16', '18', '20'];
const HEAT_VALUES = [
  [30, 18, 74, 22, 15, 55, 40],
  [42, 24, 80, 30, 20, 62, 35],
  [28, 16, 70, 18, 12, 48, 30],
  [46, 30, 78, 34, 26, 66, 44],
  [36, 22, 68, 20, 14, 58, 50],
  [62, 70, 66, 72, 68, 60, 45],
  [55, 64, 58, 66, 62, 54, 38],
];

const TRAJECTORY = [72, 73, 74, 76, 77, 79, 80, 82];
const TRAJ_SPREAD = [1, 2, 3, 4, 5, 6.5, 8, 9.5];

const BLOCKERS = [
  { name: 'Weekday walk after lunch', delta: 14 },
  { name: 'Consistent sleep window', delta: 9 },
  { name: 'Strength twice a week', delta: 7 },
  { name: 'Weekend movement', delta: -12 },
  { name: 'Late-evening screen time', delta: -8 },
  { name: 'Back-to-back meeting blocks', delta: -6 },
];

const MIX_KEYS = [
  { name: 'Mobility', tone: 'var(--mq-teal)' },
  { name: 'Strength', tone: 'var(--mq-magenta)' },
  { name: 'Balance', tone: 'var(--mq-sky)' },
  { name: 'Light cardio', tone: 'var(--mq-lime)' },
];
const MIX_BARS = [
  { name: 'Mon', parts: [3, 1, 1, 2] },
  { name: 'Tue', parts: [2, 2, 1, 1] },
  { name: 'Wed', parts: [4, 0, 2, 1] },
  { name: 'Thu', parts: [3, 2, 1, 2] },
  { name: 'Fri', parts: [2, 1, 2, 3] },
  { name: 'Sat', parts: [1, 1, 1, 4] },
  { name: 'Sun', parts: [2, 0, 2, 2] },
];

/** §34.4 — the six surfaces of the OS. */
const SURFACES = [
  {
    name: 'MOVA AI Coach',
    tone: 'var(--mq-purple)',
    grad: 'grad-ai',
    body:
      'An assistant, not an avatar of a doctor or a fitness model. MOVA explains why it is ' +
      'suggesting something, changes colour with context, and can be switched off entirely for ' +
      'a data-only experience.',
  },
  {
    name: 'Micro-Movement',
    tone: 'var(--mq-teal)',
    grad: 'grad-movement',
    body:
      'Two to five minutes, matched to the room you are in, the clothes you are wearing and the ' +
      'body you actually have. Five executable variants on every movement, always.',
  },
  {
    name: 'FoodLens',
    tone: 'var(--mq-orange)',
    grad: 'grad-food',
    body:
      'Photograph a meal and get a range, its evidence source and a confidence level — never an ' +
      'invented exact figure, and never a calorie number to anyone under 18.',
  },
  {
    name: 'BodyCommand',
    tone: 'var(--mq-magenta)',
    grad: 'grad-ai',
    body:
      'Nine pathways, of which reduction is one. Trajectory with honest uncertainty, your ' +
      'strongest current blocker, and the minimum effective change that would shift it.',
  },
  {
    name: 'Challenges',
    tone: 'var(--mq-lime)',
    grad: 'grad-movement',
    body:
      'Team Score is participation, consistency, improvement and mutual support. Capability is ' +
      'absent by design, so the fittest person cannot win every event on their own.',
  },
  {
    name: 'Wearables',
    tone: 'var(--mq-sky)',
    grad: 'grad-recovery',
    body:
      'Apple Health, Health Connect, Fitbit, Garmin, Samsung, Oura and Polar — each individually ' +
      'revocable, and none of them required to start.',
  },
];

const VARIANT_NOTES: Record<string, string> = {
  standing: 'Upright and unsupported. One of five — never the default.',
  seated: 'A standard chair, no support required.',
  chair_supported: 'Hand support on a stable surface. The falls-risk pathway.',
  bed_recliner: 'Lying or semi-reclined. Care settings and acute recovery.',
  adaptive_single_limb: 'Wheelchair-compatible, single-limb, limited range. Independently authored.',
};

export default function Home() {
  const gapsFound = DAY.filter((s) => s !== 'busy').length;
  const missions = DAY.filter((s) => s === 'snap').length;
  const held = DAY.filter((s) => s === 'held').length;

  return (
    <>
      <SkipLink />
      <Nav current="/" />

      <main id="main">
        {/* ---------------- 1 · hero ---------------- */}
        <section className="hero">
          <div className="hero__aura" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap hero__inner">
            <div>
              <p className="eyebrow eyebrow--onDark">{BRAND.descriptor}</p>
              <h1>
                Small Moves.<br />
                <em>Powerful</em> Change.
              </h1>
              <p className="hero__lede">
                {BRAND.app} uses AI to discover realistic movement opportunities across your work,
                home and commute — then turns them into personalised missions that fit the day you
                already have.
              </p>
              <div className="hero__cta">
                <Link className="btn btn--primary" href="/get-started">
                  Start free
                </Link>
                <Link className="btn btn--ghost" href="/how-it-works">
                  See how it works
                </Link>
              </div>
              <p className="hero__note">
                A general wellness product for ages 10 to 100. It does not diagnose, treat, or
                replace clinical care.
              </p>
            </div>

            {/* §14 — the command centre, shown rather than described */}
            <div className="snapcard">
              <div className="snapcard__top">
                <span className="mova">
                  <span className="mova__orb" aria-hidden="true" />
                  MOVA
                </span>
                <span className="snapcard__time">14:35 · 25 min free</span>
              </div>

              <p className="snapcard__why" style={{ marginTop: 0 }}>
                Good afternoon. Your strongest movement window starts in 18 minutes.
              </p>

              <h2 className="snapcard__title">Three-Minute Desk Reset</h2>
              <p className="snapcard__why">
                “You have been seated for 94 minutes and your next call starts at 15:00. This one
                is silent and needs no space.”
              </p>

              <div className="snapcard__meta">
                <div className="metric">
                  <div className="metric__k">Variant</div>
                  <div className="metric__v">Seated</div>
                </div>
                <div className="metric">
                  <div className="metric__k">Duration</div>
                  <div className="metric__v">150s</div>
                </div>
                <div className="metric">
                  <div className="metric__k">Effort</div>
                  <div className="metric__v">RPE 3</div>
                </div>
              </div>

              <div className="snapcard__foot">
                <Tick />
                <span>
                  14 safety rules evaluated · calendar titles never left your device · expires
                  15:00
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- proof strip ---------------- */}
        <section className="proof">
          <div className="wrap">
            <div className="proof__grid">
              <div className="proof__cell" style={{ ['--tone' as string]: 'var(--mq-teal)' }}>
                <div className="proof__n">2–5 min</div>
                <p className="proof__l">
                  The atomic unit. Not a workout, not a session, not a class.
                </p>
              </div>
              <div className="proof__cell" style={{ ['--tone' as string]: 'var(--mq-lime)' }}>
                <div className="proof__n">{MOVEMENT_VARIANTS.length} variants</div>
                <p className="proof__l">
                  Required on every published movement. No exceptions, no override.
                </p>
              </div>
              <div className="proof__cell" style={{ ['--tone' as string]: 'var(--mq-orange)' }}>
                <div className="proof__n">10 → 100</div>
                <p className="proof__l">
                  {AGE_MODES.length} adaptive modes from one engine, each with its own rules.
                </p>
              </div>
              <div className="proof__cell" style={{ ['--tone' as string]: 'var(--mq-blue)' }}>
                <div className="proof__n">k ≥ {K_ANONYMITY_THRESHOLD}</div>
                <p className="proof__l">
                  Enforced in the query planner. An employer structurally cannot see one person.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- 2 · live product demonstration ---------------- */}
        <section className="section section--ink" id="console">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Live demonstration</p>
              <h2>Your day, with the movement already in it.</h2>
              <p className="lede">
                This is what the engine produces in one working day — gaps found, missions
                delivered, prompts deliberately held back, and six separate readings of how you
                are doing. Six readings rather than one score, because a single number invites a
                comparison this product refuses to make.
              </p>
            </div>

            <div className="console" aria-label="Engine status">
              <span>
                <i aria-hidden="true" />
                movement.opportunity.engine · live
              </span>
              <span>gaps_found={gapsFound}</span>
              <span>missions={missions}</span>
              <span>held={held}</span>
              <span>k_floor={K_ANONYMITY_THRESHOLD}</span>
            </div>

            <div className="dash" style={{ marginTop: 24 }}>
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Sedentary timeline</h3>
                  <span className="card__tag">07:00 → 19:00</span>
                </div>
                <DayTimeline slots={DAY} from={7} />
                <p className="card__note">
                  Two prompts were <strong>held</strong>. That is a success rather than a gap in
                  coverage — a notification fired into a moment you cannot move is a defect, and
                  it is logged as one.
                </p>
              </article>

              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Body Balance</h3>
                  <span className="card__tag">Six readings</span>
                </div>
                <BalanceRing
                  segments={BALANCE}
                  caption="Move, food, strength, recovery, consistency and progress"
                />
              </article>

              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Completion rate</h3>
                  <span className="card__tag">14 days</span>
                </div>
                <div className="card__big" style={{ color: 'var(--mq-teal)' }}>
                  {COMPLETION[COMPLETION.length - 1]}%
                </div>
                <Spark series={COMPLETION} label="Completion rate over fourteen days" />
                <p className="card__note">
                  The curve climbs because the ask stayed finishable, not because the target got
                  louder. Difficulty escalates by at most 7% a week.
                </p>
              </article>

              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Prompt → completed movement</h3>
                  <span className="card__tag">Conversion</span>
                </div>
                <CompareBars rows={CONVERSION} />
              </article>

              <article className="card card--8">
                <div className="card__head">
                  <h3 className="card__t">Where your sitting actually happens</h3>
                  <span className="card__tag">7 days × time of day</span>
                </div>
                <Heatmap
                  rows={HEAT_DAYS}
                  cols={HEAT_HOURS}
                  values={HEAT_VALUES}
                  label="Movement completion by day and time of day"
                />
                <p className="card__note">
                  Darker is more movement. The weekday midday block is strong and the weekday
                  late-afternoon is not — so that is where the next mission goes.
                </p>
              </article>

              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="Daily cap"
                  v="2–6"
                  sub="A hard ceiling set by your mode. The engine may never exceed it."
                  tone="var(--mq-orange)"
                />
                <Stat
                  k="Weekly escalation"
                  v="≤ 7%"
                  sub="The most it may increase what it asks of you."
                  tone="var(--mq-lime)"
                />
                <Stat
                  k="Streak shields"
                  v="0–2"
                  sub="Illness, caring duties, a flare-up. The chain forgives."
                  tone="var(--mq-sky)"
                />
              </article>

              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Weekly movement mix</h3>
                  <span className="card__tag">missions</span>
                </div>
                <StackedBars
                  bars={MIX_BARS}
                  keys={MIX_KEYS}
                  label="Movement categories completed by day"
                />
              </article>

              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Variant coverage</h3>
                  <span className="card__tag">publishing gate</span>
                </div>
                <Donut
                  slices={MOVEMENT_VARIANTS.map((v, i) => ({
                    label: VARIANT_LABELS[v],
                    value: 1,
                    tone: `var(--c${i + 1})`,
                  }))}
                  centre="5/5"
                  sub="required"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 3 · the problem ---------------- */}
        <section className="section" id="problem">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The problem</p>
              <h2>Traditional plans ask for more time. There isn’t any.</h2>
              <p className="lede">
                Meeting a weekly exercise target does not cancel the risk of spending the rest of
                the day sitting. Most people who are not moving enough are not refusing to
                exercise — they cannot commit to something that needs an hour, a changing room and
                a membership. {BRAND.app} looks for health opportunities inside the time you
                already have.
              </p>
            </div>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What a generic reminder knows about you</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-action)' }}>
                    nothing
                  </span>
                </div>
                <p className="card__note">
                  That a timer expired. It does not know you are driving, in a lesson, holding a
                  baby, on a train, in a meeting you cannot leave, or already three movements into
                  a good day. So it fires anyway, you ignore it, and eventually you turn
                  notifications off.
                </p>
              </article>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What {BRAND.app} settles first</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-excellent)' }}>
                    nine questions
                  </span>
                </div>
                <p className="card__note">
                  When you were last active, what you are doing, where you are, what capability
                  you have, how much time is genuinely free, whether movement is safe and socially
                  appropriate here, which activity you will actually finish, what tone will work —
                  and whether to stay silent altogether.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 4 · the OS ---------------- */}
        <section className="section section--tint" id="os">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The operating system</p>
              <h2>{FLAGSHIP_PROMISE}</h2>
            </div>

            <div className="tiles">
              {SURFACES.map((s) => (
                <article className="tile" key={s.name} style={{ ['--tone' as string]: s.tone }}>
                  <div className={`tile__band ${s.grad}`} aria-hidden="true" />
                  <h3>{s.name}</h3>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- 5 · age inclusivity ---------------- */}
        <section className="section section--ink" id="modes">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Ten to a hundred</p>
              <h2>One interface cannot serve every age. So there are {AGE_MODES.length}.</h2>
              <p className="lede">
                Mode is derived from a verified age band and a capability profile — never chosen
                freely. It changes interface density, the coach’s register, which gamification
                mechanics are legal, what data may be collected, and which clinical guardrails
                apply.
              </p>
            </div>

            <article className="card" style={{ marginBottom: 24 }}>
              <div className="card__head">
                <h3 className="card__t">Daily mission cap by mode</h3>
                <span className="card__tag">a ceiling, not a target</span>
              </div>
              <AgeColumns
                columns={AGE_MODES.map((m) => {
                  const def = AGE_MODE_DEFINITIONS[m];
                  return {
                    key: m,
                    label: def.label.replace(' Mode', ''),
                    range: `${def.minAge}–${def.maxAge}`,
                    cap: def.dailyCap,
                    tone: MODE_TONE[m],
                  };
                })}
              />
              <p className="card__note">
                The middle of life carries the most and the ends carry the least — but nobody
                carries nothing.
              </p>
            </article>

            <div className="spectrum">
              <div className="spectrum__bar" aria-hidden="true" />
              <div className="spectrum__grid">
                {AGE_MODES.map((mode) => {
                  const def = AGE_MODE_DEFINITIONS[mode];
                  return (
                    <article
                      className="mode"
                      key={mode}
                      style={{ ['--tone' as string]: MODE_TONE[mode] }}
                    >
                      <div className="mode__age">
                        {def.minAge}–{def.maxAge}
                      </div>
                      <div className="mode__name">{def.label}</div>
                      <p className="mode__desc">{def.focus}</p>
                      <div className="mode__spec">
                        cap {def.dailyCap}/day
                        <br />
                        type {def.minBodyPx}px · {def.contrast}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- publishing gate ---------------- */}
        <section className="section" id="gate">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Every body qualifies</p>
              <h2>Five variants, or it does not ship.</h2>
              <p className="lede">
                A competitor with a standing-first library cannot retrofit this. Every movement
                exists in five independently authored variants — not degraded from the standing
                version — each with cue text for all {AGE_MODES.length} modes and a passed safety
                screening, before it reaches a single person.
              </p>
            </div>

            <div className="gate">
              {MOVEMENT_VARIANTS.map((variant, i) => (
                <article
                  className="variant"
                  key={variant}
                  style={{ ['--tone' as string]: `var(--c${i + 1})` }}
                >
                  <VariantGlyph variant={variant} />
                  <div className="variant__name">{VARIANT_LABELS[variant]}</div>
                  <p className="variant__note">{VARIANT_NOTES[variant]}</p>
                </article>
              ))}
            </div>

            <div className="gate__rule">
              <Tick />
              <p>
                Enforced in the API rather than by process discipline. There is no{' '}
                <strong>force_publish</strong> flag, no admin bypass and no override role — a
                partial movement stays in draft indefinitely.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- 6 · FoodLens ---------------- */}
        <section className="section section--tint" id="foodlens">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--mq-orange)' }}>
                FoodLens 360°
              </p>
              <h2>Photograph the meal. Get an honest answer.</h2>
              <p className="lede">
                A photograph cannot resolve portion size, hidden oil or cooking method exactly. So
                FoodLens returns a range, the source of its evidence and a confidence level — and
                refuses to collapse that range unless the source is verified.
              </p>
            </div>

            <div className="dash">
              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Energy estimate</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-orange)' }}>
                    AI visual estimate
                  </span>
                </div>
                <ConfidenceCone
                  min={520}
                  likely={690}
                  max={910}
                  unit="kcal"
                  confidence="low — quantity of oil and sauce"
                />
                <div className="card__head" style={{ marginTop: 4 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    Per 100g
                  </h3>
                  <span className="card__tag">UK front-of-pack</span>
                </div>
                <TrafficLights rows={TRAFFIC} />
                <p className="card__note">
                  Bands follow the published UK thresholds. The word is printed beside the
                  colour, because colour on its own is not an accessible signal.
                </p>
              </article>

              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">The wheel</h3>
                  <span className="card__tag">12 axes</span>
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  <Radar axes={WHEEL_LABELS} values={WHEEL_VALUES} tone="var(--mq-orange)" />
                </div>
                <p className="card__note">
                  Twelve dimensions, one of which is the estimate’s own confidence. There is no
                  composite health rating — that is the number this product refuses to invent.
                </p>
              </article>

              <article className="card card--3 card--light" style={{ gap: 14 }}>
                <Stat
                  k="Under 18"
                  v="No figures"
                  sub="Calorie, weight and BMI framing is never shown to a child, in any mode, under any consent setting."
                  tone="var(--mq-critical)"
                />
                <Stat
                  k="Never claimed"
                  v="5 things"
                  sub="Allergen absence from appearance, microbial safety from an image, any diagnosis, an exact calorie count from a photo, or that movement cancels out food."
                  tone="var(--mq-coral)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 7 · BodyCommand ---------------- */}
        <section className="section" id="bodycommand">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--mq-magenta)' }}>
                BodyCommand AI
              </p>
              <h2>Weight is one of nine pathways — and it is yours to choose.</h2>
              <p className="lede">
                For adults, supporting weight management is a primary aim of this platform. What
                it will not do is decide on your behalf that a lower number is the goal, or make
                that number the thing you are ranked on. You pick the pathway, you can change it,
                and you can switch the whole surface off without losing anything else.
              </p>
            </div>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Body trajectory</h3>
                  <span className="card__tag" style={{ color: 'var(--mq-purple)' }}>
                    8 weeks · widening cone
                  </span>
                </div>
                <FanChart
                  expected={TRAJECTORY}
                  spread={TRAJ_SPREAD}
                  label="Projected trajectory with widening uncertainty"
                />
                <p className="card__note">
                  A single confident line would be a promise nobody can keep. The cone widens
                  because the further out you look, the less anyone can honestly say.
                </p>
              </article>

              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What is helping, what is blocking</h3>
                  <span className="card__tag">behaviour waterfall</span>
                </div>
                <Waterfall items={BLOCKERS} label="Behaviours helping or blocking progress" />
                <p className="card__note">
                  <strong>Your strongest current blocker is low weekend movement.</strong> Minimum
                  effective change: add one fifteen-minute walk before lunch on Saturday.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- 8 · teams ---------------- */}
        <section className="section section--ink" id="teams">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">For organisations</p>
              <h2>A wellbeing command centre that cannot see an individual.</h2>
              <p className="lede">
                Employers, schools, care groups and councils get participation, engagement and
                campaign performance above a privacy threshold. They do not get a person.
              </p>
            </div>

            <div className="dash">
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="This week"
                  v="68%"
                  sub="of enrolled employees completed at least one movement break."
                  tone="var(--mq-teal)"
                />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="Team Score"
                  v="4 terms"
                  sub="Participation, consistency, improvement and mutual support. Capability is absent by design."
                  tone="var(--mq-lime)"
                />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="Individual view"
                  v="Absent"
                  sub="Not permission-gated. It does not exist in the type system, so no role can produce it."
                  tone="var(--mq-blue)"
                />
              </article>
            </div>

            <p className="lede" style={{ marginTop: 30 }}>
              An employer never sees health conditions, movement history, heart rate, sleep,
              disability, declined activities, calendar content or an individual risk score.{' '}
              <Link href="/industries" style={{ color: 'var(--mq-lime)', fontWeight: 600 }}>
                See the five duties of care →
              </Link>
            </p>
          </div>
        </section>

        {/* ---------------- 9 · privacy ---------------- */}
        <section className="section" id="privacy">
          <div className="wrap privacy">
            <div>
              <p className="eyebrow">Privacy as architecture</p>
              <h2>Your calendar titles never leave your device.</h2>
              <p className="lede" style={{ marginTop: 22 }}>
                Health and wearable information is special-category data. That cannot be bolted on
                afterwards, so the engine was built to need as little of it as possible.
              </p>

              <ul className="checklist">
                <li>
                  <Check />
                  <span>
                    Events are classified locally as busy, free, focus or travel. Titles and
                    attendees are never transmitted, and never sent to any language model.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    {CONSENT_SCOPES.length} consent switches, each independent and each revocable
                    without disabling the product.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    k-anonymity of {K_ANONYMITY_THRESHOLD} in the query planner, with
                    intersection-attack checks across filter combinations — and again as a
                    database constraint.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    Employees see exactly what their employer can see, on a permanent transparency
                    screen. Export and deletion are self-service.
                  </span>
                </li>
              </ul>
            </div>

            <div className="query" aria-label="Example suppressed cohort query">
              <div className="query__bar">
                <span>workforce.query_planner</span>
                <span>k ≥ {K_ANONYMITY_THRESHOLD}</span>
              </div>
              <pre className="query__body">
                <code>
                  <span className="k">SELECT</span> avg(movement_breaks){'\n'}
                  <span className="k">FROM</span> cohort{'\n'}
                  <span className="k">WHERE</span> site = <span className="s">
                    &apos;Leeds&apos;
                  </span>{'\n'}
                  {'  '}<span className="k">AND</span> dept = <span className="s">
                    &apos;Finance&apos;
                  </span>{'\n'}
                  {'  '}<span className="k">AND</span> tenure = <span className="s">
                    &apos;0–6 months&apos;
                  </span>
                  {'\n\n'}
                  <span className="c">-- 3 contributing users</span>
                  {'\n'}
                  <span className="c">-- below threshold</span>
                  {'\n\n'}
                  → <span className="s">SUPPRESSED</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* ---------------- personality ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">How it should feel</p>
              <h2>Healthy. Intelligent. Positive. Personal. Achievable. Alive.</h2>
            </div>
            <div className="tiles">
              {PERSONALITY.map((p, i) => (
                <article
                  className="tile"
                  key={p.trait}
                  style={{ ['--tone' as string]: `var(--c${i + 1})` }}
                >
                  <h3>{p.trait}</h3>
                  <p>{p.meaning}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- 10 · pricing ---------------- */}
        <section className="section" id="pricing">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Pricing</p>
              <h2>Published, not quoted — including the compute limits.</h2>
              <p className="lede">
                Indicative pricing, confirmed at launch. Agent Compute Units are shown on every
                plan and priced before any expensive action runs: you approve the cost, then it
                happens.
              </p>
            </div>

            <div className="plans">
              {PLANS.map((p) => (
                <article
                  className={`plancard${p.featured ? ' plancard--featured' : ''}`}
                  key={p.key}
                >
                  {p.featured && <span className="plancard__flag">Most popular</span>}
                  <div className="plancard__name">{p.name}</div>
                  <div>
                    <div className="plancard__price">{p.price}</div>
                    <div className="plancard__cadence">{p.cadence}</div>
                  </div>
                  <p className="plancard__who">{p.forWhom}</p>
                  <ul>
                    {p.includes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <Link
                    className={`btn ${p.featured ? 'btn--primary' : 'btn--dark'}`}
                    href={p.key === 'organisation' ? '/contact' : '/get-started'}
                    style={{ marginTop: 'auto' }}
                  >
                    {p.key === 'organisation' ? 'Talk to us' : 'Start free'}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- final CTA ---------------- */}
        <section className="section cta" id="cta">
          <div className="wrap">
            <p className="eyebrow eyebrow--onDark" style={{ justifyContent: 'center' }}>
              {BRAND.coach} · {BRAND.coachExpansion}
            </p>
            <h2>Start with two minutes today.</h2>
            <p>No equipment, no gym, and no rebuilding your life around a plan. {TAGLINE}</p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/get-started">
                Start free
              </Link>
              <Link className="btn btn--ghost" href="/contact">
                Talk to us
              </Link>
            </div>
            <p style={{ marginTop: 28, fontSize: 14, opacity: 0.6 }}>
              A micro-movement is {SNAP_DURATION_SECONDS.min}–{SNAP_DURATION_SECONDS.max} seconds.
              Target prompt-to-completion {Math.round(NUDGE_CONVERSION_TARGET * 100)}%. Generic
              reminder apps sit at 4–11%.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
