'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * Strength and balance, on the screen.
 *
 * The programme is aimed at the Independence and Vitality modes, which
 * means every layout decision here is different from the rest of the
 * console: larger type, one thing at a time, no dense grid, and buttons
 * that are hard to miss with an unsteady hand.
 *
 * The two things this screen must never do, both of which are easy to do
 * by accident:
 *
 *  * **Present a good result as safety.** A real falls assessment covers
 *    medication, lying and standing blood pressure, vision, feet and the
 *    home. Four of those five are invisible here, and a reassuring number
 *    is the one output that could contribute to a fall. So there is no
 *    score anywhere on this page, and the sentence saying why sits above
 *    the results rather than beneath them.
 *  * **Ask somebody to do a physical test before telling them how to do
 *    it safely.** The safety instructions come before the method, every
 *    time, and the input for a check does not appear until they have been
 *    read past.
 */

interface Check {
  id: string;
  name: string;
  how: string[];
  safety: string[];
  unit: 'repetitions' | 'seconds';
}

interface Level {
  level: string;
  label: string;
  what: string;
  sessionsPerWeek: number;
}

interface StartingPoint {
  level: string;
  sessionsPerWeek: number;
  says: string;
  seeSomeone: string[];
  referFirst: boolean;
  notARiskScore: string;
}

interface Catalogue {
  checks: Check[];
  levels: Level[];
  recheckWeeks: number;
  notARiskScore: string;
  neverDoes: string[];
  whyItMatters: string;
}

interface History {
  latest: { at: string; level: string } | null;
  start: StartingPoint;
  recheckDueAt: string | null;
  recheckWeeks: number;
  why: string;
  history: { at: string; level: string; chairStandReps: number | null }[];
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function StrengthModule() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cat, hist] = await Promise.all([
        fetch(`${apiBase()}/falls/checks`, { credentials: 'include' }),
        fetch(`${apiBase()}/falls/history`, { credentials: 'include' }),
      ]);
      if (!cat.ok) throw new Error(String(cat.status));
      setCatalogue((await cat.json()).data as Catalogue);
      if (hist.ok) setHistory((await hist.json()).data as History);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <section className="acct__module acct__module--body">
        <h3>Strength and balance</h3>
        <p className="acct__note">Loading…</p>
      </section>
    );
  }
  if (state === 'error' || !catalogue) {
    return (
      <section className="acct__module acct__module--body">
        <h3>Strength and balance</h3>
        <p className="probe__err">This could not be loaded just now.</p>
      </section>
    );
  }

  const start = history?.start ?? null;
  const done = Boolean(history?.latest);

  return (
    <section className="acct__module acct__module--body str">
      <header>
        <div>
          <h3>Strength and balance</h3>
          <p className="acct__note">{catalogue.whyItMatters}</p>
        </div>
      </header>

      {/*
        The refusal, above the results rather than beneath them. Somebody
        who reads a level first and the caveat second has already decided
        what the level means.
      */}
      <p className="str__notascore">{catalogue.notARiskScore}</p>

      {start && done && (
        <>
          <div className={`str__level str__level--${start.level}`}>
            <span className="str__levellab">Where to start</span>
            <strong>{catalogue.levels.find((l) => l.level === start.level)?.label ?? start.level}</strong>
            <p>{start.says}</p>
            <p className="str__sessions">
              <strong>{start.sessionsPerWeek} sessions a week.</strong> That is what the evidence
              rests on.
            </p>
          </div>

          {start.seeSomeone.length > 0 && (
            <div className="str__see">
              <span className="str__seelab">
                {start.referFirst ? 'Please see somebody first' : 'Worth mentioning'}
              </span>
              <ul>
                {start.seeSomeone.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {history?.recheckDueAt && (
            <p className="acct__note">
              Last checked {DATE.format(new Date(history.latest!.at))}. Next check due{' '}
              {DATE.format(new Date(history.recheckDueAt))} — {history.why}
            </p>
          )}
        </>
      )}

      <button type="button" className="btn btn--primary str__start" onClick={() => setOpen(!open)}>
        {open ? 'Close the checks' : done ? 'Do the checks again' : 'Do the three checks'}
      </button>

      {open && <Checks checks={catalogue.checks} onDone={() => { setOpen(false); void load(); }} />}

      <h4 className="fl__h">What this will never do</h4>
      <ul className="risk__limits">
        {catalogue.neverDoes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/* ── the checks themselves ─────────────────────────────────────────── */

function Checks({ checks, onDone }: { checks: Check[]; onDone: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [fallen, setFallen] = useState(false);
  const [afraid, setAfraid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  /** Which checks the person has read the safety notes for. */
  const [readSafety, setReadSafety] = useState<Record<string, boolean>>({});

  const save = async () => {
    setBusy(true);
    setSaid('');
    try {
      const body: Record<string, unknown> = {
        fallenInLastYear: fallen,
        afraidOfFalling: afraid,
      };
      if (values.chair_stand) body.chairStandReps = Number(values.chair_stand);
      if (values.balance_stages) body.balanceSeconds = Number(values.balance_stages);
      if (values.up_and_go) body.upAndGoSeconds = Number(values.up_and_go);

      const res = await fetch(`${apiBase()}/falls/checks`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaid((await res.json()).message ?? 'That did not save.');
        return;
      }
      onDone();
    } catch {
      setSaid('That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="str__checks">
      {checks.map((check) => (
        <article key={check.id} className="str__check">
          <h4>{check.name}</h4>

          {/* Safety before method, every time. */}
          <div className="str__safety">
            <span>Before you start</span>
            <ul>
              {check.safety.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <ol className="str__how">
            {check.how.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>

          {readSafety[check.id] ? (
            <label className="field str__field">
              <span>
                {check.unit === 'repetitions' ? 'How many did you manage?' : 'How many seconds?'}
              </span>
              <input
                inputMode="decimal"
                value={values[check.id] ?? ''}
                onChange={(e) => setValues({ ...values, [check.id]: e.target.value })}
                placeholder={check.unit === 'repetitions' ? 'e.g. 11' : 'e.g. 24'}
              />
              <em className="str__skip">
                Leave it empty if you did not feel safe attempting it. That is a real answer, not a
                missing one.
              </em>
            </label>
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setReadSafety({ ...readSafety, [check.id]: true })}
            >
              I have read that — let me record it
            </button>
          )}
        </article>
      ))}

      <article className="str__check">
        <h4>Two questions that matter more than the numbers</h4>
        <label className="str__ask">
          <input type="checkbox" checked={fallen} onChange={(e) => setFallen(e.target.checked)} />
          <span>I have had a fall in the last twelve months.</span>
        </label>
        <label className="str__ask">
          <input type="checkbox" checked={afraid} onChange={(e) => setAfraid(e.target.checked)} />
          <span>I worry about falling.</span>
        </label>
      </article>

      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Record these and show me where to start'}
      </button>
      {said && <p className="probe__err">{said}</p>}
    </div>
  );
}
