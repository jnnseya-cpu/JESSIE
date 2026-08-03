'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';
import { Curve } from './charts';
import { ConditionCards, ConditionsPicker, type ConditionCard } from './conditions';

/**
 * What everything, taken together, is allowed to say.
 *
 * FoodLens knows what was scanned; BodyCommand knows the readings that
 * were given; Activity knows which days had movement in them. Separately
 * each is a number on a screen. Together they are the only picture a
 * person actually has of their own risk.
 *
 * How it speaks matters more than what it says. Every card names a
 * *population-level association*, shows the figure it was built from, and
 * ends with the single thing that moves it — a risk with no lever attached
 * is just fear, and fear is not a health intervention. Under 18 the whole
 * section refuses, and says why.
 */

interface Risk {
  factor: string;
  level: 'watch' | 'raised' | 'high';
  evidence: string;
  associatedWith: string[];
  action: string;
  from: 'foodlens' | 'bodycommand' | 'activity';
}

interface Insight {
  available: boolean;
  why?: string;
  risks: Risk[];
  bmi: {
    bmi: number | null;
    band: 'under' | 'healthy' | 'over' | 'well_over' | null;
    healthyRangeKg: { min: number; max: number } | null;
    gapKg: number | null;
    weeksAtSafeRate: number | null;
    safeRateKgPerWeek: number | null;
    says: string;
    steps: string[];
  };
  plan: {
    planned: boolean;
    why?: string;
    gapKg: number;
    targetKg: number;
    weeklyLossKg: number;
    dailyDeficitKcal: number;
    levers: { what: string; kcalPerDay: number; because: string; from: string }[];
    leverTotalKcal: number;
    coveragePct: number;
    milestones: { label: string; weightKg: number; weeks: number; says: string }[];
    projection: { week: number; weightKg: number }[];
    safety: string[];
  };
  conditions: (ConditionCard & { noticed: string[] })[];
  suppressed: string[];
  notMedicalAdvice?: string;
  builtFrom: string[];
  limits: string[];
  seeSomeone: string[];
}

const LEVEL_WORD: Record<Risk['level'], string> = {
  high: 'Worth acting on',
  raised: 'Raised',
  watch: 'Worth watching',
};

const SOURCE_WORD: Record<Risk['from'], string> = {
  foodlens: 'from what you scanned',
  bodycommand: 'from your own readings',
  activity: 'from your movement',
};

