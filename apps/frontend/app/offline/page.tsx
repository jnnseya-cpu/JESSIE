import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Offline — JESS MOVE',
  robots: { index: false, follow: false },
};

/**
 * The offline fallback. Reachable only when the network is not.
 *
 * It says what still works rather than apologising, because a person
 * looking at this page has a specific question — "can I still do anything?"
 * — and the answer is yes.
 */
export default function Offline() {
  return (
    <>
      <SkipLink />
      <Nav current="/" />
      <main id="main">
        <PageHero
          crumb="Offline"
          eyebrow="No connection"
          title="You are offline."
          lede={
            'The pages you have already opened are still here. Anything that needs the network — ' +
            'your plan, your crew, a meal scan — will work again the moment you have a signal.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Available now</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                    cached
                  </span>
                </div>
                <ul className="pills">
                  <li><Link href="/">Home</Link></li>
                  <li><Link href="/how-it-works">How it works</Link></li>
                  <li><Link href="/policies">All policies</Link></li>
                  <li><Link href="/privacy">Privacy</Link></li>
                  <li><Link href="/terms">Terms</Link></li>
                </ul>
              </article>

              <article className="card card--6 card--light">
                <div className="card__head">
                  <h3 className="card__t">Why your own data is not here</h3>
                </div>
                <p className="card__note">
                  Nothing personal is stored on this device by the app. A shared phone or a
                  family tablet would otherwise keep somebody’s profile, their guardian summary
                  or a clinical flag on disk for whoever opens the browser next.
                </p>
                <p className="card__note">
                  That costs a little offline capability and is the right trade.{' '}
                  <Link href="/privacy">How this works</Link>.
                </p>
              </article>
            </div>

            <p className="lede" style={{ marginTop: 30 }}>
              Movement itself does not need us. Stand up, roll your shoulders back five times,
              and sit down again — that counted before any of this existed.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
