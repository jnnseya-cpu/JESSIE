import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONSENT_SCOPES,
  PLANS,
  DELIVERY_TIERS,
  DELIVERY_TIER_DEFINITIONS,
  INDUSTRIES,
  K_ANONYMITY_THRESHOLD,
} from '@jessmove/shared';
import { Donut, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, JoinCta } from '../ui';

/** The organisation plan, from the same source of truth the checkout uses. */
const ORG_PLAN = PLANS.find((p) => p.key === 'organisation');

export const metadata: Metadata = {
  title: 'For organisations — JESS MOVE',
  description:
    'A wellbeing command centre that cannot see an individual. Workplaces, schools, care ' +
    'providers and councils — one engine, five very different duties of care, and a privacy ' +
    'boundary enforced in the query planner rather than in a contract.',
  alternates: { canonical: 'https://jessmove.com/industries' },
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
        {/*
          The organisation landing page.
          
          This was "Who this is for" — a segment index. The line below was
          section eight of twelve on the consumer landing page, where the
          person reading about sitting for 94 minutes had no use for it. It is
          the strongest claim this platform makes and it is addressed to a
          data protection officer, a procurement lead and a works council, so
          it now opens the page those three arrive on.
        */}
        <PageHero
          crumb="For organisations"
          eyebrow="For employers, schools, care groups and councils"
          title={
            <>
              A wellbeing command centre
              <br />
              that cannot see an individual.
            </>
          }
          lede={
            'You get participation, engagement and campaign performance above a privacy ' +
            'threshold. You do not get a person. That is not a policy you are asked to trust — ' +
            'the individual view does not exist in the type system, so no role, escalation or ' +
            'support ticket can produce one.'
          }
        />

        {/* ---------------- what an organisation actually sees ---------------- */}
        <section className="section section--ink" id="command-centre">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The command centre</p>
              <h2>Three numbers, and none of them is a name.</h2>
              <p className="lede">
                Employers, schools, care groups and councils get participation, engagement and
                campaign performance above a privacy threshold. Below it, the answer is
                suppressed — for you as well as for everyone else.
              </p>
            </div>

            <div className="dash">
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="This week"
                  v="68%"
                  sub="of enrolled employees completed at least one movement break."
                  tone="var(--jm-teal)"
                />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="Team Score"
                  v="4 terms"
                  sub="Participation, consistency, improvement and mutual support. Capability is absent by design."
                  tone="var(--jm-lime)"
                />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat
                  k="Individual view"
                  v="Absent"
                  sub="Not permission-gated. It does not exist in the type system, so no role can produce it."
                  tone="var(--jm-blue)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- how the boundary is enforced ---------------- */}
        <section className="section" id="architecture">
          <div className="wrap privacy">
            <div>
              <p className="eyebrow">Privacy as architecture</p>
              <h2>The query returns nothing, not less.</h2>
              <p className="lede" style={{ marginTop: 22 }}>
                Health and wearable information is special-category data under UK GDPR. That
                cannot be bolted on afterwards, so the engine was built to need as little of it as
                possible — and the reporting layer was built so that the interesting question is
                the one it refuses to answer.
              </p>

              <ul className="checklist">
                <li>
                  <Check />
                  <span>
                    k-anonymity of {K_ANONYMITY_THRESHOLD} in the query planner, with
                    intersection-attack checks across filter combinations — and again as a
                    database constraint, so it survives a refactor of the service that enforces
                    it.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    Calendar events are classified on the member&rsquo;s own device as busy, free,
                    focus or travel. Titles and attendees are never transmitted, and never sent to
                    any language model.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    {CONSENT_SCOPES.length} consent switches, each independent and each revocable
                    without disabling the product. A member who withdraws one keeps the rest.
                  </span>
                </li>
                <li>
                  <Check />
                  <span>
                    Employees see exactly what you can see, on a permanent transparency screen.
                    Export and deletion are self-service and do not route through you.
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

        {/* ---------------- what it costs ---------------- */}
        <section className="section section--tint" id="pricing">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">What it costs</p>
              <h2>A floor, not a teaser.</h2>
              <p className="lede">
                Organisation pricing is a contract, so the exact figure is agreed rather than
                picked at checkout — but the range is published here rather than hidden behind a
                form, and the bottom of it is a real price somebody pays.
              </p>
            </div>

            <div className="dash">
              {ORG_PLAN && (
                <article className="card card--5 card--light plancard">
                  <div className="plancard__name">{ORG_PLAN.name}</div>
                  <div>
                    <div className="plancard__price">{ORG_PLAN.price}</div>
                    <div className="plancard__cadence">{ORG_PLAN.cadence}</div>
                  </div>
                  <p className="plancard__who">{ORG_PLAN.forWhom}</p>
                  <ul className="plancard__means">
                    {ORG_PLAN.priceMeans.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <ul>
                    {ORG_PLAN.includes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <Link className="btn btn--primary" href="/contact" style={{ marginTop: 'auto' }}>
                    Talk to us
                  </Link>
                </article>
              )}

              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">What a seat does not buy</h3>
                  <span className="card__tag">no upgrade path</span>
                </div>
                <p className="card__note">
                  There is no tier, no enterprise agreement and no support escalation that returns
                  an individual. It is not a feature that has been withheld from your plan — the
                  query planner has no code path that produces one, and the database will not
                  store the shape. If a supplier has offered you individual-level wellbeing
                  reporting, that is the difference between the two products.
                </p>
                <ul className="pills" style={{ marginTop: 4 }}>
                  <li>No individual dashboards</li>
                  <li>No risk scores by name</li>
                  <li>No re-identification support tier</li>
                </ul>
                <p className="card__note">
                  Members can see everything you can see about their group, at any time, without
                  asking you.
                </p>
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
