import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Blog — MOVEQUEST',
  description:
    'Engineering notes, product decisions and the arguments behind them — including the ones ' +
    'we lost.',
};

const POSTS = [
  {
    cat: 'Product decisions',
    date: '18 July 2026',
    read: '9 min',
    title: 'Charter rule C6, and the conflict we could not design around',
    body:
      'C6 banned weight, BMI and calorie framing at every age, and it passed as a build gate. ' +
      'Then we specified a body-composition product built on exactly those numbers. Here is the ' +
      'whole argument, the three options we wrote up, and why we scoped the rule by audience ' +
      'rather than weakening it — including what that cost us in procurement.',
  },
  {
    cat: 'Engineering',
    date: '9 July 2026',
    read: '6 min',
    title: 'We moved the rules into PostgreSQL, and it found four bugs the same afternoon',
    body:
      'A Snap outside 90–300 seconds, a minor without a guardian, a cohort report below k = 8, ' +
      'an ACU debit under the 4× protection rule. Each is now a CHECK constraint with a test ' +
      'that attempts the violating write and asserts the rejection. Application code is where ' +
      'invariants go to be forgotten.',
  },
  {
    cat: 'Design',
    date: '2 July 2026',
    read: '7 min',
    title: 'Six modes, not one interface with a font-size setting',
    body:
      'Accessibility as a toggle produces a worse product for everyone. Mode changes interface ' +
      'density, the coach’s register, which gamification mechanics are legal, what data may be ' +
      'collected and which clinical guardrails apply. A ten-year-old and an eighty-eight-year-old ' +
      'are not the same person with different eyesight.',
  },
  {
    cat: 'Behaviour',
    date: '24 June 2026',
    read: '5 min',
    title: 'The nudge we did not send',
    body:
      'Law 2 treats a notification fired into a moment you cannot move as a defect. We log the ' +
      'misfire, retrain the timing model, and count silence as a successful outcome. Our held ' +
      'rate is a headline metric, which makes every growth conversation slightly awkward and ' +
      'the product substantially better.',
  },
  {
    cat: 'Research',
    date: '11 June 2026',
    read: '8 min',
    title: 'Why the streak forgives',
    body:
      'Loss-aversion mechanics work, and they work by making people feel bad. We measured what ' +
      'happens to a chain broken by illness, caring duties or a disability flare-up, and built ' +
      'Grace Tokens, Flare Mode and a Bereavement Hold into the engine instead. Guilt is a churn ' +
      'driver, not a growth lever.',
  },
  {
    cat: 'Accessibility',
    date: '30 May 2026',
    read: '6 min',
    title: 'Five variants or it does not ship',
    body:
      'Every movement exists as standing, seated, chair-supported, bed or recliner, and adaptive ' +
      'single-limb — independently authored, not degraded from the standing version. There is no ' +
      'force_publish flag. A partial movement stays in draft indefinitely, and yes, that has ' +
      'delayed releases.',
  },
  {
    cat: 'Privacy',
    date: '17 May 2026',
    read: '7 min',
    title: 'The employer dashboard that does not exist',
    body:
      'If an HR director can see that one named person stopped moving in March, the product is a ' +
      'liability. So the individual view is not permission-gated — it is absent from the type ' +
      'system. k-anonymity of 8 is enforced in the query planner and again in the database, with ' +
      'intersection-attack checks across filter combinations.',
  },
  {
    cat: 'Nutrition',
    date: '5 May 2026',
    read: '6 min',
    title: 'A photograph cannot tell you the calories, so we stopped pretending',
    body:
      'FoodLens returns a range, its evidence source and a confidence level — and refuses to ' +
      'collapse the range unless the source is verified. Twelve dimensions, no composite health ' +
      'score, and never a calorie figure to anyone under 18.',
  },
];

export default function Blog() {
  return (
    <>
      <SkipLink />
      <Nav current="/blog" />

      <main id="main">
        <PageHero
          crumb="Blog"
          eyebrow="Notes"
          title="The arguments behind the product."
          lede={
            'Engineering notes and product decisions, written up properly — including the ones ' +
            'that made the roadmap slower and the ones we got wrong the first time.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="posts">
              {POSTS.map((p) => (
                <article className="post" key={p.title}>
                  <div className="post__meta">
                    <span className="post__cat">{p.cat}</span>
                    <br />
                    {p.date}
                    <br />
                    {p.read} read
                  </div>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.body}</p>
                  </div>
                </article>
              ))}
            </div>

            <p className="lede" style={{ marginTop: 40 }}>
              Full articles publish alongside the public beta. Until then, the specification and
              the source are the honest version of all of this —{' '}
              <Link href="/developers" style={{ color: 'var(--mq-purple)', fontWeight: 600 }}>
                see the developer reference
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Get the next one.</h2>
            <p>
              Occasional, long, and about the engineering. No growth-hacking newsletter, no
              seven-day challenge.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/contact">
                Join the list
              </Link>
              <Link className="btn btn--ghost" href="/about">
                About MOVEQUEST
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
