'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deriveFreeWindows } from '@jessmove/shared';
import { apiBase } from '../api-base';
import { calendarWindows, nativeCapabilities } from '../native';

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
  const [suggested, setSuggested] = useState<Window[] | null>(null);
  const [url, setUrl] = useState('');
  /*
   * Whether this is the installed app. Read once on mount rather than at
   * render time, because the shell injects its host object before the
   * first paint and reading it during SSR would answer for the server.
   */
  const [canReadDevice, setCanReadDevice] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
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
    setCanReadDevice(nativeCapabilities()?.calendar === true);
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

  /*
   * Importing a calendar without sending it anywhere.
   *
   * `deriveFreeWindows` runs here, in the browser, on text the member
   * already has. What is produced is a list of weekdays and minutes; the
   * titles, attendees and locations are never read by the parser and
   * never leave the device. That is what makes the sentence on the
   * landing page true rather than aspirational, and it is why this is a
   * file and a URL rather than an OAuth button.
   */
  const importIcs = async (text: string) => {
    setBusy(true);
    setNote(null);
    try {
      const derived = deriveFreeWindows(text, {
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      });
      if (derived.length === 0) {
        setNote('nothing free was found in the next fortnight — try adding a window by hand');
        return;
      }
      setSuggested(derived);
    } catch {
      setNote('that did not read as a calendar file');
    } finally {
      setBusy(false);
    }
  };

  /*
   * The device calendar, in the installed app.
   *
   * Reads through the same derivation the .ics import uses, so "free"
   * means one thing either way, and the events cross the bridge in a
   * shape with no field for a title. In a browser this button is not
   * rendered at all rather than rendered and disabled — an offer that
   * cannot be taken is worse than no offer.
   */
  const importFromDevice = async () => {
    setBusy(true);
    setNote(null);
    try {
      const derived = await calendarWindows();
      if (!derived || derived.length === 0) {
        setNote('nothing free was found in the next fortnight — try adding a window by hand');
        return;
      }
      setSuggested(derived);
    } catch {
      setNote('your calendar could not be read — check the permission in your phone settings');
    } finally {
      setBusy(false);
    }
  };

  const importFromUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      /*
       * Fetched by the browser, not by us — the feed never touches a
       * server of ours. Many providers (Google among them) send no
       * CORS header on their secret .ics URL, which the browser refuses
       * and we cannot work around without proxying it, and proxying it
       * would be exactly the thing this design exists to avoid. So the
       * failure is explained rather than hidden.
       */
      const res = await fetch(url.trim());
      if (!res.ok) throw new Error(String(res.status));
      await importIcs(await res.text());
    } catch {
      setBusy(false);
      setNote(
        'your calendar provider would not let the browser read that link directly. Export the .ics file and choose it below — it is read on this device either way.',
      );
    }
  };

  return (
    <section className="acct__module acct__module--move acct__module--schedule">
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

      {/* ---------------- import from a calendar ---------------- */}
      <h4 style={{ marginTop: 26, marginBottom: 6 }}>Or read it from your calendar</h4>
      <p className="acct__note">
        Your calendar is read <strong>on this device</strong>. Google, Outlook, Apple and anything
        else that publishes an .ics feed will do. What gets sent is a list of weekdays and times —
        the titles, the people and the places are never read, so there is no way for them to leave
        this browser.
      </p>

      {canReadDevice && (
        <p style={{ margin: '0 0 14px' }}>
          <button className="btn btn--primary" type="button" onClick={importFromDevice} disabled={busy}>
            Read this device&rsquo;s calendar
          </button>
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <span className="field__label">Secret .ics address</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/basic.ics"
            autoComplete="off"
          />
        </label>
        <button className="btn btn--ghost" type="button" onClick={importFromUrl} disabled={busy}>
          Read it
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          Choose an .ics file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await importIcs(await file.text());
            e.target.value = '';
          }}
        />
      </div>

      {suggested && (
        <div style={{ marginTop: 16 }}>
          <p className="acct__note">
            {suggested.length} window{suggested.length === 1 ? '' : 's'} where you were free every
            time over the next fortnight. Nothing is saved until you say so.
          </p>
          <ul className="pills" style={{ marginBlock: 10 }}>
            {suggested.map((w) => (
              <li key={`s-${w.weekday}-${w.startMinute}`}>
                {DAYS[w.weekday]} {label(w.startMinute)}–{label(w.endMinute)}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn--primary"
              type="button"
              disabled={busy}
              onClick={() => {
                const next = suggested;
                setSuggested(null);
                void save(next);
              }}
            >
              Use these
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={busy}
              onClick={() => setSuggested(null)}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <p className="acct__note">
        Notifications also need to be switched on above. Quiet hours, the sleep window and your
        daily ceiling still apply inside a window — a declared time is permission to consider you,
        not permission to interrupt you.
      </p>
    </section>
  );
}
