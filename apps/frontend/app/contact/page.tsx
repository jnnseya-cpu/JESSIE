import type { Metadata } from 'next';
import Link from 'next/link';
import { ACCOUNT_TYPES, BRAND } from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'Contact — JESS MOVE',
  description:
    'Talk to us about a pilot, a partnership, API access, safeguarding, accessibility or ' +
    'a data request.',
};

const CHANNELS = [
  {
    h: 'Pilots & partnerships',
    p: 'Employers, schools, care groups, councils and integrated care boards.',
    a: 'partners@jessmove.com',
  },
  {
    h: 'General enquiries',
    p: 'Anything that does not fit a box below.',
    a: 'hello@jessmove.com',
  },
  {
    h: 'API & integrations',
    p: 'Keys, the OpenAPI document, agent contract cards, webhooks.',
    a: 'developers@jessmove.com',
  },
  {
    h: 'Privacy & data requests',
    p: 'Access, export, correction, deletion and objection under UK GDPR.',
    a: 'privacy@jessmove.com',
  },
  {
    h: 'Safeguarding',
    p: 'Concerns about a child or an at-risk adult using the platform. Monitored daily.',
    a: 'safeguarding@jessmove.com',
  },
  {
    h: 'Accessibility',
    p: 'Something we have made harder than it needs to be. We treat these as defects.',
    a: 'access@jessmove.com',
  },
  {
    h: 'Clinical safety',
    p: 'Reports of unsafe content, or questions for the Clinical Safety Officer.',
    a: 'clinical@jessmove.com',
  },
  {
    h: 'Press & speaking',
    p: 'Interviews, briefings and conference requests.',
    a: 'press@jessmove.com',
  },
];

export default function Contact() {
  return (
    <>
      <SkipLink />
      <Nav current="/contact" />

      <main id="main">
        <PageHero
          crumb="Contact"
          eyebrow="Talk to us"
          title="Tell us who you are moving for."
          lede={
            'One person, a household, a workforce, a class or a care setting — the answer ' +
            'changes which mode, which delivery tier and which safeguarding posture you start on.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">Send an enquiry</h3>
                  <span className="card__tag">2 working days</span>
                </div>

                <form action="mailto:hello@jessmove.com" method="post" encType="text/plain">
                  <div className="formgrid">
                    <div className="field">
                      <label htmlFor="name">Your name</label>
                      <input id="name" name="name" type="text" autoComplete="name" required />
                    </div>
                    <div className="field">
                      <label htmlFor="email">Email</label>
                      <input id="email" name="email" type="email" autoComplete="email" required />
                    </div>
                    <div className="field">
                      <label htmlFor="org">Organisation</label>
                      <input id="org" name="organisation" type="text" autoComplete="organization" />
                    </div>
                    <div className="field">
                      <label htmlFor="kind">You are enquiring as</label>
                      <select id="kind" name="kind" defaultValue="employee">
                        {ACCOUNT_TYPES.map((a) => (
                          <option key={a} value={a}>
                            {a.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field field--wide">
                      <label htmlFor="topic">Topic</label>
                      <select id="topic" name="topic" defaultValue="pilot">
                        <option value="pilot">A pilot or partnership</option>
                        <option value="api">API and integrations</option>
                        <option value="privacy">Privacy or a data request</option>
                        <option value="safeguarding">Safeguarding</option>
                        <option value="accessibility">Accessibility</option>
                        <option value="clinical">Clinical safety</option>
                        <option value="press">Press</option>
                        <option value="other">Something else</option>
                      </select>
                    </div>
                    <div className="field field--wide">
                      <label htmlFor="message">What would you like to happen?</label>
                      <textarea id="message" name="message" required />
                      <span className="field__hint">
                        Please do not include health information about yourself or anyone else in
                        this form. If your enquiry needs it, say so and we will send you a secure
                        route.
                      </span>
                    </div>
                  </div>
                  <button className="btn btn--primary" type="submit" style={{ marginTop: 20 }}>
                    Send enquiry
                  </button>
                </form>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">Direct routes</h3>
                </div>
                <div className="channels" style={{ gridTemplateColumns: '1fr' }}>
                  {CHANNELS.slice(0, 4).map((c) => (
                    <div className="channel" key={c.a}>
                      <h3>{c.h}</h3>
                      <p>{c.p}</p>
                      <a href={`mailto:${c.a}`}>{c.a}</a>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Specialist routes</p>
              <h2>Some things should not go through a general inbox.</h2>
            </div>
            <div className="channels">
              {CHANNELS.slice(4).map((c) => (
                <div className="channel" key={c.a}>
                  <h3>{c.h}</h3>
                  <p>{c.p}</p>
                  <a href={`mailto:${c.a}`}>{c.a}</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Before you write</p>
              <h2>Two things we cannot do.</h2>
            </div>
            <div className="tiles">
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--jm-critical)' }}>
                <h3>We are not an emergency service.</h3>
                <p>
                  {BRAND.platform} never contacts emergency services and cannot respond to an
                  urgent medical situation. If someone is in danger, call 999. For urgent health
                  advice in the UK, call 111.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--c2)' }}>
                <h3>We cannot give clinical advice.</h3>
                <p>
                  We cannot tell you whether an activity is safe for a specific condition, review
                  a diagnosis, or advise on medication. Those questions belong with a clinician
                  who can examine the person asking.
                </p>
              </article>
            </div>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                Registered in England. Full corporate and regulatory details on{' '}
                <Link href="/policies" style={{ color: 'var(--jm-teal)' }}>
                  All policies
                </Link>
                .
              </span>
            </div>
          </div>
        </section>
        <JoinCta
          heading="Or skip the form."
          says="Most questions are answered faster by using it. An account is free, takes about two minutes, and nothing is charged until you choose a plan."
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
