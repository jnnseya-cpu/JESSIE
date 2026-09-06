'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * When the member is usually free — the one signal that lets this
 * platform speak first.
 *
 * Everything else the engine wants is unobservable from a web page: a
 * browser cannot read motion, location, a calendar or a Do Not Disturb
 * switch, and the previous build fabricated all four. `declared_schedule`
 * is the exception. It is a first-class SignalClass, it needs no sensor
 * and no vendor, and it is true because the person typed it.
 *
 * Without this screen the scheduler has nobody to nudge, so this is not a
 * settings page — it is the product's only door out of being a button you
 * have to remember to press.
 */

interface Window {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 07:00 to 21:30 in half hours. Outside that the engine blocks anyway. */
const CHOICES = Array.from({ length: 30 }, (_, i) => 7 * 60 + i * 30);

function label(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function WindowsModule({ userId }: { userId: string }) {
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weekday, setWeekday] = useState(1);
  const [start, setStart] = useState(11 * 60);
  const [end, setEnd] = useState(11 * 60 + 30);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/nudge/windows/${encodeURIComponent(userId)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      setWindows(res.ok ? ((json.data?.windows ?? []) as Window[]) : []);
    } catch {
      setWindows([]);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: Window[]) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`${apiBase()}/nudge/windows/${encodeURIComponent(userId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ windows: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setWindows((json.data?.windows ?? []) as Window[]);
      if (json.data?.rejected) setNote(String(json.data.rejected));
    } catch (e) {
      setNote(`that did not save: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (end - start < 5) {
      setNote('a window has to be at least five minutes long');
      return;
    }
    const next = [...(windows ?? []), { weekday, startMinute: start, endMinute: end }];
    void save(next);
  };

  const remove = (i: number) => {
    void save((windows ?? []).filter((_, k) => k !== i));
  };

  return (
    <section className="acct__module acct__module--move">
      <h3>When are you usually free?</h3>
      <p className="acct__note">
        This is the only thing that lets Jess Move speak first. Inside a window it may offer one
        Snap; outside every window it stays quiet. It never guesses — no window, no notification.
      </p>

      {windows === null ? (
        <p className="acct__note">Loading…</p>
      ) : windows.length === 0 ? (
        <p className="acct__note">
          Nothing declared yet, so nothing will ever arrive unprompted. Add the times you could
          usually take two minutes.
        </p>
      ) : (
        <ul className="pills" style={{ marginBlock: 12 }}>
          {windows.map((w, i) => (
            <li key={`${w.weekday}-${w.startMinute}`}>
              {DAYS[w.weekday]} {label(w.startMinute)}–{label(w.endMinute)}{' '}
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={busy}
                aria-label={`Remove ${DAYS[w.weekday]} ${label(w.startMinute)} to ${label(w.endMinute)}`}
                style={{
                  border: 0,
                  background: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '0 0 0 6px',
                  font: 'inherit',
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field__row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <label className="field">
          <span className="field__label">Day</span>
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">From</span>
          <select value={start} onChange={(e) => setStart(Number(e.target.value))}>
            {CHOICES.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Until</span>
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))}>
            {CHOICES.filter((m) => m > start).map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--primary" type="button" onClick={add} disabled={busy}>
          Add window
        </button>
      </div>

      {note && <p className="probe__err">{note}</p>}

      <p className="acct__note">
        Notifications also need to be switched on above. Quiet hours, the sleep window and your
        daily ceiling still apply inside a window — a declared time is permission to consider you,
        not permission to interrupt you.
      </p>
    </section>
  );
}
