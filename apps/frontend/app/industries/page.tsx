import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DELIVERY_TIERS,
  DELIVERY_TIER_DEFINITIONS,
  INDUSTRIES,
  K_ANONYMITY_THRESHOLD,
} from '@jessmove/shared';
import { Donut, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'Industries — JESS MOVE',
  description:
    'Workplaces, schools, care providers, councils and families — one engine, five very ' +
    'different duties of care.',
};

const EMPLOYER_NEVER = [
  'individual health conditions',
  'exact movement history',
  'heart rate',
  'sleep readings',
  'disability status',
  'declined activities',
  'personal calendar details',
  'medical information',
  'individual risk scores',
];

const EMPLOYER_MAY = [
  'aggregate participation, above the k-anonymity floor',
  'office versus remote engagement',
  'which meeting structures never leave a gap',
  'campaign and challenge performance',
  'anonymous free-text feedback',
];

const TONE = ['var(--ic1)', 'var(--ic2)', 'var(--ic3)', 'var(--ic4)', 'var(--ic5)'];

export default function Industries() {
  return (
    <>
      <SkipLink />
      <Nav current="/industries" />

      <main id="main">
        <PageHero
          crumb="Industries"
          eyebrow="Who this is for"
          title={
            <>
              Five duties of care,<br />
              one engine.
            </>
          }
          lede={
            'An employer, a school, a care home and a council each need something different from ' +
            'the same platform — and each needs a hard boundary the others do not. Those ' +
            'boundaries are architectural, not contractual.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash" style={{ marginBottom: 50 }}>
              <article className="card card--4 card--light">
                <Stat
                  k="Privacy floor"
                  v={`k ≥ ${K_ANONYMITY_THRESHOLD}`}
                  sub="Enforced in the query planner and again as a database constraint. No override role exists."
                  tone="var(--c1)"
                />
              </article>
              <article className="card card--4 card--light">
                <Stat
                  k="Delivery tiers"
                  v={String(DELIVERY_TIERS.length)}
                  sub="Down to SMS and WhatsApp, so a workforce without company phones is still reachable."
                  tone="var(--c2)"
                />
              </article>
              <article className="card card--4 card--light">
                <Stat
                  k="Entry point"
                  v="Workplace"
                  sub="Hybrid and remote teams first: clear problem, measurable value, lowest safeguarding load."
                  tone="var(--c3)"
                />
              </article>
            </div>

            {INDUSTRIES.map((ind, i) => (
              <section
                key={ind.slug}
                id={ind.slug}
                style={{
                  paddingTop: 46,
                  paddingBottom: 46,
                  borderTop: '1px solid var(--jm-divider)',
                }}
              >
                <div className="section__head" style={{ marginBottom: 30 }}>
                  <p className="eyebrow" style={{ color: TONE[i] }}>
                    {String(i + 1).padStart(2, '0')} — {ind.name}
                  </p>
                  <h2>{ind.name}</h2>
                  <p className="lede">{ind.lede}</p>
                </div>

                <div className="dash">
                  <article className="card card--7 card--light">
                    <div className="card__head">
                      <h3 className="card__t">What it does</h3>
                    </div>
                    <ul className="prose" style={{ margin: 0, paddingLeft: 20 }}>
                      {ind.capabilities.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </article>
                  <article
                    className="card card--5 card--light"
                    style={{ borderLeft: `3px solid ${TONE[i]}` }}
                  >
                    <div className="card__head">
                      <h3 className="card__t">The boundary</h3>
                      <span className="card__tag" style={{ color: TONE[i] }}>
                        non-negotiable
                      </span>
                    </div>
                    <p className="card__note">{ind.boundary}</p>
                  </article>
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The privacy firewall</p>
              <h2>An employer buys outcomes, not visibility.</h2>
              <p className="lede">
                The individual view is not permission-gated. It does not exist in the type system,
                so there is no role, no escalation and no support ticket that can produce it.
              </p>
            </div>

            <div className="compare">
              <article className="panel panel--never">
                <h3>
                  <Cross /> Never visible to an employer
                </h3>
                <ul>
                  {EMPLOYER_NEVER.map((x) => (
                    <li key={x}>
                      <Cross />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="panel panel--always">
                <h3>
                  <Check /> Available, above the threshold
                </h3>
                <ul>
                  {EMPLOYER_MAY.map((x) => (
                    <li key={x}>
                      <Check />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Reach</p>
              <h2>The lowest tier defines the product.</h2>
              <p className="lede">
                A council programme cannot assume smartphones. A care group cannot assume
                wearables. Messaging and assisted delivery are first-class tiers with their own
                funnels, not an accessibility afterthought.
              </p>
            </div>

            <div className="dash">
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">Tier mix</h3>
                </div>
                <Donut
                  slices={DELIVERY_TIERS.map((t, i) => ({
                    label: t,
                    value: 1,
                    tone: `var(--c${i + 1})`,
                  }))}
                  centre={String(DELIVERY_TIERS.length)}
                  sub="tiers"
                />
              </article>
              <article className="card card--8 card--light">
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
              </article>
            </div>
          </div>
        </section>

        <JoinCta
          heading="Run an eight-week pilot."
          says="Group reporting never resolves to a person, at any group size. If you would rather see it from the inside first, an individual account takes two minutes and costs nothing."
          talkTo="/contact"
          talkLabel="Talk about a pilot"
          action="Create an account first"
        />
      </main>

      <Footer />
    </>
  );
}
