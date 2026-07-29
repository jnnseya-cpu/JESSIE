import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AUTO_WITHDRAW_TRIGGERS,
  CAPABILITY_FIELDS,
  CHALLENGE_TEMPLATES,
  CONTRIBUTION_CEILING,
  LEADERBOARD_RULES,
  TEAM_SCORE_TERMS,
  WITHDRAWAL_COST_TO_TEAM,
  contribution,
  isWinnableByMedianTeam,
  teamScore,
} from '@jessmove/shared';
import { CompareBars, Donut, Stat } from '../charts';
import { Check, Cross, Footer, Nav, PageHero, SkipLink, Tick } from '../ui';

export const metadata: Metadata = {
  title: 'Challenges — JESS MOVE',
  description:
    'Team Score is participation, consistency, improvement and mutual support. Capability is ' +
    'absent by design, so the fittest person cannot win every event on their own.',
};

const TERM_TONE = ['var(--jm-teal)', 'var(--jm-lime)', 'var(--jm-blue)', 'var(--jm-purple)'];

/* Two teams, scored by the engine. */
const ATHLETIC_TEAM = teamScore({
  participation: 0.35,
  consistency: 0.4,
  improvement: 0.3,
  mutualSupport: 0.2,
});
const ORDINARY_TEAM = teamScore({
  participation: 0.95,
  consistency: 0.8,
  improvement: 0.7,
  mutualSupport: 0.85,
});

/* One exceptional person on a tiny team, where domination would be easiest. */
const SUPERSTAR = contribution(
  {
    id: 'superstar',
    participated: true,
    daysActive: 7,
    daysPossible: 7,
    improvementVsOwnBaseline: 1,
    supportActs: 40,
  },
  2,
);

const MEDIAN_TEAM = isWinnableByMedianTeam(60, 7, 10);

const COMPARISON = [
  {
    label: 'Three marathon runners, nobody else moving',
    value: ATHLETIC_TEAM,
    tone: 'var(--jm-coral)',
    note: 'High individual capability. Low participation, low support. Loses.',
  },
  {
    label: 'Twelve people doing two minutes most days',
    value: ORDINARY_TEAM,
    tone: 'var(--jm-teal)',
    note: 'Nobody exceptional. Everybody in. Wins comfortably.',
  },
];

