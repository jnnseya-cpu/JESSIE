import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND, CHART_REQUIREMENTS, CLINICAL_BOUNDARY } from '@movequest/shared';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'All policies — MOVEQUEST',
  description:
    'Every published policy, standard and register in one index — legal, clinical, ' +
    'safeguarding, accessibility, AI and commercial.',
};

type Row = { name: string; what: string; when: string; href?: string };

const GROUPS: ReadonlyArray<{ group: string; tone: string; rows: readonly Row[] }> = [
  {
    group: 'Legal',
    tone: 'var(--mq-blue)',
    rows: [
      {
        name: 'Terms of Service',
        what: 'The agreement between you and us — who may use the service, what it is not, and what each of us is responsible for.',
        when: 'v1.0 · 27 Jul 2026',
        href: '/terms',
      },
      {
        name: 'Privacy Policy',
        what: 'What we collect, why, who can see it, how long we keep it and how to get it back.',
        when: 'v1.0 · 27 Jul 2026',
        href: '/privacy',
      },
      {
        name: 'Cookie Policy',
        what: 'Strictly necessary cookies only on the marketing site. No advertising or cross-site tracking.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Acceptable Use Policy',
        what: 'What may not be done with the platform, including inside team challenges.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Sub-processor register',
        what: 'Every processor with access to personal data, its purpose and its location. Available on request.',
        when: 'Reviewed quarterly',
      },
    ],
  },
  {
    group: 'Safety & clinical',
    tone: 'var(--mq-critical)',
    rows: [
      {
        name: 'Clinical Safety Statement',
        what: 'The regulatory position: a general wellness product, not a medical device, with the boundary written out in full.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Movement Content Governance Standard',
        what: 'The ten pieces of metadata every movement must carry before it can be published, and the clinical review workflow.',
        when: 'v1.2 · 11 Jul 2026',
      },
      {
        name: 'Clinical Evidence Register',
        what: 'Every population-health and clinical claim made in a commercial surface, with its source, date and sign-off.',
        when: 'Living document',
      },
      {
        name: 'Adverse Event & Incident Procedure',
        what: 'How a report of pain, injury or unsafe content is triaged, escalated and closed.',
        when: 'v1.1 · 3 Jul 2026',
      },
    ],
  },
  {
    group: 'People & safeguarding',
    tone: 'var(--mq-orange)',
    rows: [
      {
        name: 'Safeguarding Policy',
        what: 'Protection of children and at-risk adults: age assurance, guardian consent, moderation, reporting and escalation.',
        when: 'v1.1 · 20 Jul 2026',
      },
      {
        name: 'Children’s Code Compliance Statement',
        what: 'How the product meets the age-appropriate design standards, including the absolute under-18 body-metric prohibition.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Accessibility Statement',
        what: 'WCAG 2.2 AA as the floor, AAA in Explorer, Independence and Vitality modes, plus known gaps and the fix dates.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Inclusive Content Standard',
        what: 'Illustration, photography and language rules — no idealised bodies as the default, no before-and-after imagery.',
        when: 'v1.0 · 27 Jul 2026',
      },
    ],
  },
  {
    group: 'AI & data',
    tone: 'var(--mq-purple)',
    rows: [
      {
        name: 'Responsible AI Statement',
        what: 'What models are used for, what they are never used for, the redaction layer, and the fallback when a provider fails.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Data Protection Impact Assessment',
        what: 'The DPIA covering calendar access, wearable ingestion, children’s data and workplace analytics.',
        when: 'v2.0 · 14 Jul 2026',
      },
      {
        name: 'Model Fairness & Monitoring Report',
        what: 'Recommendation quality and unsafe-block rates broken down by age band and accessibility profile.',
        when: 'Quarterly',
      },
      {
        name: 'Security Overview',
        what: 'Encryption, key management, row-level security, access control, audit logging and the breach procedure.',
        when: 'v1.0 · 27 Jul 2026',
      },
    ],
  },
  {
    group: 'Commercial',
    tone: 'var(--mq-teal)',
    rows: [
      {
        name: 'Ethical Gamification Charter',
        what: 'The rules that govern rewards, streaks and competition. Asserted in continuous integration — a violating build does not ship.',
        when: 'v1.1 · 20 Jul 2026',
      },
      {
        name: 'ACU Economics Policy',
        what: 'How Agent Compute Units are priced, allocated, rolled over and expired, and what is never metered.',
        when: 'v1.0 · 27 Jul 2026',
      },
      {
        name: 'Partner Claims Guide',
        what: 'What a creator or partner may say about the product, and the short list nobody may say at any price.',
        when: 'v1.0 · 27 Jul 2026',
        href: '/growth',
      },
      {
        name: 'Modern Slavery & Supplier Standard',
        what: 'Supplier due diligence and the annual statement.',
        when: 'Annual',
      },
    ],
  },
];

export default function Policies() {
  return (
    <>
      <SkipLink />
      <Nav current="/policies" />

      <main id="main">
        <PageHero
          crumb="All policies"
          eyebrow="Policy index"
          title="Everything we have committed to, in one place."
          lede={
            'Some of these are legal documents. Several are engineering standards that fail a ' +
            'build when they are broken. Where a policy is enforced in code rather than in ' +
            'process, it says so.'
          }
        />

        <section className="section">
          <div className="wrap">
            {GROUPS.map((g) => (
              <section key={g.group} style={{ marginBottom: 52 }}>
                <p className="eyebrow" style={{ color: g.tone }}>
                  {g.group}
                </p>
                <div className="policylist">
                  {g.rows.map((r) => (
                    <div className="policyrow" key={r.name}>
                      <div>
                        <h3>
                          {r.href ? <Link href={r.href}>{r.name}</Link> : r.name}
                        </h3>
                        <p>{r.what}</p>
                      </div>
                      <span className="policyrow__when">{r.when}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The boundary, restated</p>
              <h2>What {BRAND.platform} is not.</h2>
            </div>
            <ul className="pills pills--ink">
              {CLINICAL_BOUNDARY.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            <h3 style={{ margin: '46px 0 14px', fontSize: 22 }}>
              And what every chart in the product must carry
            </h3>
            <p className="lede" style={{ marginBottom: 18 }}>
              Colour is never the only way information is communicated. A status colour always
              travels with an icon or a label, and no chart may use more than six prominent
              colours.
            </p>
            <ul className="pills pills--ink">
              {CHART_REQUIREMENTS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                Requests for any document not linked above:{' '}
                <a href="mailto:hello@movequest.ai" style={{ color: 'var(--mq-lime)' }}>
                  hello@movequest.ai
                </a>
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
