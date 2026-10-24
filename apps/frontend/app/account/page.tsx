import type { Metadata } from 'next';
import { Footer, Nav, PageHero, SkipLink } from '../ui';
import { AccountPanel } from './account-panel';

export const metadata: Metadata = {
  title: 'Your account — JESS MOVE',
  description: 'Sign in or create your Jess Move account.',
  robots: { index: false, follow: false },
};

/*
 * Dynamic, because which form a visitor is shown is decided before the
 * page is sent.
 *
 * This route was statically prerendered, so the panel read the register
 * intent from the URL after mount instead. That works and it is too
 * late: on a 360px Android over slow 3G, hydration took eight seconds,
 * and for all eight the person who had just tapped "Start free" was
 * looking at a form headed "Sign in" asking for a password they do not
 * have. Reading `searchParams` here makes the server render the right
 * form in the first byte, and opts the route out of prerendering — which
 * costs nothing it had: `/account` is `noindex`, every visitor sees
 * different content, and it already fetches `/auth/me` on mount.
 */
export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const startOn =
    params.new === '1' || params.mode === 'register' ? ('register' as const) : ('login' as const);

  return (
    <>
      <SkipLink />
      <Nav current="/account" />
      <main id="main">
        <PageHero
          crumb="Account"
          eyebrow="Your space"
          title="Your account."
          lede={
            'One account from ten to a hundred. Under 18 it activates when a parent or ' +
            'guardian confirms — a rule the server enforces, not a checkbox.'
          }
        />
        <section className="section acct-canvas">
          <div className="wrap" style={{ maxWidth: 1080 }}>
            <AccountPanel startOn={startOn} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
