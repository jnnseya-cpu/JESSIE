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

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Loads every saved draft once, so each module can restore itself. */
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

  return { loaded, state };
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

  const push = useCallback(
    async (serialised: string) => {
      setSaveState('saving');
      try {
        const res = await fetch(`${apiBase()}/state/${encodeURIComponent(key)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value: JSON.parse(serialised) }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSaved.current = serialised;
        lastAttemptAt.current = Date.now();
        setSaveState('saved');
      } catch {
        // A failed save is not an error the member caused, and the next
        // change will try again, so it is stated once and quietly.
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
