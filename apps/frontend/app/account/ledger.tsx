'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';
import { Curve, WeightedBars } from './charts';

/**
 * The ledger.
 *
 * One scan tells you about one packet. Every scan, added up, is the only
 * honest answer to "how much salt do I actually eat?" — which is the
 * question every front-of-pack label invites and none of them can answer.
 *
 * Two things it must never do. It must not present itself as a complete
 * record of a person's diet, because it is a record of what they scanned.
 * And it must not divide a week's shopping by the one day it was scanned
 * on, which would say somebody eats six thousand calories a day.
 */

type Window = 'week' | 'month' | 'year' | 'all';

interface Rollup {
  key: string;
  label: string;
  total: number;
  perDay: number;
  pctOfReference: number;
  fromLabelPct: number;
  topContributors: { name: string; amount: number }[];
  /** How many scans in the window actually carried this nutrient. */
  measuredIn: number;
  ofEntries: number;
  /** Whether the daily figure rests on enough of them to mean anything. */
  dailyIsMeaningful: boolean;
}

interface Summary {
  window: Window;
  windowDays: number;
  daysRecorded: number;
  daysCovered: number;
  entries: number;
  totals: Rollup[];
  series: { day: string; kcal: number; saltG: number; saturatesG: number; sugarsG: number }[];
  buckets: { label: string; kcal: number; saltG: number; entries: number }[];
  coverage: string;
  retentionDays: number;
  recent: {
    id: string;
    at: string;
    kind: string;
    name: string;
    kcal: number | null;
    saltG: number | null;
    basis: string;
  }[];
}

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'Everything' },
];

const UNIT: Record<string, string> = { energyKcal: 'kcal' };

