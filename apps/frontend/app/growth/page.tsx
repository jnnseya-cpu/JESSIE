import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, POINTS_NEVER } from '@movequest/shared';
import { CompareBars, Spark, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Growth & Influencers — MOVEQUEST',
  description:
    'The creator and partner programme: what you may say, what you may never say, how ' +
    'attribution works, and how referrals are paid.',
};

const TIERS = [
  {
    name: 'Advocate',
    who: 'Anyone who uses the product and wants to bring people with them.',
    tone: 'var(--c1)',
    gets: [
      'A personal referral link and code',
      'Three months of Premium for every five activated referrals',
      'Early access to new game worlds',
      'The asset kit and the claims guide',
    ],
  },
  {
    name: 'Creator',
    who: 'Publishers with an audience in movement, accessibility, later life, workplace culture or family health.',
    tone: 'var(--c2)',
    gets: [
      'Revenue share on activated subscriptions, paid monthly',
      'A named contact and a review turnaround of two working days',
      'Pre-publication fact-checking against the Clinical Evidence Register',
      'Co-produced content with the movement team',
    ],
  },
  {
    name: 'Community partner',
    who: 'Schools, clubs, care groups, faith groups, councils and charities.',
    tone: 'var(--c4)',
    gets: [
      'Free seats for the group you serve',
      'A branded challenge and a shared progress board',
      'Onboarding support in person or over the phone',
      'Aggregate participation reporting for your funders',
    ],
  },
  {
    name: 'Clinical & professional',
    who: 'Physiotherapists, occupational therapists, personal trainers and instructors.',
    tone: 'var(--c5)',
    gets: [
      'A professional account with client-facing plan sharing',
      'Input into the movement library review process',
      'Attribution on the movements you help author',
      'A stated boundary: you advise, the product never prescribes',
    ],
  },
];

const MAY_SAY = [
  'It finds two-minute gaps in a real day and puts one movement in them.',
  'It works seated, chair-supported, reclined, single-limb or standing — five variants, always.',
  'It works over SMS or WhatsApp if you have no smartphone and no wearable.',
  'It is designed for ages 10 to 100, with six different modes.',
  'For adults, it supports weight management through nine pathways you choose between.',
  'It is a general wellness product, not a medical device.',
];

const NEVER_SAY = [
  'That it treats, cures, prevents or diagnoses any condition.',
  'That it replaces a doctor, physiotherapist or any professional.',
  'That it guarantees weight loss, or any weight loss in a stated timeframe.',
  'That it reduces absenteeism or increases productivity — that needs validated evidence we do not yet have.',
  'Anything about calories, BMI, body shape or appearance to an audience that includes under-18s.',
  'Before-and-after body imagery, in any campaign, for any age group.',
];

const FUNNEL = [
  { label: 'Link opened', value: 100, tone: 'var(--c4)' },
  { label: 'Onboarding started', value: 42, tone: 'var(--c1)' },
  { label: 'Seven-day plan generated', value: 31, tone: 'var(--c2)' },
  { label: 'Activated — three Snaps completed', value: 19, tone: 'var(--c3)' },
];

const RETENTION = [100, 74, 63, 58, 54, 52, 51, 50, 49, 49, 48, 48];

