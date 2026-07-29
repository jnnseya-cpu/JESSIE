import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AGE_MODES,
  CLOTHING,
  CUE_CHANNELS,
  FOOTWEAR,
  MAX_WEEKLY_ESCALATION,
  MOVEMENT_METADATA,
  MOVEMENT_VARIANTS,
  NOISE_LEVELS,
  PRIVACY_LEVELS,
  SNAP_DURATION_SECONDS,
  SPACE_LEVELS,
  SUPPORT_LADDER,
  VARIANT_LABELS,
  calibrateDose,
  fitsEnvironment,
  selectVariant,
  suppressForRepetition,
  type MovementEnvironment,
} from '@jessmove/shared';
import { CompareBars, Spark, Stat } from '../charts';
import { Cross, Footer, Nav, PageHero, SkipLink, Tick, VariantGlyph } from '../ui';

export const metadata: Metadata = {
  title: 'Micro-Movement — JESS MOVE',
  description:
    'Two to five minutes, matched to the room, the clothes and the body. Five executable ' +
    'variants on every movement, and every refusal names its own reason.',
};

/* ---------------- four real rooms ---------------- */

const ROOMS: ReadonlyArray<{ name: string; env: MovementEnvironment; note: string }> = [
  {
    name: 'Open-plan desk',
    note: 'Silent, seated, semi-public, formal shoes.',
    env: {
      space: 'seat_only', noise: 'silent', privacy: 'semi_public',
      footwear: 'formal_shoes', clothing: 'formal', stableSupport: true, inMotion: false,
    },
  },
  {
    name: 'Commuter train',
    note: 'Moving, seated, public, no support.',
    env: {
      space: 'seat_only', noise: 'quiet', privacy: 'public',
      footwear: 'formal_shoes', clothing: 'work_clothes', stableSupport: false, inMotion: true,
    },
  },
  {
    name: 'Kitchen, waiting for the kettle',
    note: 'Private, a counter to hold, socks.',
    env: {
      space: 'one_stride', noise: 'unrestricted', privacy: 'private',
      footwear: 'socks', clothing: 'unrestrictive', stableSupport: true, inMotion: false,
    },
  },
  {
    name: 'Hospital waiting area',
    note: 'Public, seated, silent, unpredictable.',
    env: {
      space: 'seat_only', noise: 'silent', privacy: 'public',
      footwear: 'soft_shoes', clothing: 'work_clothes', stableSupport: true, inMotion: false,
    },
  },
];

const MOVEMENTS = [
  {
    name: 'Seated thoracic opener',
    req: {
      minSpace: 'seat_only' as const, maxNoise: 'silent' as const, minPrivacy: 'public' as const,
      needsGrip: false, needsBalance: false, needsFloor: false,
      forbiddenFootwear: [], needsUnrestrictiveClothing: false,
    },
  },
  {
    name: 'Counter-supported calf raise',
    req: {
      minSpace: 'arms_length' as const, maxNoise: 'quiet' as const, minPrivacy: 'semi_public' as const,
      needsGrip: true, needsBalance: true, needsFloor: false,
      forbiddenFootwear: ['heels' as const], needsUnrestrictiveClothing: false,
    },
  },
  {
    name: 'Floor hip opener',
    req: {
      minSpace: 'open_room' as const, maxNoise: 'quiet' as const, minPrivacy: 'private' as const,
      needsGrip: false, needsBalance: false, needsFloor: true,
      forbiddenFootwear: ['heels' as const, 'boots' as const], needsUnrestrictiveClothing: true,
    },
  },
  {
    name: 'Standing single-leg balance',
    req: {
      minSpace: 'arms_length' as const, maxNoise: 'silent' as const, minPrivacy: 'semi_public' as const,
      needsGrip: false, needsBalance: true, needsFloor: false,
      forbiddenFootwear: ['heels' as const], needsUnrestrictiveClothing: false,
    },
  },
];

const VARIANT_NOTES: Record<string, string> = {
  standing: 'Upright and unsupported. One of five — never the default.',
  seated: 'A standard chair, no support required.',
  chair_supported: 'Hand support on a stable surface. The falls-risk pathway.',
  bed_recliner: 'Lying or semi-reclined. Care settings and acute recovery.',
  adaptive_single_limb: 'Wheelchair-compatible, single-limb, limited range. Independently authored.',
};

/* Dose over eight weeks, computed by the engine rather than drawn. */
const DOSE_SERIES: number[] = (() => {
  const out: number[] = [];
  let last = 120;
  const probabilities = [0.9, 0.9, 0.82, 0.55, 0.5, 0.7, 0.88, 0.92];
  for (const p of probabilities) {
    const { seconds } = calibrateDose({
      recentCompletions: [last],
      completionProbability: p,
      window: [SNAP_DURATION_SECONDS.min, SNAP_DURATION_SECONDS.max],
    });
    out.push(seconds);
    last = seconds;
  }
  return out;
})();

