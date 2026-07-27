import {
  AGE_MODES,
  AGE_MODE_DEFINITIONS,
  BRAND,
  CHARTER,
  DELIVERY_TIERS,
  DELIVERY_TIER_DEFINITIONS,
  K_ANONYMITY_THRESHOLD,
  MOVEMENT_VARIANTS,
  NUDGE_CONVERSION_TARGET,
  SIGNATURE_LINE,
  SNAP_DURATION_SECONDS,
  VARIANT_LABELS,
} from '@jessie-os/shared';
import { Check, Footer, Nav, SkipLink, Tick, VariantGlyph } from './ui';

/* ---------------- page ---------------- */

const LAWS = [
  {
    n: 'Law 1',
    title: 'Just Enough',
    accent: 'var(--jes-pulse)',
    body:
      'The system never prescribes the optimal dose. It prescribes the largest dose you will ' +
      'actually complete, then escalates by no more than 7% a week. Completion rate is the ' +
      'north-star metric — not minutes moved.',
  },
  {
    n: 'Law 2',
    title: 'No Empty Nudges',
    accent: 'var(--jes-ember)',
    body:
      'A notification that fires when you cannot move is a defect. It is logged as a misfire and ' +
      'used to retrain the timing model. The system would rather stay silent than be ignored.',
  },
  {
    n: 'Law 3',
    title: 'Every Body Qualifies',
    accent: 'var(--jes-deep)',
    body:
      'Every movement ships in five executable variants. A movement without all five cannot be ' +
      'published. This is not an accessibility feature bolted on — it is a publishing gate.',
  },
  {
    n: 'Law 4',
    title: 'Never Weaponise the Streak',
    accent: 'var(--jes-gold)',
    body:
      'Loss-aversion mechanics that punish illness, caring duties, disability flare-ups or ' +
      'bereavement are banned at the engine level. Chains forgive. Guilt is a churn driver, ' +
      'not a growth lever.',
  },
];

const MODE_COPY: Record<string, string> = {
  kid: 'Play-framed missions inside a guardian-gated account. No strangers, no losses shown, no body talk.',
  teen: 'Dry, low-hype, zero cringe. Peer crews inside a school tenancy or an invite-only graph.',
  standard: 'Calendar-native micro-breaks between the meetings that fill a working day.',
  silver: 'Balance, lower-limb strength, grip and gait — the falls-prevention stack, unhurried.',
  centennial: 'Voice-first, one action per screen, no timers, no failure states. Seated by default.',
};

const VARIANT_NOTES: Record<string, string> = {
  standing: 'Upright and unsupported. One of five — never the default.',
  seated: 'A standard chair, no support required.',
  chair_supported: 'Hand support on a stable surface. The falls-risk pathway.',
  bed_recliner: 'Lying or semi-reclined. Care settings and acute recovery.',
  adaptive_single_limb: 'Wheelchair-compatible, single-limb, limited range. Independently authored.',
};

