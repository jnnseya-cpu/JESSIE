import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ACCOUNT_TYPES,
  AGE_MODES,
  AGE_MODE_DEFINITIONS,
  CONSENT_SCOPES,
  DELIVERY_TIERS,
  DELIVERY_TIER_DEFINITIONS,
  INTEGRATIONS,
  ONBOARDING_STEPS,
  PLANS,
  SNAP_DURATION_SECONDS,
} from '@jessmove/shared';
import { AgeColumns } from '../charts';
import { Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'Get started — JESS MOVE',
  description:
    'Five steps to a seven-day starter plan. Choose an account type, set a readiness baseline, ' +
    'describe a real day, connect nothing you do not want to.',
};

const MODE_TONE: Record<string, string> = {
  explorer: 'var(--mode-explorer)',
  teen: 'var(--mode-teen)',
  momentum: 'var(--mode-momentum)',
  balance: 'var(--mode-balance)',
  independence: 'var(--mode-independence)',
  vitality: 'var(--mode-vitality)',
};

export default function GetStarted() {
  return (
    <>
      <SkipLink />
      <Nav current="/get-started" />

      <main id="main">
        <PageHero
          crumb="Get started"
          eyebrow="Onboarding"
          title={
            <>
              Five steps.<br />
              Then it fits itself to you.
            </>
          }
          lede={
            `Nothing is mandatory except the safety questions. No wearable, no calendar and no ` +
            `app are required to begin — the lowest delivery tier reaches any phone that can ` +
            `receive a message, and a Snap is ${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max} seconds either way.`
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The five steps</p>
              <h2>Under ten minutes, once.</h2>
            </div>
            <div className="steps">
              {ONBOARDING_STEPS.map((s) => (
                <div className="steprow" key={s.n}>
                  <div className="steprow__n">{String(s.n).padStart(2, '0')}</div>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ margin: '44px 0 14px', fontSize: 22 }}>Account types</h3>
            <ul className="pills">
              {ACCOUNT_TYPES.map((a) => (
                <li key={a}>{a.replace(/_/g, ' ')}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Your mode</p>
              <h2>Derived from a verified age band, never chosen freely.</h2>
              <p className="lede">
                Mode governs how much the interface shows you, how the coach speaks, which
                gamification mechanics are legal, what data may be collected and which clinical
                guardrails apply. You cannot opt into a mode that is not yours.
              </p>
            </div>

            <article className="card">
              <div className="card__head">
                <h3 className="card__t">Daily Snap cap by mode</h3>
                <span className="card__tag">A ceiling, not a target</span>
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
            </article>

            <div className="tiles" style={{ marginTop: 26 }}>
              {AGE_MODES.map((m) => {
                const def = AGE_MODE_DEFINITIONS[m];
                return (
                  <article
                    className="tile tile--ink"
                    key={m}
                    style={{ ['--tone' as string]: MODE_TONE[m] }}
                  >
                    <div className="tile__n">
                      {def.minAge}–{def.maxAge}
                    </div>
                    <h3>{def.label}</h3>
                    <p>{def.focus}</p>
                    <ul>
                      <li>{def.register}</li>
                      <li>
                        Type {def.minBodyPx}px · WCAG {def.contrast} ·{' '}
                        {def.instructionCeiling} instruction
                        {def.instructionCeiling === 1 ? '' : 's'} per Snap
                      </li>
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Consent</p>
              <h2>Eleven switches, all independent, all reversible.</h2>
              <p className="lede">
                Every integration can be disabled without disabling the product. Calendar titles
                and attendees never leave your device — only busy, free, focus and travel
                structure is transmitted, and never to any language model.
              </p>
            </div>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Consent scopes</h3>
                </div>
                <ul className="pills">
                  {CONSENT_SCOPES.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Optional integrations</h3>
                  <span className="card__tag">none required</span>
                </div>
                <ul className="pills">
                  {INTEGRATIONS.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Plans</p>
              <h2>Indicative pricing, published rather than quoted.</h2>
              <p className="lede">
                Final pricing is confirmed at launch. Organisation pricing carries a minimum
                annual contract and a setup and integration fee.
              </p>
            </div>

            <div className="plans">
              {PLANS.map((p) => (
                <article
                  className={`plancard${p.featured ? ' plancard--featured' : ''}`}
                  key={p.key}
                >
                  <div className="plancard__name">{p.name}</div>
                  <div>
                    <div className="plancard__price">{p.price}</div>
                    <div className="plancard__cadence">{p.cadence}</div>
                  </div>
                  <p className="plancard__who">{p.forWhom}</p>
                  <ul className="plancard__means">
                    {p.priceMeans.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <ul>
                    {p.includes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <Link
                    className={`btn ${p.featured ? 'btn--primary' : 'btn--dark'}`}
                    href="/contact"
                    style={{ marginTop: 'auto' }}
                  >
                    {p.key === 'organisation' ? 'Talk to us' : 'Join the list'}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">No hardware barrier</p>
              <h2>Pick the tier that matches the phone you own.</h2>
            </div>
            <div className="tiers">
              {DELIVERY_TIERS.map((tier, i) => {
                const def = DELIVERY_TIER_DEFINITIONS[tier];
                return (
                  <article
                    className="tier"
                    key={tier}
                    style={{ ['--tone' as string]: `var(--c${i + 1})` }}
                  >
                    <div className="tier__code">
                      {tier} — {def.name}
                    </div>
                    <div className="tier__name">{def.dataAvailable}</div>
                    <div className="tier__ch">
                      {def.channels.map((c) => c.replace(/_/g, ' ')).join(' · ')}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                Stop if you feel pain, dizziness or any unusual symptom. This is a general
                wellness product, not a medical device.
              </span>
            </div>
          </div>
        </section>

        <JoinCta
          heading="Start now, in about two minutes."
          says="Pick who you are moving for, answer a short readiness check, and the right mode is configured before your first prompt. Nothing to install and nothing to pay."
          talkTo="/how-it-works"
          talkLabel="How it works"
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