export function LedgerModule() {
  const [window, setWindow] = useState<Window>('month');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async (which: Window) => {
    setState('loading');
    try {
      const res = await fetch(`${apiBase()}/foodlens/log?window=${which}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      setSummary((await res.json()).data as Summary);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load(window);
  }, [window, load]);

  const clearAll = async (): Promise<void> => {
    setNote('clearing…');
    try {
      const res = await fetch(`${apiBase()}/foodlens/log`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      setNote(`cleared — ${json.data?.cleared ?? 0} scans removed`);
      setArmed(false);
      await load(window);
    } catch {
      setNote('could not clear it just now');
    }
  };

  const energy = summary?.totals.find((t) => t.key === 'energyKcal');
  const nutrients = (summary?.totals ?? []).filter((t) => t.key !== 'energyKcal');

  /*
   * The bars split in two, and the split is the honest part.
   *
   * A nutrient measured on nine scans out of ten gets a daily figure. One
   * measured on three does not — it gets its total, which is real, and a
   * sentence saying how much of the ledger it came from. Drawing both as
   * the same bar would put "38g of protein a day" next to "5.1g of salt a
   * day" as though the platform were equally sure of them, and the one it
   * is not sure of is the one somebody would act on.
   */
  const wellMeasured = nutrients.filter((n) => n.dailyIsMeaningful);
  const partial = nutrients.filter((n) => !n.dailyIsMeaningful && n.total > 0);
  const protein = summary?.totals.find((t) => t.key === 'proteinG');

  return (
    <section className="acct__module acct__module--food">
      <header>
        <div>
          <h3>Everything you have scanned</h3>
          <p className="acct__note">
            Saved as you go — there is nothing to press. Kept for three years, and you can
            clear the lot below.
          </p>
        </div>
      </header>

      <div className="ledger__filters" role="tablist" aria-label="Period">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            role="tab"
            aria-selected={window === w.key}
            className={`ledger__filter${window === w.key ? ' ledger__filter--on' : ''}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {state === 'loading' && <p className="acct__note">Adding it up…</p>}
      {state === 'error' && <p className="probe__err">The ledger could not be read just now.</p>}

      {state === 'ready' && summary && summary.entries === 0 && (
        <p className="acct__note">
          Nothing scanned in this period yet. Scan a barcode or photograph a meal and it lands
          here by itself.
        </p>
      )}

      {state === 'ready' && summary && summary.entries > 0 && (
        <>
          <div className="ledger__heads">
            <div className="ledger__head">
              <strong>{summary.entries}</strong>
              <span>scans</span>
            </div>
            <div className="ledger__head">
              <strong>{summary.daysCovered}</strong>
              <span>days of food</span>
            </div>
            <div className="ledger__head">
              <strong>{energy ? energy.perDay : 0}</strong>
              <span>kcal a day</span>
            </div>
            {protein?.dailyIsMeaningful && (
              <div className="ledger__head">
                <strong>{protein.perDay}</strong>
                <span>g protein a day</span>
              </div>
            )}
          </div>

          <h4 className="fl__h">A day, against the guideline</h4>
          <WeightedBars
            items={wellMeasured.map((n) => ({
              label: `${n.label} · ${n.perDay}g a day`,
              value: n.pctOfReference,
            }))}
            unit="%"
          />
          <p className="fl__note">
            Each bar is your daily figure as a percentage of the UK adult reference intake.
            100% is the guideline, not a limit you have broken — and a reference is not a
            target somebody set for you.
          </p>

          {partial.length > 0 && (
            <>
              <h4 className="fl__h">Counted, but not on enough of your scans</h4>
              <ul className="ledger__partial">
                {partial.map((n) => (
                  <li key={n.key}>
                    <strong>
                      {n.label} · {n.total}g in total
                    </strong>
                    <span>
                      From {n.measuredIn} of your {n.ofEntries} scans. Too few for a daily
                      figure to mean anything, so there is not one — the rest is missing rather
                      than zero.
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="fl__h">Day by day</h4>
          <Curve
            points={summary.series.map((p) => p.kcal)}
            label={`Energy scanned per day across the last ${summary.series.length} days`}
          />

          <h4 className="fl__h">What is carrying it</h4>
          <div className="ledger__carriers">
            {nutrients.map((n) => (
              <div key={n.key} className="ledger__carrier">
                <strong>{n.label}</strong>
                <em>
                  {n.total}
                  {UNIT[n.key] ?? 'g'} in total · {n.fromLabelPct}% read off a label
                </em>
                <ol>
                  {n.topContributors.slice(0, 3).map((c) => (
                    <li key={c.name}>
                      <span>{c.name}</span>
                      <b>
                        {c.amount}
                        {UNIT[n.key] ?? 'g'}
                      </b>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <h4 className="fl__h">The last few</h4>
          <ul className="ledger__recent">
            {summary.recent.slice(0, 8).map((e) => (
              <li key={e.id}>
                <span className={`ledger__kind ledger__kind--${e.kind}`}>{e.kind}</span>
                <span className="ledger__name">{e.name}</span>
                <span className="ledger__figs">
                  {e.kcal ? `${e.kcal} kcal` : '—'}
                  {e.saltG ? ` · ${e.saltG}g salt` : ''}
                </span>
                <span className="ledger__when">{e.at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>

          <p className="fl__note">{summary.coverage}</p>
        </>
      )}

      <div className="ledger__danger">
        {!armed ? (
          <button type="button" className="btn acct__ghostbtn" onClick={() => setArmed(true)}>
            Clear everything
          </button>
        ) : (
          <>
            <p className="acct__note">
              This removes every scan, permanently. There is no copy and no undo.
            </p>
            <div className="pwa__row">
              <button type="button" className="btn acct__dangerbtn" onClick={() => void clearAll()}>
                Yes, clear it all
              </button>
              <button type="button" className="btn acct__ghostbtn" onClick={() => setArmed(false)}>
                Keep it
              </button>
            </div>
          </>
        )}
        {note && <p className="acct__note">{note}</p>}
      </div>
    </section>
  );
}