export function InsightModule({
  heightCm,
  weightKg,
  kgPerWeek,
}: {
  heightCm?: number | null;
  weightKg?: number | null;
  kgPerWeek?: number | null;
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  /**
   * Reloading must not empty the screen.
   *
   * Declaring a condition asks this section to read itself again, and the
   * first version of that dropped back to "loading" — which unmounted the
   * picker mid-tick, threw away the scroll position, and collapsed the
   * section somebody was in the middle of using. So only the *first* load
   * shows a placeholder. After that the previous picture stays on screen
   * until the new one is ready to replace it.
   */
  const load = useCallback(async () => {
    setState((was) => (was === 'ready' ? 'ready' : 'loading'));
    try {
      const res = await fetch(`${apiBase()}/insight`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(heightCm ? { heightCm } : {}),
          ...(weightKg ? { weightKg } : {}),
          ...(typeof kgPerWeek === 'number' ? { kgPerWeek } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setInsight((await res.json()).data as Insight);
      setState('ready');
    } catch {
      // A refresh that failed leaves the picture that was already there.
      // Replacing a working page with an error because a background
      // reload timed out is how a section people were reading disappears.
      setState((was) => (was === 'ready' ? 'ready' : 'error'));
    }
  }, [heightCm, weightKg, kgPerWeek]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stable, so declaring a condition asks this section to re-read itself
  // once rather than handing the picker a new callback on every render.
  const reread = useCallback(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className="acct__module acct__module--body">
        <h3>What this all adds up to</h3>
        <p className="acct__note">Putting the picture together…</p>
      </section>
    );
  }

  if (state === 'error' || !insight) {
    return (
      <section className="acct__module acct__module--body">
        <h3>What this all adds up to</h3>
        <p className="probe__err">This could not be worked out just now.</p>
      </section>
    );
  }

  if (!insight.available) {
    return (
      <section className="acct__module acct__module--body">
        <h3>What this all adds up to</h3>
        <p className="tdv__line tdv__line--guard">{insight.why}</p>
      </section>
    );
  }

  const { bmi, plan } = insight;

  return (
    <section className="acct__module acct__module--body">
      <header>
        <div>
          <h3>What this all adds up to</h3>
          <p className="acct__note">
            Everything this platform holds about you, read together. None of it is a diagnosis.
          </p>
        </div>
      </header>

      {/*
        Before the warnings, not after them. What somebody lives with
        decides which of the warnings below are even true for them, so
        asking underneath would be asking too late.
      */}
      <ConditionsPicker onChange={reread} />

      {/* ---- the warnings ---- */}
      {insight.risks.length === 0 ? (
        <p className="acct__note">
          Nothing in what you have recorded is out of step with the guidelines. Keep scanning
          and this stays honest as things change.
        </p>
      ) : (
        <div className="risk__list">
          {insight.risks.map((risk) => (
            <article key={risk.factor} className={`risk risk--${risk.level}`}>
              <header className="risk__head">
                <h4>{risk.factor}</h4>
                <span className={`risk__level risk__level--${risk.level}`}>
                  {LEVEL_WORD[risk.level]}
                </span>
              </header>
              <p className="risk__evidence">
                {risk.evidence} <em>{SOURCE_WORD[risk.from]}</em>
              </p>
              <p className="risk__assoc">
                Across populations this is associated with{' '}
                <strong>{risk.associatedWith.join(', ')}</strong>. That is an association, not
                something you have.
              </p>
              <p className="risk__action">{risk.action}</p>
            </article>
          ))}
        </div>
      )}

      {/*
        And what the declared conditions changed, including the general
        cards they took off the screen. A page that quietly drops a warning
        is worse than one that never had it.
      */}
      <ConditionCards
        findings={insight.conditions ?? []}
        suppressed={insight.suppressed ?? []}
        notice={insight.notMedicalAdvice}
      />

      {/* ---- the route to a green BMI ---- */}
      <h4 className="fl__h">Getting to a green BMI</h4>
      {bmi.bmi === null ? (
        <p className="acct__note">{bmi.says}</p>
      ) : (
        <>
          <div className={`bmi bmi--${bmi.band}`}>
            <div className="bmi__figure">
              <strong>{bmi.bmi}</strong>
              <span>BMI</span>
            </div>
            <div className="bmi__scale" role="img" aria-label={`BMI ${bmi.bmi}`}>
              <span className="bmi__band bmi__band--under">under</span>
              <span className="bmi__band bmi__band--healthy">healthy</span>
              <span className="bmi__band bmi__band--over">over</span>
              <span className="bmi__band bmi__band--well_over">well over</span>
              <span
                className="bmi__marker"
                style={{ left: `${Math.max(2, Math.min(98, ((bmi.bmi - 14) / 22) * 100))}%` }}
              />
            </div>
          </div>
          <p className="risk__evidence">{bmi.says}</p>

          {bmi.gapKg !== null && bmi.weeksAtSafeRate !== null && (
            <div className="bmi__path">
              <div className="bmi__step">
                <strong>{Math.abs(bmi.gapKg)}kg</strong>
                <span>to the healthy range</span>
              </div>
              <div className="bmi__step">
                <strong>{bmi.safeRateKgPerWeek}kg</strong>
                <span>a week, sustainably</span>
              </div>
              <div className="bmi__step">
                <strong>{bmi.weeksAtSafeRate}</strong>
                <span>weeks at that rate</span>
              </div>
            </div>
          )}

          <ol className="risk__steps">
            {bmi.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      )}

      {/* ---- and how the gap actually gets closed ---- */}
      {plan.planned ? (
        <>
          <h4 className="fl__h">Closing the {Math.abs(plan.gapKg)}kg</h4>

          <div className="plan__line">
            <Curve
              points={plan.projection.map((p) => p.weightKg)}
              label={`Your weight from ${plan.projection[0]?.weightKg}kg down to ${plan.targetKg}kg over ${plan.projection[plan.projection.length - 1]?.week} weeks`}
            />
            <div className="plan__lineends">
              <span>{plan.projection[0]?.weightKg}kg today</span>
              <span>
                {plan.targetKg}kg in {plan.projection[plan.projection.length - 1]?.week} weeks
              </span>
            </div>
          </div>

          <ol className="plan__milestones">
            {plan.milestones.map((m) => (
              <li key={m.label}>
                <div className="plan__mhead">
                  <strong>{m.label}</strong>
                  <span>
                    {m.weightKg}kg · week {m.weeks}
                  </span>
                </div>
                <p>{m.says}</p>
              </li>
            ))}
          </ol>

          <div className="plan__deficit">
            <strong>{plan.dailyDeficitKcal} kcal a day</strong>
            <span>
              is the gap between what goes in and what gets used that {plan.weeklyLossKg}kg a
              week needs. Here is where yours could come from.
            </span>
          </div>

          <ul className="plan__levers">
            {plan.levers.map((lever) => (
              <li key={lever.what} className={`plan__lever plan__lever--${lever.from}`}>
                <div className="plan__lhead">
                  <strong>{lever.what}</strong>
                  {lever.kcalPerDay > 0 && <span>{lever.kcalPerDay} kcal/day</span>}
                </div>
                <p>{lever.because}</p>
              </li>
            ))}
          </ul>

          {plan.leverTotalKcal > 0 && (
            <div className="plan__coverage">
              <span className="plan__ctrack">
                <span
                  className="plan__cfill"
                  style={{ width: `${Math.min(100, plan.coveragePct)}%` }}
                />
              </span>
              <p>
                Those add up to <strong>{plan.leverTotalKcal} kcal a day</strong> —{' '}
                {plan.coveragePct}% of what {plan.weeklyLossKg}kg a week needs.{' '}
                {plan.coveragePct >= 120
                  ? 'You do not need all of them. Pick the ones you would actually keep doing — the rest is spare.'
                  : plan.coveragePct >= 100
                    ? 'That is the whole gap, from things already in your own ledger.'
                    : 'Scanning more of your week will find the rest.'}
              </p>
            </div>
          )}

          <ul className="risk__limits">
            {plan.safety.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : (
        plan.why && <p className="acct__note">{plan.why}</p>
      )}

      {/* ---- what it was built from, and what it cannot see ---- */}
      {insight.builtFrom.length > 0 && (
        <>
          <h4 className="fl__h">Built from</h4>
          <ul className="fl__checks">
            {insight.builtFrom.map((source) => (
              <li key={source} className="fl__check fl__check--ok">
                <span>✓</span>
                <div>
                  <strong>{source}</strong>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="fl__h">What this cannot tell you</h4>
      <ul className="risk__limits">
        {insight.limits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>

      <h4 className="fl__h">When to see somebody instead</h4>
      <ul className="risk__limits risk__limits--urgent">
        {insight.seeSomeone.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
