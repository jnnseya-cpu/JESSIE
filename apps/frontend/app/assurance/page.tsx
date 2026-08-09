import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ASSURANCE_CONTROLS,
  ASSURANCE_PREAMBLE,
  HAZARD_LOG_PREAMBLE,
  LIKELIHOOD_MEANING,
  SEVERITY_MEANING,
  assuranceByArea,
  assuranceGaps,
  hazardLog,
} from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink } from '../ui';

export const metadata: Metadata = {
  title: 'Assurance and clinical safety — JESS MOVE',
  description:
    'What this platform refuses to do, how each refusal is enforced, the honest gaps, and the ' +
    'DCB0129 hazard log in full.',
};

/**
 * The assurance summary, rendered.
 *
 * This page is built from the same module the API serves, not written
 * alongside it, so the two cannot disagree. Three decisions worth naming:
 *
 *  * **The gaps come first.** A buyer who has to hunt for what a supplier
 *    does not do will assume there is more of it, and they are usually
 *    right. Putting them above the controls costs us the flattering read
 *    and buys the only thing that matters here, which is being believed.
 *  * **The officer's incomplete appointment is stated on the page**, not
 *    only in the JSON. It is the first thing a clinical reviewer checks.
 *  * **Severity and likelihood are both shown for every hazard**, initial
 *    and residual. A log that only publishes the residual column is asking
 *    to be taken on trust about the part that was reduced.
 */

const STATUS_LABEL = {
  enforced: 'Enforced by a test',
  implemented: 'True of the code',
  gap: 'Gap',
} as const;

const ACCEPT_LABEL = {
  acceptable: 'Acceptable',
  undesirable: 'Undesirable',
  unacceptable: 'Unacceptable',
} as const;

const RATING = (l: string, s: string) => `${l.replace(/_/g, ' ')} · ${s.replace(/_/g, ' ')}`;

