import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@movequest/shared';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Platform status — MOVEQUEST',
  description:
    'Current availability of every MoveQuest service, the incident history, and what happens ' +
    'to your day when a component fails.',
};

type State = 'ok' | 'warn' | 'build';

const BADGE: Record<State, { cls: string; label: string }> = {
  ok: { cls: 'badge--ok', label: 'Operational' },
  warn: { cls: 'badge--warn', label: 'Degraded' },
  build: { cls: 'badge--build', label: 'In build' },
};

/** 30-day history, most recent last. */
type Day = 'up' | 'degraded' | 'down' | 'none';

const up = (n: number): Day[] => Array.from({ length: n }, () => 'up');

const SERVICES: ReadonlyArray<{
  name: string;
  sub: string;
  state: State;
  history: readonly Day[];
}> = [
  {
    name: 'Movement Opportunity Engine',
    sub: 'Scoring, timing and the decision to stay silent',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'Mission delivery',
    sub: 'Push, in-app, SMS and WhatsApp tiers',
    state: 'ok',
    history: [...up(19), 'degraded', ...up(10)],
  },
  {
    name: 'AI gateway',
    sub: 'Provider routing, redaction, fallback chain',
    state: 'ok',
    history: [...up(11), 'degraded', 'degraded', ...up(17)],
  },
  {
    name: 'Calendar structure sync',
    sub: 'Google, Microsoft and Apple — on-device classification',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'Wearable ingestion',
    sub: 'Apple Health, Health Connect, Fitbit, Garmin, Samsung, Oura, Polar',
    state: 'warn',
    history: [...up(26), 'up', 'degraded', 'degraded', 'degraded'],
  },
  {
    name: 'FoodLens',
    sub: 'Image estimation, barcode lookup, swap ladder',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'BodyCommand',
    sub: 'Pathway assessment, trajectory, behaviour waterfall',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'Challenges & team scoring',
    sub: 'Participation, consistency, improvement, mutual support',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'ACU wallet & billing',
    sub: 'Quotes, spend controls, top-ups, the 4× cost-protection rule',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'Organisation analytics',
    sub: 'Aggregate reporting above the k-anonymity floor',
    state: 'ok',
    history: [...up(30)],
  },
  {
    name: 'Public API',
    sub: 'Partner and integration endpoints',
    state: 'build',
    history: [...Array.from({ length: 30 }, () => 'none' as Day)],
  },
  {
    name: 'Smart-TV & voice',
    sub: 'Care-setting and Vitality Mode delivery',
    state: 'build',
    history: [...Array.from({ length: 30 }, () => 'none' as Day)],
  },
];

const INCIDENTS = [
  {
    date: '24 July 2026',
    title: 'Wearable ingestion delays for one provider',
    state: 'Monitoring',
    tone: 'var(--mq-monitor)',
    body:
      'Sync from one wearable partner is running 30–90 minutes behind. Readiness scores using ' +
      'that source are correspondingly stale. Prompts continue from calendar and device signal, ' +
      'so missions are unaffected — they are simply less well-targeted for affected accounts. ' +
      'Partner has acknowledged; we will update daily.',
  },
  {
    date: '15 July 2026',
    title: 'AI gateway latency during a provider incident',
    state: 'Resolved in 41 minutes',
    tone: 'var(--mq-excellent)',
    body:
      'A primary model provider returned elevated errors. The gateway walked to the next link in ' +
      'the fallback chain as designed. Explanations were briefly terse where the mid-tier model ' +
      'answered instead of the frontier one. No prompts were missed and no data was lost, ' +
      'because the engine falls back to the cached plan rather than failing.',
  },
  {
    date: '8 July 2026',
    title: 'Delayed SMS delivery in the lightweight tier',
    state: 'Resolved in 2 hours 12 minutes',
    tone: 'var(--mq-excellent)',
    body:
      'A carrier route degraded, delaying T3 messages by up to 25 minutes. Missions whose window ' +
      'had passed were suppressed rather than sent late — a mission that arrives after the gap ' +
      'has closed is exactly the defect the second law exists to prevent.',
  },
];

export default function Status() {
  const degraded = SERVICES.filter((s) => s.state === 'warn').length;

  return (
    <>
      <SkipLink />
      <Nav current="/status" />

      <main id="main">
        <PageHero
          crumb="Platform status"
          eyebrow={degraded ? 'One service degraded' : 'All systems operational'}
          title={degraded ? 'One service is degraded.' : 'All systems operational.'}
          lede={
            'Live availability for every part of the platform, and — more usefully — what ' +
            'actually happens to your day when one of them fails. In almost every case the ' +
            'answer is that the engine falls back to your cached plan rather than showing you a ' +
            'broken app.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="section__head" style={{ marginBottom: 24 }}>
              <p className="eyebrow">Services</p>
              <h2>Current state.</h2>
              <p className="lede">
                Each row shows the last 30 days. State is carried by the badge text as well as
                the colour.
              </p>
            </div>

            <div className="status">
              {SERVICES.map((s) => (
                <div className="statusrow" key={s.name}>
                  <div>
                    <span className="statusrow__name">{s.name}</span>
                    <span className="statusrow__sub">{s.sub}</span>
                  </div>
                  <div className="statusrow__bars" aria-hidden="true">
                    {s.history.map((d, i) => (
                      <i
                        key={`${s.name}-${i}`}
                        className={
                          d === 'up'
                            ? ''
                            : d === 'degraded'
                              ? 'is-degraded'
                              : d === 'down'
                                ? 'is-down'
                                : 'is-none'
                        }
                      />
                    ))}
                  </div>
                  <span className={`badge ${BADGE[s.state].cls}`}>{BADGE[s.state].label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Incidents</p>
              <h2>What happened, and what it meant for a real day.</h2>
            </div>

            <div className="posts">
              {INCIDENTS.map((i) => (
                <article className="post" key={i.title}>
                  <div className="post__meta">
                    <span className="post__cat" style={{ color: i.tone }}>
                      {i.state}
                    </span>
                    <br />
                    {i.date}
                  </div>
                  <div>
                    <h3>{i.title}</h3>
                    <p>{i.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Degradation policy</p>
              <h2>A slow model must never produce a broken app.</h2>
            </div>

            <div className="tiles">
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--mq-teal)' }}>
                <h3>If the AI gateway fails</h3>
                <p>
                  The gateway walks the fallback chain across providers. If every provider fails,
                  the app serves your cached plan. You still get missions; the explanations are
                  shorter.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--mq-sky)' }}>
                <h3>If a wearable stops syncing</h3>
                <p>
                  Readiness falls back to calendar structure, device inactivity and your own
                  check-in. The engine widens its uncertainty rather than pretending to know.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--mq-orange)' }}>
                <h3>If delivery is delayed</h3>
                <p>
                  A mission whose window has closed is suppressed, not sent late. Arriving after
                  the gap has gone is the exact defect the product exists to avoid.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--mq-critical)' }}>
                <h3>What never degrades</h3>
                <p>
                  Safety screening, the five-variant requirement, the under-18 body-metric
                  prohibition and the k-anonymity floor. These fail closed: if they cannot be
                  evaluated, nothing is served.
                </p>
              </article>
            </div>

            <div className="ci" style={{ marginTop: 34 }}>
              <Tick />
              <span>
                {BRAND.platform} never contacts emergency services. In the UK, call 999 for an
                emergency and 111 for urgent health advice.
              </span>
            </div>

            <p className="lede" style={{ marginTop: 26 }}>
              Report a problem we have not listed:{' '}
              <Link href="/contact" style={{ color: 'var(--mq-lime)', fontWeight: 600 }}>
                contact us
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
