import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, CONSENT_SCOPES, K_ANONYMITY_THRESHOLD } from '@movequest/shared';
import { Check, Cross, Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Privacy Policy — MOVEQUEST',
  description:
    'What MoveQuest collects, why, who can see it, and how to get it back or delete it. ' +
    'Calendar titles never leave your device.',
};

const NEVER_LEAVES = [
  'Calendar event titles',
  'Calendar attendees',
  'Meeting descriptions and links',
  'Free-text health notes',
  'Precise location coordinates',
  'Photographs, once a meal estimate is produced',
];

const SENT_ON = [
  'Busy, free, focus or travel structure — times only, no content',
  'A movement capability profile you entered yourself',
  'Completion and outcome events',
  'Coarse context category (office, home, transit, outdoors)',
];

export default function Privacy() {
  return (
    <>
      <SkipLink />
      <Nav current="/privacy" />

      <main id="main">
        <PageHero
          crumb="Privacy Policy"
          eyebrow="Version 1.0 · effective 27 July 2026"
          title="Privacy Policy"
          lede={
            'Health and wearable information is special-category data. Privacy could not be added ' +
            'to this product after it was built, so it was designed in from the first commit — ' +
            'and the parts that matter are enforced in code rather than promised in a policy.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="compare" style={{ marginBottom: 46 }}>
              <article className="panel panel--never">
                <h3>
                  <Cross /> Never leaves your device
                </h3>
                <ul>
                  {NEVER_LEAVES.map((x) => (
                    <li key={x}>
                      <Cross />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="panel panel--always">
                <h3>
                  <Check /> Sent to the engine
                </h3>
                <ul>
                  {SENT_ON.map((x) => (
                    <li key={x}>
                      <Check />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <div className="prose">
              <h2>1. Who is responsible</h2>
              <p>
                The operator of {BRAND.platform} is the data controller for your personal data,
                and is registered with the Information Commissioner&rsquo;s Office. Where an
                employer, school, care provider or council enrols you, that organisation is a
                controller for the enrolment relationship and we are a controller for your
                movement and health data. Neither can see the other&rsquo;s side of that line at
                individual level.
              </p>
              <p>
                Data protection enquiries:{' '}
                <a href="mailto:privacy@movequest.ai">privacy@movequest.ai</a>.
              </p>

              <h2>2. What we collect, and why</h2>
              <h3>Account data</h3>
              <p>
                Name, email, verified age band, account type, and — for a minor — the linked
                guardian. We need this to run your account and to place you in the correct mode,
                which governs safeguarding rules rather than preferences. Lawful basis: contract.
              </p>

              <h3>Movement readiness and capability</h3>
              <p>
                Confidence, balance, accessibility requirements, restrictions, injuries and
                intensity preference. This is health data and we ask for your explicit consent
                before collecting it. Without it, we can only offer the most conservative
                variants, so the product works but works less well. Lawful basis: explicit
                consent (UK GDPR Art. 9(2)(a)).
              </p>

              <h3>Schedule structure</h3>
              <p>
                If you connect a calendar, events are classified <strong>on your device</strong>{' '}
                into busy, free, focus and travel. Only that structure — times and a category — is
                transmitted. Titles, attendees, descriptions and links are never sent to us and
                never sent to any AI model. You can hide individual calendars. Lawful basis:
                consent.
              </p>

              <h3>Wearable and health-platform data</h3>
              <p>
                Steps, heart-rate trend, sleep and recovery indicators, where you connect them.
                Each provider is a separate switch and each can be revoked without affecting the
                others. Lawful basis: explicit consent.
              </p>

              <h3>Usage and outcomes</h3>
              <p>
                Which prompts you accepted, delayed, replaced or declined, and what you completed.
                This is what makes the next suggestion better; it is also what tells us when to
                stop suggesting. Lawful basis: legitimate interests, balanced against your rights
                and subject to your objection.
              </p>

              <h3>Food photographs</h3>
              <p>
                An image is processed to produce an estimate and is then discarded unless you
                choose to keep it in your own history. We do not use your photographs to train
                general models. Lawful basis: explicit consent.
              </p>

              <h2>3. Children</h2>
              <p>
                For users aged 10–12 a linked guardian account is mandatory and consent is
                obtained from the guardian. We apply high privacy defaults, age assurance, no
                targeted advertising, no public profiles, no location sharing and no unrestricted
                contact from adults.
              </p>
              <p>
                We do not use children&rsquo;s data in any way that could be detrimental to their
                physical or mental health and wellbeing. Concretely: no weight, BMI, calorie or
                appearance framing is shown to a person under 18 in any mode, and{' '}
                <strong>the consent switch is not consulted below 18</strong> — there is no
                setting that turns it on.
              </p>
              <p>
                A guardian sees participation, safety flags and consent settings. A guardian does
                not see private check-ins, mood entries or free-text conversation with the coach.
              </p>

              <h2>4. Employers, schools and other organisations</h2>
              <p>
                An organisation that pays for your seat sees aggregate figures only, and only
                where at least {K_ANONYMITY_THRESHOLD} people contribute to the figure. The
                threshold is enforced in the query planner and again as a database constraint,
                with intersection-attack checks across filter combinations.
              </p>
              <p>
                There is no individual view. It is not permission-gated, it is absent from the
                type system — no role, no escalation and no support request can produce it. You
                can see exactly what your organisation can see, on a permanent transparency screen
                in your account.
              </p>
              <p>
                An organisation never receives: health conditions, movement history, heart rate,
                sleep, disability status, declined activities, calendar content, medical
                information or an individual risk score.
              </p>

              <h2>5. AI processing</h2>
              <p>
                Recommendations combine deterministic safety rules, statistical models and, for
                some explanations, a large language model. Before any prompt reaches a model
                provider it passes through a redaction layer that removes direct identifiers,
                calendar content, free-text health notes and precise location.
              </p>
              <p>
                Safety decisions are never delegated to a generative model. A model may explain a
                movement; it may not invent one, and it may not widen what the safety layer
                allowed.
              </p>
              <p>
                We do not make decisions with a legal or similarly significant effect on you by
                automated means alone.
              </p>

              <h2>6. Your consent centre</h2>
              <p>
                {CONSENT_SCOPES.length} switches, each independent, each reversible, none of them
                required to keep using the product:
              </p>
              <ul className="pills" style={{ margin: '0 0 18px' }}>
                {CONSENT_SCOPES.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p>
                Withdrawing consent stops future processing. It does not make the past unlawful,
                and it does not delete your history unless you ask us to.
              </p>

              <h2>7. Sharing</h2>
              <p>
                We use processors for hosting, messaging, payments, error monitoring and AI
                inference. Each is bound by a written contract, processes only on our
                instructions, and is listed in the sub-processor register available on request.
              </p>
              <p>
                <strong>We never sell identifiable health data.</strong> We do not share your data
                with advertisers or data brokers. Research partnerships operate only on
                aggregated, k-anonymised data and require a separate, specific consent.
              </p>

              <h2>8. Where your data lives</h2>
              <p>
                Primary processing is in the UK and the European Economic Area. Where a processor
                operates outside that, transfers rely on UK adequacy regulations or the
                International Data Transfer Addendum, with a transfer risk assessment on file.
              </p>

              <h2>9. How long we keep it</h2>
              <ul>
                <li>Account data: for as long as your account exists, then 30 days.</li>
                <li>Movement and completion history: 24 months rolling, unless you export it.</li>
                <li>Wearable readings: 13 months rolling.</li>
                <li>Food photographs: discarded after estimation unless you save them.</li>
                <li>Safety and safeguarding records: 6 years, as a legal obligation.</li>
                <li>Aggregate, non-identifying statistics: indefinitely.</li>
              </ul>

              <h2>10. Your rights</h2>
              <p>
                Under UK GDPR you have the right of access, rectification, erasure, restriction,
                portability and objection, and the right to withdraw consent at any time. Export
                and deletion are self-service in your account settings; anything else, write to{' '}
                <a href="mailto:privacy@movequest.ai">privacy@movequest.ai</a> and we will respond
                within one month.
              </p>
              <p>
                If you are unhappy with our response you can complain to the Information
                Commissioner&rsquo;s Office at ico.org.uk, though we would rather you gave us the
                chance to fix it first.
              </p>

              <h2>11. Security</h2>
              <p>
                Encryption in transit and at rest, identity data separated from health and
                activity data, row-level security in the database, least-privilege access,
                immutable audit records, and a documented breach procedure with notification to
                the ICO within 72 hours where required.
              </p>

              <h2>12. Changes</h2>
              <p>
                We will give at least 30 days&rsquo; notice of a material change, in the app and
                by email, and we will not apply a new purpose to data already collected without
                asking you first.
              </p>

              <p style={{ marginTop: 34 }}>
                Related: <Link href="/terms">Terms of Service</Link> ·{' '}
                <Link href="/policies">All policies</Link> ·{' '}
                <Link href="/status">Platform status</Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
