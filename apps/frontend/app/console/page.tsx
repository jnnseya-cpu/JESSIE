import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';
import { ApiConsole } from './api-console';

export const metadata: Metadata = {
  title: 'API console — JESS MOVE',
  description:
    'Send real requests to a running Jess Move deployment and read the responses, ' +
    'including the safeguarding and validation behaviour.',
  robots: { index: false, follow: false },
};

export default function ConsolePage() {
  return (
    <>
      <SkipLink />
      <Nav current="/console" />

      <main id="main">
        <PageHero
          crumb="API console"
          eyebrow="For testing a deployment"
          title="Send it a real request."
          lede={
            'Every other page on this site is static. This one talks to a running API. Point it ' +
            'at localhost, at staging, or at production, and read what comes back — including ' +
            'the two behaviours worth checking on any deploy: that a person who cannot move gets ' +
            'an explicit hold rather than a movement, and that a child gets no body metrics even ' +
            'with the consent flag set to true.'
          }
        />

        <section className="section">
          <div className="wrap">
            <ApiConsole />

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                The same checks run headless in CI and from{' '}
                <code>scripts/smoke.sh</code>. This page exists so somebody without a terminal
                can verify a deployment too. See{' '}
                <Link href="/developers" style={{ color: 'var(--i-purple)', fontWeight: 600 }}>
                  the developer reference
                </Link>{' '}
                for the full endpoint list.
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
