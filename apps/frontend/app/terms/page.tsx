import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, CLINICAL_BOUNDARY, SNAP_DURATION_SECONDS } from '@movequest/shared';
import { Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Terms of Service — MOVEQUEST',
  description:
    'The agreement between you and MOVEQUEST: what the service is, what it is not, and what ' +
    'each of us is responsible for.',
};

export default function Terms() {
  return (
    <>
      <SkipLink />
      <Nav current="/terms" />

      <main id="main">
        <PageHero
          crumb="Terms of Service"
          eyebrow="Version 1.0 · effective 27 July 2026"
          title="Terms of Service"
          lede={
            'Plain terms for a wellness product used by children, working adults and people in ' +
            'their nineties. Where a clause is legally required to be dense, the summary above ' +
            'it is not.'
          }
        />

        <section className="section">
          <div className="wrap prose">
            <p>
              <strong>Summary.</strong> {BRAND.platform} suggests short movement breaks that fit
              your day. It is a general wellness product, not a medical device, and it does not
              diagnose or treat anything. You decide whether a suggestion is safe for you. You can
              leave at any time and take your data with you.
            </p>

            <h2>1. Who these terms are between</h2>
            <p>
              These terms are between you and the operator of {BRAND.platform} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;). They apply whenever you use the app, the web consoles, the
              messaging tiers, the smart-TV experience or the API.
            </p>
            <p>
              Where your access is provided by an employer, school, care provider or council, an
              additional agreement exists between us and that organisation. Where the two
              conflict on a matter of your personal data, the protections in these terms and the{' '}
              <Link href="/privacy">Privacy Policy</Link> prevail.
            </p>

            <h2>2. Who may use the service</h2>
            <ul>
              <li>
                <strong>Ages 10–12 (Explorer Mode).</strong> A linked guardian account is
                mandatory. The account cannot be created or operated without it.
              </li>
              <li>
                <strong>Ages 13–17 (Teen Mode).</strong> You may hold your own account. Some
                features are restricted, and no open leaderboards or biometric ingestion are
                available.
              </li>
              <li>
                <strong>Ages 18 and over.</strong> Momentum, Balance, Independence and Vitality
                modes, by verified age band.
              </li>
              <li>
                <strong>Supported and carer-managed accounts.</strong> A named person must act,
                and every proxy action is recorded against that named person.
              </li>
            </ul>
            <p>
              Under-10s cannot use the service. Mode is derived from a verified age band and
              cannot be chosen freely, because it governs safeguarding rules rather than
              preferences.
            </p>

            <h2>3. What the service is — and is not</h2>
            <p>
              {BRAND.platform} identifies opportunities in your day and offers a movement of{' '}
              {SNAP_DURATION_SECONDS.min}–{SNAP_DURATION_SECONDS.max} seconds. It is a{' '}
              <strong>general wellness product and not a medical device</strong>. Specifically:
            </p>
            <ul>
              {CLINICAL_BOUNDARY.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p>
              If you have a health condition, are pregnant, are recovering from surgery or injury,
              or have been advised to limit activity, get professional advice before you start and
              tell the app about your restrictions during onboarding.
            </p>

            <h2>4. Your responsibilities</h2>
            <ul>
              <li>Give accurate information during onboarding, especially about restrictions.</li>
              <li>Stop immediately if you feel pain, dizziness or any unusual symptom.</li>
              <li>Judge whether your surroundings are safe before you begin a movement.</li>
              <li>Keep your account credentials to yourself.</li>
              <li>
                Do not use the service to harass, bully or expose another person, including inside
                a team challenge.
              </li>
              <li>
                Do not attempt to identify an individual from any aggregate or cohort figure.
              </li>
            </ul>

            <h2>5. Guardians and proxies</h2>
            <p>
              A guardian may see a child’s participation, safety flags and consent settings. A
              guardian may <strong>not</strong> see the child’s private check-ins, mood entries or
              free-text conversation with the coach. This is deliberate and is not configurable.
            </p>
            <p>
              A carer operating a supported account acts on behalf of the person, not instead of
              them. Every proxy action names the acting person and is visible in the account’s
              own history.
            </p>

            <h2>6. Subscriptions, billing and cancellation</h2>
            <ul>
              <li>Prices are shown before you buy and include VAT where applicable.</li>
              <li>Subscriptions renew automatically until cancelled. Cancel any time.</li>
              <li>
                Cancelling stops the next renewal; you keep access to the end of the period you
                paid for.
              </li>
              <li>
                UK and EU consumers have a 14-day right to cancel a new subscription. Where you
                asked us to start immediately, we may charge for what you used.
              </li>
              <li>
                Agent Compute Units purchased directly are non-refundable once spent, expire per
                the published policy, and are never resold.
              </li>
              <li>
                Where an organisation pays for your seat, ending your relationship with that
                organisation ends the seat. You may convert to a personal plan and keep your data.
              </li>
            </ul>

            <h2>7. Rewards and challenges</h2>
            <p>
              Points, streaks, worlds and rewards have no cash value, are not transferable and are
              not property. We may adjust the reward economy, and will give notice before a change
              that removes something you have already earned.
            </p>
            <p>
              Streak protection is not sold. There is no paid streak restoration, and there never
              will be — it is banned by the Ethical Gamification Charter, which is asserted as a
              build gate.
            </p>

            <h2>8. Content and intellectual property</h2>
            <p>
              The movement library, the engine, the interfaces and the trade marks are ours or our
              licensors’. You get a personal, revocable, non-transferable licence to use them for
              their intended purpose.
            </p>
            <p>
              What you create — your notes, check-ins and history — remains yours. You grant us
              only the licence needed to run the service for you.
            </p>

            <h2>9. Suspension and termination</h2>
            <p>
              We may suspend an account for a safeguarding concern, a credible safety risk,
              fraudulent payment, or a serious breach of these terms. Where a suspension concerns
              a child or an at-risk adult, we will act first and explain afterwards.
            </p>
            <p>
              You may close your account at any time. Export your data first — see{' '}
              <Link href="/privacy">Privacy</Link>.
            </p>

            <h2>10. Availability</h2>
            <p>
              We aim for continuous availability and publish incidents on{' '}
              <Link href="/status">Platform status</Link>. We do not promise uninterrupted
              service. If a model provider is slow or unavailable, the app falls back to your
              cached plan rather than failing.
            </p>

            <h2>11. Liability</h2>
            <p>
              Nothing here limits liability for death or personal injury caused by our negligence,
              for fraud, or for anything else that cannot lawfully be limited.
            </p>
            <p>
              Subject to that, we are not liable for indirect or consequential loss, and our total
              liability in any twelve-month period is limited to the amount you paid us in that
              period. If you use the service free of charge, that amount is nil — which is exactly
              why you must apply your own judgement to whether a movement is safe for you.
            </p>

            <h2>12. Changes to these terms</h2>
            <p>
              We will give at least 30 days’ notice of a material change, in the app and by email.
              Continuing to use the service after the change takes effect means you accept it. If
              you do not, cancel before it does.
            </p>

            <h2>13. Law and disputes</h2>
            <p>
              These terms are governed by the law of England and Wales, and the courts of England
              and Wales have exclusive jurisdiction. If you live elsewhere in the UK, you may also
              bring proceedings in your local courts.
            </p>
            <p>
              Complaints go to <a href="mailto:hello@movequest.ai">hello@movequest.ai</a>. We
              answer within two working days.
            </p>

            <h2>14. Emergencies</h2>
            <p>
              <strong>
                {BRAND.platform} never contacts emergency services and must not be relied on in an
                emergency.
              </strong>{' '}
              In the UK, call 999 for an emergency and 111 for urgent health advice.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