export default function Challenges() {
  return (
    <>
      <SkipLink />
      <Nav current="/challenges" />

      <main id="main">
        <PageHero
          crumb="Challenges"
          eyebrow="Inclusive competition"
          title={
            <>
              The fittest person in the room<br />
              cannot win this on their own.
            </>
          }
          lede={
            'A leaderboard that rewards capability is always won by the same person, and ' +
            'everybody else stops opening the app in week two. So capability is not weighted ' +
            'down in the scoring function — it is absent from it. A ten-year-old, a wheelchair ' +
            'user and an eighty-eight-year-old contribute on exactly the same four terms as a ' +
            'marathon runner, and the runner has no lever the others lack.'
          }
        />

        {/* ---------------- the formula ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow" style={{ color: 'var(--jm-lime)' }}>
                Team Score
              </p>
              <h2>Four terms, and none of them is output.</h2>
            </div>

            <div className="dash">
              <article className="card card--4 card--light">
                <div className="card__head">
                  <h3 className="card__t">The weights</h3>
                </div>
                <Donut
                  slices={TEAM_SCORE_TERMS.map((t, i) => ({
                    label: `${t.label} ${Math.round(t.weight * 100)}%`,
                    value: t.weight,
                    tone: TERM_TONE[i],
                  }))}
                  centre="4"
                  sub="terms"
                />
              </article>

              <article className="card card--8 card--light">
                <div className="tablewrap">
                  <table className="endpoints">
                    <thead>
                      <tr>
                        <th scope="col">Term</th>
                        <th scope="col">What it measures</th>
                        <th scope="col">Why it is there</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TEAM_SCORE_TERMS.map((t, i) => (
                        <tr key={t.key}>
                          <td style={{ fontWeight: 650, color: TERM_TONE[i], whiteSpace: 'nowrap' }}>
                            {t.label}
                            <br />
                            <small style={{ opacity: 0.6 }}>{Math.round(t.weight * 100)}%</small>
                          </td>
                          <td>{t.what}</td>
                          <td style={{ opacity: 0.78 }}>{t.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- the guard ---------------- */}
        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow eyebrow--onDark">The guard</p>
              <h2>Capability is rejected at the boundary, not discounted inside it.</h2>
              <p className="lede">
                <code>teamScore()</code> inspects the keys it is handed and throws if any of them
                resembles raw output. Fourteen field names are refused outright, so a well-meaning
                integration cannot quietly reintroduce a fitness leaderboard.
              </p>
            </div>

            <article className="card">
              <div className="card__head">
                <h3 className="card__t">Rejected field names</h3>
                <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                  <Cross /> throws
                </span>
              </div>
              <ul className="pills pills--ink">
                {CAPABILITY_FIELDS.map((f) => (
                  <li key={f} style={{ borderColor: 'var(--jm-critical)' }}>
                    {f}
                  </li>
                ))}
              </ul>
              <p className="card__note">
                Substring matching, so <code>weeklySteps</code> and <code>avgHeartRate</code> are
                caught as readily as <code>steps</code>. Asserted in continuous integration
                against every name on the list.
              </p>
            </article>

            <div className="dash" style={{ marginTop: 26 }}>
              <article className="card card--7">
                <div className="card__head">
                  <h3 className="card__t">Two teams, scored by the engine</h3>
                  <span className="card__tag">out of 100</span>
                </div>
                <CompareBars rows={COMPARISON} unit="" />
                <p className="card__note">
                  This is the whole design in one chart. The team with three genuinely
                  exceptional athletes scores {ATHLETIC_TEAM}. The team where everybody manages
                  two minutes most days scores {ORDINARY_TEAM}.
                </p>
              </article>

              <article className="card card--5" style={{ gap: 14 }}>
                <Stat
                  k="Contribution ceiling"
                  v={`${Math.round(CONTRIBUTION_CEILING * 100)}%`}
                  sub={`No individual may supply more than this share of a team's total. Our simulated superstar on a two-person team was capped at ${Math.round(SUPERSTAR.share * 100)}%.`}
                  tone="var(--jm-lime)"
                />
                <Stat
                  k="Median team reaches"
                  v={String(MEDIAN_TEAM.medianTeamReaches)}
                  sub={`Against a target of 60. A challenge a team of entirely median people cannot win is not shipped — ${MEDIAN_TEAM.winnable ? 'this one passes' : 'this one would be rejected'}.`}
                  tone="var(--jm-teal)"
                />
              </article>
            </div>
          </div>
        </section>

        {/* ---------------- leaderboards ---------------- */}
        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Leaderboards</p>
              <h2>Nobody is ever shown their position from the bottom.</h2>
              <p className="lede">
                Loss framing works, and it works by making people feel worse. Six rules govern
                every ranked surface in the product, and they are asserted as a build gate rather
                than left to a design review.
              </p>
            </div>

            <div className="compare">
              <article className="panel panel--always">
                <h3>
                  <Check /> Always true
                </h3>
                <ul>
                  {LEADERBOARD_RULES.map((r) => (
                    <li key={r}>
                      <Check />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="panel panel--never">
                <h3>
                  <Cross /> Withdrawal costs nothing
                </h3>
                <ul>
                  {AUTO_WITHDRAW_TRIGGERS.map((t) => (
                    <li key={t}>
                      <Cross />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <article className="card card--light" style={{ marginTop: 26 }}>
              <div className="card__head">
                <h3 className="card__t">What your absence costs your team</h3>
                <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>
                  measured
                </span>
              </div>
              <div className="card__big" style={{ color: 'var(--jm-excellent)' }}>
                {WITHDRAWAL_COST_TO_TEAM}
              </div>
              <p className="card__note">
                Nothing. Participation is measured against <em>active</em> members rather than the
                roster, so stepping out during illness, a flare-up, a bereavement or a new caring
                responsibility cannot drag your colleagues down. The engine withdraws you
                automatically on any of the triggers above — you do not have to ask, and nobody
                is told why.
              </p>
            </article>
          </div>
        </section>

        {/* ---------------- templates ---------------- */}
        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">The library</p>
              <h2>Eight challenges, and one of them has no losing team.</h2>
            </div>

            <div className="tiles">
              {CHALLENGE_TEMPLATES.map((c, i) => (
                <article
                  className="tile"
                  key={c.key}
                  style={{ ['--tone' as string]: `var(--c${(i % 6) + 1})` }}
                >
                  <div className="tile__n">{c.runs.toUpperCase()}</div>
                  <h3>{c.name}</h3>
                  <p>{c.forWhom}</p>
                  <ul>
                    <li>
                      <strong>Won by:</strong> {c.winCondition}
                    </li>
                  </ul>
                </article>
              ))}
            </div>

            <div className="ci" style={{ marginTop: 32 }}>
              <Tick />
              <span>
                Competition is opt-in everywhere, and there is no open leaderboard at all in
                Explorer or Teen Mode.
              </span>
            </div>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Run one across your team.</h2>
            <p>
              Eight weeks, privacy-protected participation reporting, and nobody gets an
              individual dashboard about anybody.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/contact">
                Talk to us
              </Link>
              <Link className="btn btn--ghost" href="/industries">
                See the boundaries
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
