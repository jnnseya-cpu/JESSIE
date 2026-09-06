import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink, Tick } from '../ui';
import { readLiveStatus } from './live';

/*
 * Checked on every request, never cached.
 *
 * A status page served from a cache reports the past, and the moment it
 * matters most is the one where the cached answer is stale and green.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platform status — JESS MOVE',
  description:
    'A live check of the Jess Move API and database, what is not yet monitored, and what ' +
    'happens to your day when a component fails.',
};

type State = 'ok' | 'warn' | 'down' | 'build' | 'unknown';

const BADGE: Record<State, { cls: string; label: string }> = {
  ok: { cls: 'badge--ok', label: 'Operational' },
  warn: { cls: 'badge--warn', label: 'Degraded' },
  down: { cls: 'badge--warn', label: 'Down' },
  build: { cls: 'badge--build', label: 'In build' },
  unknown: { cls: 'badge--build', label: 'Unknown' },
};

/**
 * Parts of the platform that are built but have no independent check.
 *
 * They are listed as `unknown` rather than green, because nothing is
 * watching them. That is a less impressive page and a true one: every
 * row here previously carried a hardcoded "Operational" badge and a
 * thirty-day history that was an array literal.
 */
const UNMONITORED = [
  { name: 'Movement Opportunity Engine', sub: 'Scoring, timing and the decision to stay silent' },
  { name: 'Snap delivery', sub: 'Web push to a browser, APNs and FCM to the installed app' },
  { name: 'FoodLens', sub: 'Image estimation, barcode lookup, swap ladder' },
  { name: 'BodyCommand', sub: 'Pathway assessment, trajectory, behaviour waterfall' },
  { name: 'Challenges & team scoring', sub: 'Participation, consistency, improvement, mutual support' },
  { name: 'ACU wallet & billing', sub: 'Quotes, spend controls, top-ups and the cost floor' },
];

/** Named because they are not built, not because they are quiet. */
const IN_BUILD = [
  { name: 'Public API', sub: 'Partner and integration endpoints' },
  { name: 'Smart-TV & voice', sub: 'Care-setting and Vitality Mode delivery' },
  { name: 'SMS and WhatsApp delivery', sub: 'The lightweight tiers, for a phone that is not a smartphone' },
  { name: 'Organisation analytics', sub: 'Aggregate reporting above the k-anonymity floor' },
];

function Row({ name, sub, state, detail }: { name: string; sub: string; state: State; detail?: string }) {
  return (
    <div className="statusrow">
      <div>
        <span className="statusrow__name">{name}</span>
        <span className="statusrow__sub">{detail ?? sub}</span>
      </div>
      <span className={`badge ${BADGE[state].cls}`}>{BADGE[state].label}</span>
    </div>
  );
}

