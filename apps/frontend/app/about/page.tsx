import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BRAND,
  DECISION_MATRIX,
  MOAT,
  MVP,
  NOT,
  POSITIONING,
  PROMISE,
  ROADMAP,
  THESIS,
} from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'About — JESS MOVE',
  description:
    'Why a movement operating system exists, what it refuses to be, and the route from a ' +
    'validation MVP to a national platform.',
};

export default function About() {
  return (
    <>
      <SkipLink />
      <Nav current="/about" />

      <main id="main">
        <PageHero
          crumb="About"
          eyebrow="Why this exists"
          title={
            <>
              The hour you do not have<br />
              is not the problem.
            </>
          }
          lede={
            'Meeting a weekly exercise target does not cancel the risk of spending the rest of ' +
            'the day sitting. That gap — between what people are told to do and what their day ' +
            'actually permits — is the entire product.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="tiles">
              <article className="tile" style={{ ['--tone' as string]: 'var(--c3)' }}>
                <div className="tile__n">SITUATION</div>
                <p>{THESIS.situation}</p>
              </article>
              <article className="tile" style={{ ['--tone' as string]: 'var(--c1)' }}>
                <div className="tile__n">INSIGHT</div>
                <p>{THESIS.insight}</p>
              </article>
              <article className="tile" style={{ ['--tone' as string]: 'var(--c2)' }}>
                <div className="tile__n">NOVELTY</div>
                <p>{THESIS.novelty}</p>
              </article>
              <article className="tile" style={{ ['--tone' as string]: 'var(--jm-critical)' }}>
                <div className="tile__n">RISK</div>
                <p>{THESIS.risk}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The promise</p>
              <h2>{PROMISE}</h2>
              <p className="lede">{POSITIONING}</p>
            </div>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">What it is not</h3>
                </div>
                <ul className="pills">
                  {NOT.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p className="card__note">
                  Kept in code rather than a slide, because positioning drifts under sales
                  pressure and every one of these is a thing somebody will eventually ask for.
                </p>
              </article>

              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Weight, and who controls it</h3>
                </div>
                <p className="card__note">
                  Supporting people to manage their weight — and to stay in control of that
                  process — is a primary aim of this platform for adults. It is served through
                  nine pathways in which reduction is one option among nine, never an assumption.
                  You choose the pathway, you can change it, and you can switch the whole surface
                  off without losing the rest of the product.
                </p>
                <p className="card__note">
                  Below 18 the answer is different and it is not negotiable: no weight, BMI,
                  calorie or appearance framing is shown to a child in any mode, under any consent
                  setting. Growth, energy, confidence and routine are the frame instead.{' '}
                  <Link href="/body-balance" style={{ color: 'var(--jm-purple)', fontWeight: 600 }}>
                    How Body Balance works →
                  </Link>
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Decision intelligence</p>
              <h2>The strategic case, written down where it can be checked.</h2>
            </div>
            <div className="tiles">
              {DECISION_MATRIX.map((d, i) => (
                <article
                  className="tile tile--ink"
                  key={d.key}
                  style={{ ['--tone' as string]: `var(--c${i + 1})` }}
                >
                  <div className="tile__n">{d.title.toUpperCase()}</div>
                  <p>{d.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">First spend</p>
              <h2>{MVP.investment} buys validation, not a finished OS.</h2>
              <p className="lede">
                The disciplined first move is to prove the engine with {MVP.audience} — a clear
                sedentary problem, measurable workplace value, and far lower safeguarding
                complexity than launching with children.
              </p>
            </div>

            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">In the MVP</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    build
                  </span>
                </div>
                <ul className="prose" style={{ margin: 0, paddingLeft: 20 }}>
                  {MVP.includes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </article>
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Deliberately excluded</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-coral)' }}>
                    later
                  </span>
                </div>
                <ul className="prose" style={{ margin: 0, paddingLeft: 20 }}>
                  {MVP.excludes.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Roadmap</p>
              <h2>Six phases from pilot to national platform.</h2>
            </div>
            <div className="steps">
              {ROADMAP.map((p) => (
                <div className="steprow" key={p.phase}>
                  <div className="steprow__n">{p.phase.replace('Phase ', '')}</div>
                  <div>
                    <h3>{p.name}</h3>
                    <p>{p.items.join(' · ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Defensibility</p>
              <h2>The moat is the dataset, not the videos.</h2>
              <p className="lede">
                Anyone can film a movement library. Nobody else will know which prompt works, for
                whom, in which environment, after how long sitting, in which tone.
              </p>
            </div>
            <div className="tiles">
              {MOAT.map((m, i) => (
                <article
                  className="tile tile--ink"
                  key={m.name}
                  style={{ ['--tone' as string]: `var(--c${i + 1})` }}
                >
                  <h3>{m.name}</h3>
                  <p>{m.detail}</p>
                </article>
              ))}
            </div>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                {BRAND.platform} is a general wellness product — not a medical device.
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
