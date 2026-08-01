import type { Metadata } from 'next';
import { Footer, Nav, PageHero, SkipLink } from '../../ui';
import { ResetPanel } from './reset-panel';

export const metadata: Metadata = {
  title: 'Reset your password — JESS MOVE',
  robots: { index: false, follow: false },
};

export default function Reset() {
  return (
    <>
      <SkipLink />
      <Nav current="/account" />
      <main id="main">
        <PageHero
          crumb="Account"
          eyebrow="Password"
          title="Reset your password."
          lede="The link from your email works for 30 minutes and can be used once."
        />
        <section className="section acct-canvas">
          <div className="wrap" style={{ maxWidth: 1080 }}>
            <ResetPanel />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
