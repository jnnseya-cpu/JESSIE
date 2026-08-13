import type { Metadata } from 'next';
import { JoinLanding } from './landing';

export const metadata: Metadata = {
  title: 'You were sent here by someone — JESS MOVE',
  description:
    'What Jess Move is, who it is for, what it costs, and what happens to what you record. ' +
    'The answers a person passing this on would want before they did.',
  // A referral link is not a search result and should never become one:
  // these pages exist to be handed over, not found.
  robots: { index: false, follow: true },
};

/**
 * The page behind a link somebody hands over.
 *
 * The whole organic strategy rests on one thing: whether a link worker, a
 * falls instructor or a pharmacist is willing to put their own credibility
 * behind a link. They are not deciding whether the product is good. They
 * are deciding whether it could embarrass them or hurt the person in front
 * of them, and those are the questions this page answers first.
 *
 * So it opens with what the platform will not do, states plainly that
 * nobody is paid for the referral, and only then offers an account. That
 * ordering costs conversions from people who were never going to trust it
 * and wins the ones who matter — a single care setting is worth more than
 * a great deal of traffic, and it is won by being unusually straight
 * rather than unusually enthusiastic.
 */
export default async function JoinByCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinLanding code={code} />;
}
