'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * The funnel, on a screen.
 *
 * It already existed as an admin JSON endpoint, which is the same as not
 * existing: nobody curls a URL every morning for a fortnight. The point of
 * measuring the funnel is that somebody looks at it often enough to notice
 * a change, and that only happens if it is somewhere they already are.
 *
 * Two decisions in the layout, both about not fooling ourselves:
 *
 *  * **The reading comes first, above the numbers.** A table of five
 *    counts does not tell anybody what to do at eleven at night, and the
 *    difference between "nobody came" and "everybody came and left" is
 *    the difference between two months of distribution work and two hours
 *    of fixing one screen.
 *  * **Bars are drawn against the top of the funnel, never against the
 *    previous step.** Step-to-step rates look healthy right up until the
 *    total is four people, which is exactly the range this will sit in
 *    for a while.
 */

interface Step {
  step: string;
  means: string;
  people: number;
  events: number;
  pctOfLanded: number | null;
}

interface Summary {
  available: boolean;
  why?: string;
  windowDays?: number;
  steps?: Step[];
  entryPages?: { path: string; people: number }[];
  sources?: { referrer: string; people: number }[];
  reading?: string;
  privacy?: string;
}

interface Route {
  code: string;
  label: string;
  kind: string;
  active: boolean;
  arrived: number;
  opened: number;
  registered: number;
}

const STEP_LABEL: Record<string, string> = {
  landed: 'Landed',
  viewed_ask: 'Saw the ask',
  opened: 'Opened the account',
  started: 'Started registering',
  registered: 'Registered',
};

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export function FunnelModule() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const [summary, report] = await Promise.all([
        fetch(`${apiBase()}/funnel?days=${days}`, { credentials: 'include' }),
        fetch(`${apiBase()}/referrers/admin/report?days=${days}`, { credentials: 'include' }),
      ]);
      if (!summary.ok) throw new Error(String(summary.status));
      setData((await summary.json()).data as Summary);
      if (report.ok) setRoutes(((await report.json()).data.referrers ?? []) as Route[]);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className="acct__module acct__module--admin">
        <h3>Where people are lost</h3>
        <p className="acct__note">Counting…</p>
      </section>
    );
  }
  if (state === 'error' || !data) {
    return (
      <section className="acct__module acct__module--admin">
        <h3>Where people are lost</h3>
        <p className="probe__err">The funnel could not be read.</p>
      </section>
    );
  }

  const steps = data.steps ?? [];
  const top = steps[0]?.people ?? 0;

  return (
    <section className="acct__module acct__module--admin fnl">
      <header>
        <div>
          <h3>Where people are lost</h3>
          <p className="acct__note">
            Distinct people, not page views. Registration is counted on the server.
          </p>
        </div>
      </header>

      <div className="ledger__filters" role="tablist" aria-label="Period">
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            role="tab"
            aria-selected={days === w.days}
            className={`ledger__filter${days === w.days ? ' ledger__filter--on' : ''}`}
            onClick={() => setDays(w.days)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {!data.available ? (
        <p className="probe__err">{data.why}</p>
      ) : (
        <>
          {/* The sentence, above the numbers. */}
          {data.reading && <p className="fnl__reading">{data.reading}</p>}

          <h4 className="fl__h">The five steps</h4>
          <ol className="fnl__steps">
            {steps.map((s) => {
              const width = top > 0 ? Math.max(2, Math.round((s.people / top) * 100)) : 0;
              return (
                <li key={s.step}>
                  <div className="fnl__row">
                    <span className="fnl__name">{STEP_LABEL[s.step] ?? s.step}</span>
                    <strong className="fnl__count">{s.people}</strong>
                    {s.pctOfLanded !== null && <em className="fnl__pct">{s.pctOfLanded}%</em>}
                  </div>
                  <div className="fnl__bar" aria-hidden="true">
                    <span style={{ width: `${width}%` }} />
                  </div>
                  <span className="fnl__means">{s.means}</span>
                </li>
              );
            })}
          </ol>

          {(data.entryPages ?? []).length > 0 && (
            <>
              <h4 className="fl__h">Where they arrive</h4>
              <ul className="fnl__list">
                {(data.entryPages ?? []).map((p) => (
                  <li key={p.path}>
                    <span>{p.path}</span>
                    <strong>{p.people}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}

          {(data.sources ?? []).length > 0 && (
            <>
              <h4 className="fl__h">How they got here</h4>
              <ul className="fnl__list">
                {(data.sources ?? []).map((s) => (
                  <li key={s.referrer}>
                    <span>{s.referrer}</span>
                    <strong>{s.people}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}

          {routes && routes.length > 0 && (
            <>
              <h4 className="fl__h">The organisations passing it on</h4>
              <ul className="fnl__routes">
                {routes.map((r) => (
                  <li key={r.code}>
                    <div>
                      <strong>{r.label}</strong>
                      <em>
                        /join/{r.code} · {r.kind.replace(/_/g, ' ')}
                        {r.active ? '' : ' · retired'}
                      </em>
                    </div>
                    <span className="fnl__routenums">
                      {r.arrived} arrived · {r.opened} opened · <b>{r.registered} joined</b>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="acct__note">
                A route bringing people who never open the account page is reaching the wrong
                people, or a leaflet promised something else. A route bringing few people who
                nearly all register is worth another morning.
              </p>
            </>
          )}

          {data.privacy && <p className="acct__note fnl__privacy">{data.privacy}</p>}
        </>
      )}
    </section>
  );
}