export default function AssurancePage() {
  const areas = assuranceByArea();
  const gaps = assuranceGaps();
  const log = hazardLog();
  const enforced = ASSURANCE_CONTROLS.filter((c) => c.status === 'enforced').length;

  return (
    <>
      <SkipLink />
      <Nav current="/assurance" />

      <main id="main">
        <PageHero
          crumb="Assurance"
          eyebrow="Assurance and clinical safety"
          title="What this platform refuses to do, and how you would know."
          lede={
            'Everything below is generated from the code rather than written about it. Where a ' +
            'control is enforced by a test, the build fails when it stops being true. Where ' +
            'something is not done, it is listed here rather than left for you to discover.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="asr__counts">
              <div>
                <strong>{ASSURANCE_CONTROLS.length}</strong>
                <span>controls published</span>
              </div>
              <div>
                <strong>{enforced}</strong>
                <span>fail the build if broken</span>
              </div>
              <div>
                <strong>{gaps.length}</strong>
                <span>honest gaps</span>
              </div>
              <div>
                <strong>{log.counts.total}</strong>
                <span>clinical hazards logged</span>
              </div>
            </div>
            <p className="asr__preamble">{ASSURANCE_PREAMBLE}</p>
          </div>
        </section>

        {/* The gaps, first. */}
        <section className="section section--tint" id="gaps">
          <div className="wrap">
            <p className="eyebrow">What we do not do</p>
            <h2>{gaps.length} things this platform has not done.</h2>
            <p className="asr__lede">
              Listed before the {enforced} things it enforces, because that is the order a buyer
              would want them in.
            </p>
            <div className="asr__gaps">
              {gaps.map((gap) => (
                <article className="asr__gap" key={gap.claim}>
                  <h3>{gap.claim}</h3>
                  <p>{gap.evidence}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Every control, by area. */}
        <section className="section" id="controls">
          <div className="wrap">
            <p className="eyebrow">The controls</p>
            <h2>Every claim, and the mechanism behind it.</h2>
            {areas.map((area) => (
              <section className="asr__area" key={area.area}>
                <header>
                  <h3>{area.label}</h3>
                  <p className="asr__tally">
                    {area.enforced} enforced · {area.implemented} implemented ·{' '}
                    {area.gaps} {area.gaps === 1 ? 'gap' : 'gaps'}
                  </p>
                </header>
                {area.controls.map((control) => (
                  <article className={`asr__ctl asr__ctl--${control.status}`} key={control.claim}>
                    <span className="asr__badge">{STATUS_LABEL[control.status]}</span>
                    <h4>{control.claim}</h4>
                    <p>{control.evidence}</p>
                  </article>
                ))}
              </section>
            ))}
          </div>
        </section>

        {/* Safeguarding, the one-pager a school actually reads. */}
        <section className="section section--tint" id="safeguarding">
          <div className="wrap">
            <p className="eyebrow">Safeguarding</p>
            <h2>The answer a school needs, in one sentence.</h2>
            <p className="asr__onesentence">
              No weight, no body-mass index and no energy figure can be rendered for an account
              under 18 — not hidden by a setting, not available behind a toggle, but absent from
              what the platform will produce for that account at all.
            </p>
            <div className="asr__sgrid">
              <div>
                <h3>How you would know</h3>
                <p>
                  It is charter rule C6, and it is asserted in the test suite rather than described
                  in a policy. A build where a minor could be shown a weight does not pass.
                </p>
              </div>
              <div>
                <h3>What a child does get</h3>
                <p>
                  Movement, growth in their own terms, and a coach calibrated to their age. No
                  calorie figure, no target, no comparison to anybody else, and no condition
                  guidance of any kind.
                </p>
              </div>
              <div>
                <h3>Guardians</h3>
                <p>
                  An account under 18 cannot be created without a guardian email, and it activates
                  only when that guardian confirms.
                </p>
              </div>
              <div>
                <h3>What we do not do</h3>
                <p>
                  Age is self-declared at registration. Ofcom’s 2026 position is that
                  self-declaration is not highly effective age assurance. Our protections are
                  strongest exactly where a wrong age would matter most, but the declaration itself
                  is unverified and you should weigh that.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The hazard log. */}
        <section className="section" id="hazards">
          <div className="wrap">
            <p className="eyebrow">Clinical risk management</p>
            <h2>The DCB0129 hazard log, in full.</h2>
            <p className="asr__lede">{HAZARD_LOG_PREAMBLE}</p>

            <div className="asr__officer">
              <p className="asr__badge asr__badge--warn">Appointment incomplete</p>
              <h3>
                {log.officer.name} — {log.officer.role}
              </h3>
              {/*
                `says` already enumerates what is missing, so the list is
                not repeated underneath it. A reader who sees the same four
                items twice starts skimming, which is the opposite of what
                this card is for.
              */}
              <p>{log.officerStatus.says}</p>
              <p className="asr__status">{log.status}</p>
            </div>

            <div className="asr__counts asr__counts--small">
              <div>
                <strong>{log.counts.acceptableResidual}</strong>
                <span>acceptable after controls</span>
              </div>
              <div>
                <strong>{log.counts.undesirableResidual}</strong>
                <span>undesirable, each with a note</span>
              </div>
              <div>
                <strong>{log.counts.unacceptableResidual}</strong>
                <span>unacceptable — none ships</span>
              </div>
              <div>
                <strong>
                  {log.counts.testedControls}/{log.counts.controls}
                </strong>
                <span>controls enforced by a test</span>
              </div>
            </div>

            {log.hazards.map((hazard) => (
              <article className="asr__haz" key={hazard.id}>
                <header>
                  <span className="asr__hazid">{hazard.id}</span>
                  <h3>{hazard.hazard}</h3>
                </header>
                <dl className="asr__hazbody">
                  <div>
                    <dt>Cause</dt>
                    <dd>{hazard.cause}</dd>
                  </div>
                  <div>
                    <dt>Effect on the person</dt>
                    <dd>{hazard.effect}</dd>
                  </div>
                </dl>

                <div className="asr__scores">
                  <div>
                    <span>Before controls</span>
                    <strong>{RATING(hazard.initial.likelihood, hazard.initial.severity)}</strong>
                    <em className={`asr__acc asr__acc--${hazard.initialAcceptability}`}>
                      {hazard.initialScore} · {ACCEPT_LABEL[hazard.initialAcceptability]}
                    </em>
                  </div>
                  <div>
                    <span>After controls</span>
                    <strong>{RATING(hazard.residual.likelihood, hazard.residual.severity)}</strong>
                    <em className={`asr__acc asr__acc--${hazard.residualAcceptability}`}>
                      {hazard.residualScore} · {ACCEPT_LABEL[hazard.residualAcceptability]}
                    </em>
                  </div>
                </div>

                <ul className="asr__controls">
                  {hazard.controls.map((control) => (
                    <li key={control.what}>
                      <span className={control.tested ? 'asr__t asr__t--yes' : 'asr__t'}>
                        {control.tested ? 'Tested' : 'Untested'}
                      </span>
                      <div>
                        <strong>{control.what}</strong>
                        <em>{control.where}</em>
                      </div>
                    </li>
                  ))}
                </ul>

                {hazard.outstanding && (
                  <p className="asr__outstanding">
                    <strong>Still owed.</strong> {hazard.outstanding}
                  </p>
                )}
              </article>
            ))}

            <div className="asr__matrix">
              <h3>How the ratings are read</h3>
              <div>
                <h4>Severity</h4>
                <ul>
                  {Object.entries(SEVERITY_MEANING).map(([key, meaning]) => (
                    <li key={key}>
                      <strong>{key.replace(/_/g, ' ')}</strong> {meaning}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Likelihood</h4>
                <ul>
                  {Object.entries(LIKELIHOOD_MEANING).map(([key, meaning]) => (
                    <li key={key}>
                      <strong>{key.replace(/_/g, ' ')}</strong> {meaning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="asr__notacase">
              A hazard log is not a safety case. The safety case is the argument that these residual
              risks are acceptable, made and signed by the Clinical Safety Officer. This is the
              evidence that argument would be built from.
            </p>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <p className="asr__lede">
              The same content is served as JSON at <code>/assurance</code>,{' '}
              <code>/assurance/safeguarding</code>, <code>/assurance/hazards</code> and{' '}
              <code>/assurance/conditions</code> — see <Link href="/developers">Developers</Link>.
              The published policies sit at <Link href="/policies">All policies</Link>.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
