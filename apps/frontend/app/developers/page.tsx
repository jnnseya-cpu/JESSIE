import type { Metadata } from 'next';
import Link from 'next/link';
import { K_ANONYMITY_THRESHOLD, SNAP_DURATION_SECONDS } from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink, Tick, JoinCta } from '../ui';

export const metadata: Metadata = {
  title: 'Developers — JESS MOVE',
  description:
    'The JESS MOVE API: the envelope, the endpoints, the AI gateway, the invariants the ' +
    'database enforces, and the rules a client may not work around.',
};

const ENDPOINTS: ReadonlyArray<{
  verb: 'GET' | 'POST';
  path: string;
  what: string;
}> = [
  { verb: 'GET', path: '/health', what: 'Liveness plus AI-gateway status.' },
  { verb: 'GET', path: '/system', what: 'The operating system’s invariants, machine-readable.' },
  { verb: 'GET', path: '/ai/providers', what: 'Provider configuration. Staff session required.' },
  { verb: 'POST', path: '/ai/complete', what: 'Raw gateway completion. Staff session required, and metered.' },
  { verb: 'GET', path: '/movements', what: 'The published library.' },
  { verb: 'GET', path: '/movements/gate', what: 'The publishing contract, in full.' },
  { verb: 'POST', path: '/movements/:id/check', what: 'Dry-run the five-variant gate.' },
  { verb: 'POST', path: '/movements/:id/publish', what: 'Attempt publication. Fails closed.' },
  { verb: 'POST', path: '/prescriptions/next', what: 'The core call — the next best Snap, or an explicit hold.' },
  { verb: 'POST', path: '/body/assess', what: 'Pathway and safety assessment. Can only narrow.' },
  { verb: 'POST', path: '/body/plan', what: 'The daily plan for the assessed pathway.' },
  { verb: 'GET', path: '/body/pathways', what: 'The nine pathways and what each permits.' },
  { verb: 'GET', path: '/body/scorecard', what: 'The weighting behind the four readings.' },
  { verb: 'GET', path: '/body/agents', what: 'The nineteen BodyCommand agents and their supervisor.' },
  { verb: 'GET', path: '/acu/policy', what: 'ACU policy: what is metered, what never is, and how allowances work.' },
  { verb: 'POST', path: '/acu/quote', what: 'Price an action before running it.' },
  { verb: 'POST', path: '/acu/wallets/:id/spend', what: 'Cost Governor: bucket precedence, hard stop at zero.' },
];

const INVARIANTS = [
  `A Snap outside ${SNAP_DURATION_SECONDS.min}–${SNAP_DURATION_SECONDS.max} seconds is rejected by the database.`,
  'A prescription without a context decision cannot be written.',
  'A minor without a linked guardian cannot exist.',
  'A minor placed in an adult mode cannot exist.',
  'A movement published without review is rejected.',
  `A cohort report below k = ${K_ANONYMITY_THRESHOLD} is rejected.`,
  'An ACU debit priced below its own cost floor is rejected.',
  'Grace tokens outside 0–2 are rejected.',
  'A proxy action without a named acting person is rejected.',
];

