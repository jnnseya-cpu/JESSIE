import type { Metadata } from 'next';
import { Footer, Nav, PageHero, SkipLink } from '../ui';
import { AccountPanel } from './account-panel';

export const metadata: Metadata = {
  title: 'Your account — JESS MOVE',
  description: 'Sign in or create your Jess Move account.',
  robots: { index: false, follow: false },
};

export default function Account() {
  return (
    <>
      <SkipLink />
      <Nav current="/account" />
      <main id="main">
        <PageHero
          crumb="Account"
          eyebrow="Sign in"
          title="Your account."
          lede={
            'One account from ten to a hundred. Under 18 it activates when a parent or ' +
            'guardian confirms — a rule the server enforces, not a checkbox.'
          }
        />
        <section className="section">
          <div className="wrap" style={{ maxWidth: 560 }}>
            <AccountPanel />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