export default function Home() {
  const secondsRange = `${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max}s`;

  return (
    <>
      <SkipLink />
      <Nav current="/" />


      <main id="main">
        {/* ---------------- hero ---------------- */}
        <section className="hero">
          <div className="hero__aura" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />
          <div className="wrap hero__inner">
            <div>
              <p className="eyebrow eyebrow--onDark">{BRAND.expansion}</p>
              <h1>
                Movement, engineered<br />
                into the <em>gaps</em>.
              </h1>
              <p className="hero__lede">
                Fitness apps compete for the hour you do not have. {BRAND.platform} owns the
                200 two-minute gaps you did not know you had — verified as real, matched to your
                body, delivered at a difficulty you can actually finish.
              </p>
              <div className="hero__cta">
                <a className="btn btn--primary" href="#cta">
                  Request access
                </a>
                <a className="btn btn--ghost" href="#doctrine">
                  Read the doctrine
                </a>
              </div>
              <p className="hero__note">
                A general wellness product for ages 10 to 100. It does not diagnose, treat, or
                replace clinical care.
              </p>
            </div>

            {/* The Snap — the atomic unit, shown rather than described */}
            <div className="snapcard">
              <div className="snapcard__top">
                <span className="chip">
                  <span className="chip__dot" aria-hidden="true" />
                  Gap verified
                </span>
                <span className="snapcard__time">14:35 · 25 min free</span>
              </div>

              <h2 className="snapcard__title">Desk Thoracic Opener</h2>
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
                  <div className="metric__k">Dose</div>
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
                  14 safety rules evaluated · privacy class semi-public · expires 15:00
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- proof strip ---------------- */}
        <section className="proof">
          <div className="wrap">
            <div className="proof__grid">
              <div className="proof__cell">
                <div className="proof__n">{secondsRange}</div>
                <p className="proof__l">
                  The Snap — the atomic unit. Not a workout, not a session.
                </p>
              </div>
              <div className="proof__cell">
                <div className="proof__n">{MOVEMENT_VARIANTS.length} variants</div>
                <p className="proof__l">
                  Required on every published movement. No exceptions, no override.
                </p>
              </div>
              <div className="proof__cell">
                <div className="proof__n">10 → 100</div>
                <p className="proof__l">
                  {AGE_MODES.length} age-band operating modes and {DELIVERY_TIERS.length} delivery
                  tiers from one engine.
                </p>
              </div>
              <div className="proof__cell">
                <div className="proof__n">k ≥ {K_ANONYMITY_THRESHOLD}</div>
                <p className="proof__l">
                  Enforced in the query planner. Employers structurally cannot see an individual.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- doctrine ---------------- */}
        <section className="section" id="doctrine">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The doctrine</p>
              <h2>Four laws govern everything the engine does.</h2>
              <p className="lede">
                Every product in this category has failed for the same reason: it asks for time
                people do not have, in a form they find humiliating. These four laws are the
                correction, and they are enforced in code rather than stated in a values page.
              </p>
            </div>

            <div className="laws">
              {LAWS.map((law) => (
                <article
                  className="law"
                  key={law.n}
                  style={{ ['--accent' as string]: law.accent }}
                >
                  <div className="law__n">{law.n}</div>
                  <h3>{law.title}</h3>
                  <p>{law.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- age spectrum ---------------- */}
        <section className="section section--ink" id="spectrum">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Ten to a hundred</p>
              <h2>One engine. {AGE_MODES.length} modes. Every decade of a life.</h2>
              <p className="lede">
                Mode is derived from a verified age band and a capability profile — never chosen
                freely, never inferred from behaviour. It governs interface density, the coach’s
                register, gamification mechanics, data collection scope and clinical guardrails.
              </p>
            </div>

            <div className="spectrum">
              <div className="spectrum__bar" aria-hidden="true" />
              <div className="spectrum__grid">
                {AGE_MODES.map((mode) => {
                  const def = AGE_MODE_DEFINITIONS[mode];
                  return (
                    <article className="mode" key={mode}>
                      <div className="mode__age">
                        {def.minAge}–{def.maxAge}
                      </div>
                      <div className="mode__name">{def.label}</div>
                      <p className="mode__desc">{MODE_COPY[mode]}</p>
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
              <p className="eyebrow">The publishing gate</p>
              <h2>Five bodies, or it does not ship.</h2>
              <p className="lede">
                A competitor with a standing-first library cannot retrofit this. Every movement
                exists in five independently authored variants, each with cue text for all
                {' '}{AGE_MODES.length} modes and a passed safety screening, before it can reach
                a single user.
              </p>
            </div>

            <div className="gate">
              {MOVEMENT_VARIANTS.map((variant) => (
                <article className="variant" key={variant}>
                  <VariantGlyph variant={variant} />
                  <div className="variant__name">{VARIANT_LABELS[variant]}</div>
                  <p className="variant__note">{VARIANT_NOTES[variant]}</p>
                </article>
              ))}
            </div>

            <div className="gate__rule">
              <Tick />
              <p>
                Enforced in the API, not by process discipline. There is no{' '}
                <strong>force_publish</strong> flag, no admin bypass and no override role — a
                partial movement stays in draft indefinitely.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- delivery tiers ---------------- */}
        <section className="section section--tint" id="reach">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Reach</p>
              <h2>Nobody is excluded by hardware.</h2>
              <p className="lede">
                The product’s reach is defined by its lowest tier, not its highest. Messaging and
                assisted tiers are first-class product tiers with their own conversion funnels —
                not charity.
              </p>
            </div>

            <div className="tiers">
              {DELIVERY_TIERS.map((tier) => {
                const def = DELIVERY_TIER_DEFINITIONS[tier];
                return (
                  <article className="tier" key={tier}>
                    <div className="tier__code">
                      {tier} — {def.name}
                    </div>
                    <div className="tier__name">{def.dataAvailable}</div>
                    <p className="tier__desc">
                      Verified by {def.verification.join(', ').replace(/_/g, ' ')}.
                    </p>
                    <div className="tier__ch">
                      {def.channels.map((c) => c.replace(/_/g, ' ')).join(' · ')}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------- privacy ---------------- */}
        <section className="section section--ink" id="privacy">
          <div className="wrap privacy">
            <div>
              <p className="eyebrow eyebrow--onDark">Privacy as architecture</p>
              <h2>An employer buys outcomes, not visibility.</h2>
              <p className="lede" style={{ marginTop: 22 }}>
                If an HR director can see that one named person stopped moving in March, the
                product is a liability. So the individual view does not exist — it is not
                permission-gated, it is absent.
              </p>

              <ul className="checklist">
                <li>
                  <Check />
                  <span>
                    k-anonymity of {K_ANONYMITY_THRESHOLD} enforced inside the query planner,
                    with intersection-attack checks across filter combinations.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    No individual endpoints on the workforce API surface. Differential-privacy
                    noise on every small-cohort aggregate.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    Calendar titles and attendees never leave the device. Only busy/free structure
                    is transmitted, and never to any language model.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    Employees see exactly what their employer can see, on a permanent transparency
                    screen.
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

        {/* ---------------- charter ---------------- */}
        <section className="section" id="charter">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The Ethical Gamification Charter</p>
              <h2>Ethics as a failing test, not a values page.</h2>
              <p className="lede">
                This category is built on dark patterns. Ours are banned at the engine level, and
                the ban is asserted in continuous integration — a build that violates the charter
                does not ship.
              </p>
            </div>

            <div className="charter">
              {CHARTER.map((rule) => (
                <article className="rule" key={rule.id}>
                  <span className="rule__id">{rule.id}</span>
                  <p>{rule.rule}</p>
                </article>
              ))}
            </div>

            <div className="ci">
              <Tick />
              <span>charter.spec.ts — 8 assertions · build gate</span>
            </div>
          </div>
        </section>

        {/* ---------------- cta ---------------- */}
        <section className="section cta" id="cta">
          <div className="wrap">
            <p className="eyebrow eyebrow--onDark" style={{ justifyContent: 'center' }}>
              {BRAND.app} · {BRAND.coach} · the {BRAND.unit}
            </p>
            <h2>Every body qualifies.</h2>
            <p>
              {BRAND.platform} is in build. We are speaking with employers, schools, care groups
              and integrated care boards who want movement that reaches the people every other
              product designs out.
            </p>
            <div className="cta__row">
              <a className="btn btn--primary" href="mailto:hello@jessie-os.com">
                Request access
              </a>
              <a className="btn btn--ghost" href="mailto:partners@jessie-os.com">
                Partner with us
              </a>
            </div>
            <p style={{ marginTop: 30, fontSize: 14, opacity: 0.55 }}>
              Target nudge-to-Snap conversion {Math.round(NUDGE_CONVERSION_TARGET * 100)}%.
              Reminder apps in this category sit at 4–11%.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
