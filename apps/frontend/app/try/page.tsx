import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOUNT_KINDS } from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink } from '../ui';
import { TryConsole } from './try-console';

export const metadata: Metadata = {
  title: 'Try it as… — JESS MOVE',
  description: 'Stand in each account’s shoes and see what the platform resolves for them.',
  robots: { index: false, follow: false },
};

export default function Try() {
  return (
    <>
      <SkipLink />
      <Nav current="/try" />
      <main id="main">
        <PageHero
          crumb="Try it as…"
          eyebrow="Role harness"
          title="Stand in each account’s shoes."
          lede={
            `One account of each of the ${ACCOUNT_KINDS.length} kinds, from an eleven-year-old ` +
            'to a platform administrator. Switch between them and watch the rules resolve — the ' +
            'profile policy, what each viewer can see, and which messages actually arrive.'
          }
        />

        <section className="section">
          <div className="wrap">
            <article className="card card--12 card--light" style={{ marginBottom: 26 }}>
              <div className="card__head">
                <h3 className="card__t">This is not a login</h3>
                <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>
                  no authentication yet
                </span>
              </div>
              <p className="card__note">
                There is no authentication in the platform — no sessions, no tokens, no
                passwords. This page switches which account the rules are evaluated{' '}
                <em>against</em>; it does not sign anybody in, and it grants nothing.
              </p>
              <p className="card__note">
                Everything below is computed by the same functions the API uses. Nothing is
                illustrated, and the page is <code>noindex</code>. Building real
                authentication is the gate before any public launch —{' '}
                <Link href="/developers">see the developer reference</Link>.
              </p>
            </article>

            <TryConsole />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