export default async function Status() {
  const { report, checkedAt } = await readLiveStatus();

  /*
   * The API row is about the API, not about the platform.
   *
   * Taking the aggregate `report.status` here produced a row reading
   * "API — Degraded — Answering", which is a contradiction on the one
   * page that has to be readable during an incident. If it answered, it
   * is up; the parts it reports on have their own rows, and the headline
   * above carries the aggregate.
   */
  const api: State = report ? 'ok' : 'down';
  const db = report?.checks?.database;
  const gateway = report?.checks?.ai_gateway;

  const upFor = (seconds: number) => {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
    return `${Math.round(hours / 24)} days`;
  };

  const toState = (s?: string): State => (s === 'ok' ? 'ok' : s === 'down' ? 'down' : s === 'degraded' ? 'warn' : 'unknown');

  const headline = !report
    ? 'The API is not answering.'
    : report.status === 'ok'
      ? 'Everything checked is answering.'
      : 'Something checked is degraded.';

  return (
    <>
      <SkipLink />
      <Nav current="/status" />

      <main id="main">
        <PageHero
          crumb="Platform status"
          eyebrow={report ? (report.status === 'ok' ? 'Checked just now' : 'Checked just now — degraded') : 'Checked just now — unreachable'}
          title={headline}
          lede={
            'Checked when you loaded this page, not cached. Only three things below are ' +
            'actually measured — the rest are listed as unknown, because nothing is yet ' +
            'watching them, and a green tick nobody is checking is worse than no tick at all.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="section__head" style={{ marginBottom: 24 }}>
              <p className="eyebrow">Checked live</p>
              <h2>Three things this page actually knows.</h2>
              <p className="lede">
                Read from the API&rsquo;s own health endpoint at{' '}
                {new Date(checkedAt).toUTCString()}. State is carried by the badge text as well
                as the colour.
              </p>
            </div>

            <div className="status">
              <Row
                name="API"
                sub="Every request the site and the app make"
                state={api}
                detail={
                  report
                    ? `Answering. Up ${upFor(report.uptimeSeconds)} on ${report.build.shortCommit ?? 'an unstamped build'}.`
                    : 'This page could not reach api.jessmove.com. If the rest of the site works, the problem is between them.'
                }
              />
              <Row
                name="Database"
                sub="Accounts, wallets, schedules and the movement ledger"
                state={report ? toState(db?.status) : 'unknown'}
                detail={report ? db?.detail : undefined}
              />
              <Row
                name="AI gateway"
                sub="Provider routing, redaction, fallback chain"
                state={report ? toState(gateway?.status) : 'unknown'}
                detail={report ? gateway?.detail : undefined}
              />
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head" style={{ marginBottom: 24 }}>
              <p className="eyebrow">Not yet monitored</p>
              <h2>Built, running, and nothing is watching it.</h2>
              <p className="lede">
                These are live in the product. There is no independent check on them yet, so
                this page will not claim one. When uptime monitoring is in place they move up.
              </p>
            </div>

            <div className="status">
              {UNMONITORED.map((s) => (
                <Row key={s.name} name={s.name} sub={s.sub} state="unknown" />
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head" style={{ marginBottom: 24 }}>
              <p className="eyebrow">In build</p>
              <h2>Named here so nothing implies otherwise.</h2>
            </div>

            <div className="status">
              {IN_BUILD.map((s) => (
                <Row key={s.name} name={s.name} sub={s.sub} state="build" />
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Incident history</p>
              <h2>There isn&rsquo;t one yet, and inventing one was the alternative.</h2>
              <p className="lede">
                Nothing has been recording availability, so there is no history to publish.
                This page previously showed thirty days of green bars and three written-up
                incidents with dates and resolution times. None of it had happened. It has been
                removed rather than left to be believed, and when a real incident occurs it will
                be written here with the same detail those inventions had.
              </p>
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">Degradation policy</p>
              <h2>A slow model must never produce a broken app.</h2>
              <p className="lede">
                This part is not a status report — it is how the system is built to fail, which
                is true whether or not anything is failing today.
              </p>
            </div>

            <div className="tiles">
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--jm-teal)' }}>
                <h3>If the AI gateway fails</h3>
                <p>
                  The gateway walks the fallback chain across providers. If every provider fails,
                  the app serves your cached plan. You still get missions; the explanations are
                  shorter.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--jm-sky)' }}>
                <h3>If a wearable stops syncing</h3>
                <p>
                  Readiness falls back to calendar structure, device inactivity and your own
                  check-in. The engine widens its uncertainty rather than pretending to know.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--jm-orange)' }}>
                <h3>If delivery is delayed</h3>
                <p>
                  A mission whose window has closed is suppressed, not sent late. Arriving after
                  the gap has gone is the exact defect the product exists to avoid.
                </p>
              </article>
              <article className="tile tile--ink" style={{ ['--tone' as string]: 'var(--jm-critical)' }}>
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
              <Link href="/contact" style={{ color: 'var(--i-lime)', fontWeight: 600 }}>
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