export default function Developers() {
  return (
    <>
      <SkipLink />
      <Nav current="/developers" />

      <main id="main">
        <PageHero
          crumb="Developers"
          eyebrow="Build on it"
          title={
            <>
              The rules are in the API,<br />
              not the documentation.
            </>
          }
          lede={
            'Everything the platform promises is enforced at a layer a client cannot route ' +
            'around: the publishing gate in the service, the privacy floor in the query planner, ' +
            'and the invariants as constraints inside PostgreSQL.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The envelope</p>
              <h2>Every response has the same shape.</h2>
              <p className="lede">
                Base path <code>/api</code>. Every response carries the signature line — the full
                line in <code>meta.poweredBy</code>, and an ASCII-safe rendering in the{' '}
                <code>x-powered-by-jessmove</code> header, because HTTP header values must be
                latin1.
              </p>
            </div>

            <div className="query" style={{ maxWidth: 760 }}>
              <div className="query__bar">
                <span>POST /api/prescriptions/next</span>
                <span>200</span>
              </div>
              <pre className="query__body">
                <code>
                  {'{\n'}
                  {'  '}<span className="k">&quot;data&quot;</span>: {'{\n'}
                  {'    '}<span className="k">&quot;held&quot;</span>: <span className="s">true</span>,{'\n'}
                  {'    '}<span className="k">&quot;reason&quot;</span>: <span className="s">&quot;The user cannot move right now.&quot;</span>,{'\n'}
                  {'    '}<span className="k">&quot;blocks&quot;</span>: [<span className="s">&quot;driving&quot;</span>],{'\n'}
                  {'    '}<span className="k">&quot;retryAfterSeconds&quot;</span>: <span className="s">900</span>{'\n'}
                  {'  },\n'}
                  {'  '}<span className="k">&quot;meta&quot;</span>: {'{ '}<span className="k">&quot;poweredBy&quot;</span>: <span className="s">&quot;…&quot;</span>{' }\n'}
                  {'}'}
                  {'\n\n'}
                  <span className="c">-- a hold is a 200, never an error</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Reference</p>
              <h2>Endpoints.</h2>
            </div>
            <div className="tablewrap">
              <table className="endpoints">
                <thead>
                  <tr>
                    <th scope="col">Method</th>
                    <th scope="col">Path</th>
                    <th scope="col">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.verb + e.path}>
                      <td>
                        <span className={`verb${e.verb === 'POST' ? ' verb--post' : ''}`}>
                          {e.verb}
                        </span>
                      </td>
                      <td>
                        <code>{e.path}</code>
                      </td>
                      <td>{e.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The AI gateway</p>
              <h2>One interface. No model vendor in any call site.</h2>
              <p className="lede">
                Every model call in the platform goes through one gateway, which owns provider
                selection, the fallback chain, prompt redaction, the per-agent cost ceiling, the
                timeout and the decision log. A refusal on one provider walks to the next; when
                every provider fails, the caller falls back to the cached plan — a slow model
                must never produce a broken app.
              </p>
            </div>

            <div className="dash">
              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">What the gateway guarantees</h3>
                </div>
                <ul className="ticks">
                  <li>Names, calendar titles, clinical notes and free text are redacted before any external call.</li>
                  <li>Every agent has a hard cost ceiling per invocation, enforced before the call is made.</li>
                  <li>Timing decisions are a contextual bandit, never a language model.</li>
                  <li>Model calls are logged with input hashes, not inputs.</li>
                </ul>
              </article>
              <article className="card card--6">
                <div className="card__head">
                  <h3 className="card__t">Vendor independence</h3>
                </div>
                <p className="card__note">
                  Which models sit behind the gateway is deployment configuration, not part of
                  this contract, and can change without any client noticing. Swapping or adding
                  a provider means implementing <code>ModelProvider</code> and registering it —
                  no other call site in the platform changes.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Enforcement</p>
              <h2>Nine invariants the database rejects on your behalf.</h2>
              <p className="lede">
                The schema is not a passive record. Each of these is a CHECK constraint with a
                test that attempts the violating write and asserts the rejection.
              </p>
            </div>
            <div className="tiles">
              {INVARIANTS.map((inv, i) => (
                <article
                  className="tile"
                  key={inv}
                  style={{ ['--tone' as string]: `var(--c${(i % 6) + 1})` }}
                >
                  <div className="tile__n">CHECK {String(i + 1).padStart(2, '0')}</div>
                  <p>{inv}</p>
                </article>
              ))}
            </div>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                <code>pnpm db:migrate &amp;&amp; pnpm db:test</code> — every rule proven to reject
                the write that violates it
              </span>
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Rules for clients</p>
              <h2>Things a client is not permitted to do.</h2>
            </div>
            <div className="prose">
              <ul>
                <li>
                  Render a Snap without the <code>contextDecisionId</code> that authorised it.
                </li>
                <li>
                  Display a movement in fewer than its five published variants, or default to
                  standing.
                </li>
                <li>
                  Surface any weight, BMI, calorie or appearance framing to a user under 18, in
                  any mode, under any consent setting.
                </li>
                <li>
                  Exceed the mode’s daily nudge cap, or re-fire a prompt the engine held.
                </li>
                <li>
                  Send calendar titles, attendees or free-text health notes to any model. The
                  redaction list is enforced gateway-side, but a client must not attempt it.
                </li>
                <li>
                  Present a composite “health score”. Four readings, separately, or none.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <JoinCta
          heading="Integration access."
          says="The API and its refusals are documented and public. An ordinary account is the fastest way to see what it returns."
          talkTo="/contact"
          talkLabel="Request integration access"
          action="Create an account"
        />
      </main>

      <Footer />
    </>
  );
}