export default function Growth() {
  return (
    <>
      <SkipLink />
      <Nav current="/growth" />

      <main id="main">
        <PageHero
          crumb="Growth & Influencers"
          eyebrow="Partner programme"
          title={
            <>
              Grow it honestly,<br />
              or do not grow it here.
            </>
          }
          lede={
            'This category is full of before-and-after photographs and promises nobody can keep. ' +
            'We pay for activation rather than clicks, we fact-check claims before publication, ' +
            'and there is a short list of things no partner may say at any price.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Four ways in</p>
              <h2>Pick the one that matches your audience.</h2>
            </div>
            <div className="tiles">
              {TIERS.map((t) => (
                <article className="tile" key={t.name} style={{ ['--tone' as string]: t.tone }}>
                  <div className="tile__n">{t.name.toUpperCase()}</div>
                  <p style={{ marginBottom: 10 }}>{t.who}</p>
                  <ul>
                    {t.gets.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Attribution</p>
              <h2>Paid on activation, not on the click.</h2>
              <p className="lede">
                A click costs us nothing and tells you nothing. Activation means a person
                completed three Snaps — the point at which the engine has enough signal to be
                useful to them. It is a harder number and it is the honest one.
              </p>
            </div>

            <div className="dash">
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Referral funnel</h3>
                  <span className="card__tag">indicative</span>
                </div>
                <CompareBars rows={FUNNEL} />
              </article>
              <article className="card card--5">
                <div className="card__head">
                  <h3 className="card__t">Retention after activation</h3>
                  <span className="card__tag">12 weeks</span>
                </div>
                <div className="card__big" style={{ color: 'var(--c1)' }}>
                  {RETENTION[RETENTION.length - 1]}%
                </div>
                <Spark series={RETENTION} label="Retention curve over twelve weeks" />
                <p className="card__note">
                  The curve flattens because Engagement Rescue exists as an agent. Sustaining
                  attention past the novelty period is the second-hardest problem in this
                  category, and we treat it as an engineering problem.
                </p>
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat k="Cookie window" v="60 days" sub="First-touch attribution, no last-click override." tone="var(--c4)" />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat k="Payout" v="Monthly" sub="Net 30 from the end of the month the activation landed." tone="var(--c2)" />
              </article>
              <article className="card card--4" style={{ gap: 14 }}>
                <Stat k="Clawback" v="None" sub="If a referral churns, you keep what was earned. We do not claw back." tone="var(--c1)" />
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The claims guide</p>
              <h2>What you may say, and what nobody may say.</h2>
              <p className="lede">
                Every population-health and clinical claim in a commercial surface must be
                sourced, dated and signed off by the Clinical Safety Officer against current UK
                guidance. If a claim is not on the permitted list, ask before you publish it.
              </p>
            </div>

            <div className="compare">
              <article className="panel panel--always">
                <h3>
                  <Check /> Accurate and available
                </h3>
                <ul>
                  {MAY_SAY.map((s) => (
                    <li key={s}>
                      <Check />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="panel panel--never">
                <h3>
                  <Cross /> Never, at any price
                </h3>
                <ul>
                  {NEVER_SAY.map((s) => (
                    <li key={s}>
                      <Cross />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <p className="lede" style={{ marginTop: 34 }}>
              The same rules that bind the product bind its marketing. Progress is never scored on{' '}
              {POINTS_NEVER.join(', ')} inside the app, so it is not sold on them outside it
              either.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Disclosure</p>
              <h2>Say that it is an ad.</h2>
            </div>
            <div className="prose">
              <p>
                Partners must comply with the CAP Code and the ASA’s guidance on recognisability
                of advertising. In practice:
              </p>
              <ul>
                <li>
                  Label paid content clearly and up front — <strong>#ad</strong> or{' '}
                  <strong>Advertisement</strong>, visible before a viewer engages, not buried in a
                  caption.
                </li>
                <li>
                  Disclose a commercial relationship even where no money changed hands, including
                  gifted subscriptions and free seats.
                </li>
                <li>
                  Do not target advertising for this product at under-18s. Content that a
                  significant proportion of under-18s will see must carry no body, weight or
                  calorie framing at all.
                </li>
                <li>
                  Do not present a personal result as a typical result. We will not approve
                  testimonial creative that implies an outcome we cannot evidence.
                </li>
              </ul>
              <p>
                We will ask for a correction where a post breaches this guide, and we will end a
                partnership over a repeated breach. That is not a threat about brand safety — a
                false health claim in this category costs somebody money and hope they did not
                have to spare.
              </p>
            </div>

            <div className="ci" style={{ marginTop: 30 }}>
              <Tick />
              <span>
                {BRAND.platform} is a general wellness product. It does not diagnose or treat any
                condition.
              </span>
            </div>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Apply to the programme.</h2>
            <p>
              Tell us who your audience is and what you want to make. We will send the asset kit,
              the claims guide and a code.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/contact">
                Apply
              </Link>
              <Link className="btn btn--ghost" href="/blog">
                Read the blog
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
