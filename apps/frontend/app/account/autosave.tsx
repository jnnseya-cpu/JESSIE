'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../api-base';

/**
 * Autosave.
 *
 * Nothing a member does should be lost by locking a phone. Every draft —
 * the measurements typed into BodyCommand, a trolley of scanned
 * products, the last analysis, a conversation with the coach — is saved
 * quietly and restored on the next visit.
 *
 * Quietly is the important word. There is no "save" button to forget, no
 * dialogue asking whether to keep anything, and no spinner: the state
 * word appears only when it is worth knowing, and the platform never
 * autosaves consent, a date of birth or anything clinical.
 */

const DEBOUNCE_MS = 900;
const MAX_INTERVAL_MS = 6_000;
/** How long a payload that has just failed is left alone. */
const RETRY_AFTER_MS = 30_000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Loads every saved draft once, so each module can restore itself.
 *
 * `restored` is the important half. A module that starts autosaving
 * before its restore has been applied will write its empty initial
 * values over the draft it was about to load — an autosave that deletes
 * your work, which is worse than none at all. So a module gates its
 * saving on `restored`, which only becomes true after the load has
 * finished and the module has had a render to apply it.
 */
export function useSavedState() {
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiBase()}/state`, { credentials: 'include' });
        if (res.ok && !cancelled) setState(((await res.json()).data ?? {}) as Record<string, unknown>);
      } catch {
        /* a draft that will not load is simply an empty form */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One frame after the load, every restore effect has run.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => setRestored(true), 0);
    return () => clearTimeout(id);
  }, [loaded, state]);

  return { loaded, state, restored };
}

/**
 * Saves a value whenever it settles. Returns the save state so a module
 * can show a quiet word, and nothing else.
 */
export function useAutosave(key: string, value: unknown, enabled = true): SaveState {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>('');
  const lastAttemptAt = useRef<number>(0);
  /** The payload that failed, and when — so it is not retried on a loop. */
  const failed = useRef<{ payload: string; at: number } | null>(null);

  const push = useCallback(
    async (serialised: string) => {
      setSaveState('saving');
      // An attempt clock, not a success clock. Recording it only on
      // success meant a failing save always looked overdue, which skipped
      // the debounce and retried immediately — and since callers pass a
      // fresh object each render, the re-render scheduled the next retry
      // straight away. A signed-out tab put fifty requests a minute into
      // the API, forever.
      lastAttemptAt.current = Date.now();
      try {
        const res = await fetch(`${apiBase()}/state/${encodeURIComponent(key)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: JSON.parse(serialised) }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSaved.current = serialised;
        failed.current = null;
        setSaveState('saved');
      } catch {
        // A failed save is not an error the member caused, and the next
        // change will try again, so it is stated once and quietly.
        failed.current = { payload: serialised, at: Date.now() };
        setSaveState('error');
      }
    },
    [key],
  );

  useEffect(() => {
    if (!enabled) return;
    let serialised: string;
    try {
      serialised = JSON.stringify(value ?? null);
    } catch {
      return;
    }
    if (serialised === lastSaved.current || serialised === 'null') return;

    // This exact draft has just failed — no session, no signal, or the
    // server said no. Leave it alone until it changes or the cooldown
    // passes; a retry loop helps nobody and costs everybody.
    const lastFailure = failed.current;
    if (
      lastFailure &&
      lastFailure.payload === serialised &&
      Date.now() - lastFailure.at < RETRY_AFTER_MS
    ) {
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    // Someone typing continuously still gets saved, rather than only
    // when they pause.
    const overdue = Date.now() - lastAttemptAt.current > MAX_INTERVAL_MS;
    timer.current = setTimeout(() => void push(serialised), overdue ? 0 : DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, enabled, push]);

  return saveState;
}

/** The quiet word. Absent until there is something worth saying. */
export function SaveMark({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className={`save save--${state}`}>
      {state === 'saving' ? 'saving…' : state === 'saved' ? 'saved' : 'not saved — will retry'}
    </span>
  );
}