const PROFILE = {
  baseline: 'standing' as const,
  standingCleared: true,
  singleLimbOnly: false,
  wheelchairUser: false,
  flare: false,
};

export default function MicroMovement() {
  const trainPick = selectVariant(PROFILE, ROOMS[1].env, 'momentum');
  const flarePick = selectVariant({ ...PROFILE, flare: true }, ROOMS[2].env, 'balance');
  const vitalityPick = selectVariant(
    { ...PROFILE, standingCleared: false },
    ROOMS[2].env,
    'vitality',
  );
  const wheelchairPick = selectVariant({ ...PROFILE, wheelchairUser: true }, ROOMS[0].env, 'momentum');

  const SELECTIONS = [
    { label: 'On a moving train', pick: trainPick },
    { label: 'Flare reported today', pick: flarePick },
    { label: 'Vitality, standing not cleared', pick: vitalityPick },
    { label: 'Wheelchair user', pick: wheelchairPick },
  ];

  return (
    <>
      <SkipLink />
      <Nav current="/micro-movement" />

      <main id="main">
        <PageHero
          crumb="Micro-Movement"
          eyebrow="The atomic unit"
          title={
            <>
              The room, the clothes,<br />
              and the body you actually have.
            </>
          }
          lede={
            `Choosing what somebody will do in the next two minutes is a constraint-satisfaction ` +
            `problem before it is a coaching problem. Constraints are applied before preference — ` +
            `a movement you love that would have you kneeling on an office floor in a suit is not ` +
            `offered, however much you love it.`
          }
        />

        {/* ---------------- constraint matrix ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-teal)' }}>
                The narrowing
              </p>
              <h2>Four movements. Four real rooms.</h2>
              <p className="lede">
                Every cell below is computed by <code>fitsEnvironment()</code>. A cross is not a
                shrug — hover or read the note beneath and it names exactly which constraint
                failed and what would change it.
              </p>
            </div>

            <article className="card card--light">
              <div className="tablewrap">
                <table className="endpoints">
                  <thead>
                    <tr>
                      <th scope="col">Movement</th>
                      {ROOMS.map((r) => (
                        <th scope="col" key={r.name}>
                          {r.name}
                          <br />
                          <small style={{ opacity: 0.6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                            {r.note}
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOVEMENTS.map((m) => (
                      <tr key={m.name}>
                        <td style={{ fontWeight: 600 }}>{m.name}</td>
                        {ROOMS.map((r) => {
                          const fit = fitsEnvironment(m.req, r.env);
                          return (
                            <td key={r.name} title={fit.fits ? 'Available' : fit.blockedBy.join(' ')}>
                              {fit.fits ? (
                                <span style={{ color: 'var(--jm-excellent)' }}>
                                  <Tick /> Available
                                </span>
                              ) : (
                                <span style={{ opacity: 0.8 }}>
                                  <span style={{ color: 'var(--jm-action)' }}>
                                    <Cross />
                                  </span>{' '}
                                  <small>{fit.blockedBy[0]}</small>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card__note">
                The commuter train column is the interesting one: three of four movements are
                blocked, and only the seated opener survives. That is the whole product in one
                cell — most apps would have offered a squat.
              </p>
            </article>

            <div className="dash" style={{ marginTop: 22 }}>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Space</h3>
                </div>
                <ul className="pills">
                  {SPACE_LEVELS.map((s) => (
                    <li key={s}>{s.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
                <div className="card__head" style={{ marginTop: 6 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    Noise
                  </h3>
                </div>
                <ul className="pills">
                  {NOISE_LEVELS.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Privacy</h3>
                </div>
                <ul className="pills">
                  {PRIVACY_LEVELS.map((s) => (
                    <li key={s}>{s.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
                <div className="card__head" style={{ marginTop: 6 }}>
                  <h3 className="card__t" style={{ fontSize: 17 }}>
                    Clothing
                  </h3>
                </div>
                <ul className="pills">
                  {CLOTHING.map((s) => (
                    <li key={s}>{s.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Footwear</h3>
                  <span className="card__tag">yes, really</span>
                </div>
                <ul className="pills">
                  {FOOTWEAR.map((s) => (
                    <li key={s}>{s.replace(/_/g, ' ')}</li>
                  ))}
                </ul>
                <p className="card__note">
                  Heels rule out balance work. Socks on a hard floor rule out anything with a
                  pivot. Nobody else asks, and it is the reason their suggestions get ignored.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- variants ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The publishing gate</p>
              <h2>{MOVEMENT_VARIANTS.length} variants, or it does not ship.</h2>
              <p className="lede">
                Independently authored, not degraded from the standing version. Each carries cue
                text for all {AGE_MODES.length} modes across {CUE_CHANNELS.length} channels, and
                a passed safety screening, before it reaches one person.
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

            <div className="dash" style={{ marginTop: 26 }}>
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Selection only ever moves down the ladder</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    gentlest first
                  </span>
                </div>
                <ol className="ladder">
                  {SUPPORT_LADDER.map((v, i) => (
                    <li key={v} className={i === SUPPORT_LADDER.length - 1 ? 'is-active' : 'is-better'}>
                      <span className="ladder__rank">{i + 1}</span>
                      <span className="ladder__name">{VARIANT_LABELS[v]}</span>
                      <span className="ladder__level">
                        {i === SUPPORT_LADDER.length - 1 ? 'top rung' : 'always safe to offer'}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="card__note">
                  An easier variant is always safe to substitute. A harder one never is. That
                  asymmetry is why substitution is a one-way function in the engine rather than a
                  preference.
                </p>
              </article>

              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Four real selections</h3>
                </div>
                <div className="tablewrap">
                  <table className="endpoints">
                    <tbody>
                      {SELECTIONS.map((row) => (
                        <tr key={row.label}>
                          <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.label}</td>
                          <td>
                            <strong style={{ color: 'var(--jm-teal)' }}>
                              {VARIANT_LABELS[row.pick.variant]}
                            </strong>
                            <br />
                            <small style={{ opacity: 0.72 }}>{row.pick.because}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- dose ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Dose</p>
              <h2>The largest dose you will finish — not the optimal one.</h2>
              <p className="lede">
                Escalation is capped at {Math.round(MAX_WEEKLY_ESCALATION * 100)}% a week, and
                when completion slips the ask gets <em>smaller</em> rather than louder. That is
                the single decision that separates this from every plan somebody has already
                abandoned.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Eight weeks, computed by the engine</h3>
                  <span className="card__tag">seconds per micro-movement</span>
                </div>
                <div className="card__big" style={{ color: 'var(--jm-teal)' }}>
                  {DOSE_SERIES[DOSE_SERIES.length - 1]}s
                </div>
                <Spark series={DOSE_SERIES} label="Prescribed dose over eight weeks" tone="var(--jm-teal)" />
                <p className="card__note">
                  Weeks four and five dip. Completion had slipped below 60%, so{' '}
                  <code>calibrateDose()</code> reduced the ask — and the recovery afterwards is
                  steeper than it would have been if the target had held.
                </p>
              </article>

              <article className="card card--5 card--light" style={{ gap: 14 }}>
                <Stat
                  k="Duration"
                  v={`${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max}s`}
                  sub="Clamped to your mode's window. A good run never produces a five-minute block in Vitality Mode."
                  tone="var(--jm-teal)"
                />
                <Stat
                  k="Weekly ceiling"
                  v={`${Math.round(MAX_WEEKLY_ESCALATION * 100)}%`}
                  sub="The most the ask may grow. There is no override and no 'challenge yourself' toggle."
                  tone="var(--jm-lime)"
                />
                <Stat
                  k="Repetition window"
                  v="20h"
                  sub={String(suppressForRepetition(4, 0).because)}
                  tone="var(--jm-orange)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- metadata ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Content governance</p>
              <h2>Ten things a movement must carry before it exists.</h2>
              <p className="lede">
                A qualified clinical and physiotherapy panel reviews the library before any
                large-scale deployment. Until a movement carries all ten, it stays in draft —
                there is no <code>force_publish</code> flag and no admin bypass.
              </p>
            </div>

            <div className="tiles">
              {MOVEMENT_METADATA.map((m, i) => (
                <article
                  className="tile"
                  key={m}
                  style={{ ['--tone' as string]: `var(--c${(i % 6) + 1})` }}
                >
                  <div className="tile__n">FIELD {String(i + 1).padStart(2, '0')}</div>
                  <p style={{ fontSize: 16 }}>{m.replace(/^./, (c) => c.toUpperCase())}</p>
                </article>
              ))}
            </div>

            <article className="card card--light" style={{ marginTop: 26 }}>
              <div className="card__head">
                <h3 className="card__t">Cue channels</h3>
                <span className="card__tag">per variant, per mode</span>
              </div>
              <ul className="pills">
                {CUE_CHANNELS.map((c) => (
                  <li key={c}>{c.replace(/_/g, ' ')}</li>
                ))}
              </ul>
              <p className="card__note">
                {MOVEMENT_VARIANTS.length} variants × {AGE_MODES.length} modes ×{' '}
                {CUE_CHANNELS.length} channels ={' '}
                <strong>{MOVEMENT_VARIANTS.length * AGE_MODES.length * CUE_CHANNELS.length}</strong>{' '}
                authored cue sets per movement. This is the number a competitor with a
                standing-first library would have to produce retrospectively, and it is why they
                will not.
              </p>
            </article>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Two minutes, in the room you are actually in.</h2>
            <p>No equipment, no changing, no getting on the floor unless you want to.</p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/get-started">
                Start free
              </Link>
              <Link className="btn btn--ghost" href="/mova">
                How it explains itself
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
