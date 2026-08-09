'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../api-base';
import { SaveMark, type SaveState } from './autosave';

/**
 * Telling the platform what you live with, and taking it back.
 *
 * Until this exists, every number on the page is read the same way for
 * everybody — and for some people that reading is not merely unhelpful, it
 * is the opposite of what their clinical team told them. Somebody with
 * exocrine pancreatic insufficiency being warned about fat is the clearest
 * case: the current guidance is not to restrict it, and the warning is the
 * out-of-date advice that causes the weight loss it then congratulates.
 *
 * How this is asked for matters as much as what it changes:
 *
 *  * The whole catalogue is readable **before** anything is declared, so
 *    nobody has to hand over a diagnosis to find out what would be done
 *    with it.
 *  * It is a list of checkboxes and nothing else. No severity, no dates,
 *    no medication, no free text — a box for "anything else?" would turn
 *    a preference into a medical record, and this is not one.
 *  * Removing it is one button, and the row is deleted rather than
 *    emptied.
 *  * The sentence saying this is not medical advice is not a footnote in
 *    grey. It sits at the top, in full, because it is the accurate
 *    description of the thing rather than a disclaimer bolted on to make
 *    the rest safe to say.
 *  * It saves itself, like everything else here. A save button on a
 *    checkbox is a way to lose what somebody just told you — they tick,
 *    they read the guidance that appears, they close the phone. But it
 *    saves to its own endpoint, never through the ordinary draft
 *    autosave, which refuses anything clinical outright and should
 *    continue to.
 */

/** Debounced the same way the rest of the platform saves: quietly. */
const DEBOUNCE_MS = 700;

export interface ConditionCard {
  id: string;
  label: string;
  group: 'digestive' | 'metabolic' | 'heart' | 'kidney' | 'bones' | 'medication' | 'other';
  inShort: string;
  watches: string[];
  helps: string[];
  careful: string[];
  clinicianOnly: string[];
}

const GROUP_WORD: Record<ConditionCard['group'], string> = {
  medication: 'Medication you are on',
  digestive: 'Digestion and gut',
  metabolic: 'Blood sugar and metabolism',
  heart: 'Heart and circulation',
  kidney: 'Kidneys',
  bones: 'Bones',
  other: 'Other',
};

const GROUP_ORDER: ConditionCard['group'][] = [
  // Medication first: it changes the reading more than anything else here,
  // and somebody on one is the likeliest person to be looking.
  'medication',
  'digestive',
  'metabolic',
  'heart',
  'kidney',
  'bones',
  'other',
];

export function ConditionsPicker({ onChange }: { onChange?: (ids: string[]) => void }) {
  const [catalogue, setCatalogue] = useState<ConditionCard[]>([]);
  const [notice, setNotice] = useState('');
  const [privacy, setPrivacy] = useState<string[]>([]);
  const [max, setMax] = useState(10);
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [said, setSaid] = useState('');

  // Nothing may be written until the load has finished. A picker that
  // starts autosaving before its restore has landed writes an empty list
  // over what somebody already told us — an autosave that deletes, which
  // is worse than none. The rest of the platform gates on this too.
  const restored = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** What the server is known to hold, so the same list is never re-sent. */
  const stored = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cat, mine] = await Promise.all([
        fetch(`${apiBase()}/insight/conditions/catalogue`, { credentials: 'include' }),
        fetch(`${apiBase()}/insight/conditions`, { credentials: 'include' }),
      ]);
      if (!cat.ok) throw new Error(String(cat.status));
      const catBody = (await cat.json()).data as {
        conditions: ConditionCard[];
        max?: number;
        notMedicalAdvice: string;
        privacy?: string[];
      };
      setCatalogue(catBody.conditions);
      setNotice(catBody.notMedicalAdvice);
      setPrivacy(catBody.privacy ?? []);
      setMax(catBody.max ?? 10);
      if (mine.ok) {
        const held = ((await mine.json()).data as { conditions: string[] }).conditions ?? [];
        setChosen(held);
        stored.current = held.slice().sort().join(',');
        // Somebody who has already told us should find the section open —
        // it is the part of the page that changed everything else on it.
        if (held.length > 0) setOpen(true);
      } else {
        stored.current = '';
      }
      setLoading(false);
      restored.current = true;
    } catch {
      setLoading(false);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The saver, held in a ref rather than in the effect's dependencies.
   *
   * `onChange` asks the section above to read itself again, and a parent
   * that passes an inline arrow — as any parent reasonably would — hands
   * this component a new function on every render. With that function in
   * the dependency array the effect re-fires on every render, saves again,
   * which re-renders the parent, which re-fires the effect: a save loop
   * that hammers the API for as long as the page is open. The ref keeps
   * the latest callback without making it a reason to save.
   */
  const push = useRef<(ids: string[]) => Promise<void>>(async () => {});
  push.current = async (ids: string[]) => {
    const signature = ids.slice().sort().join(',');
    // Nothing changed, so there is nothing to write.
    if (stored.current === signature) return;
    setSaveState('saving');
    try {
      const res = await fetch(`${apiBase()}/insight/conditions`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conditions: ids }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const held = ((await res.json()).data as { conditions: string[] }).conditions ?? [];
      stored.current = held.slice().sort().join(',');
      setSaveState('saved');
      setSaid(
        held.length === 0
          ? 'Nothing is held about a condition, and the page below reads the general guidance again.'
          : 'Everything below is now read against this.',
      );
      onChange?.(held);
    } catch {
      // Never silently. Somebody who believes this saved will then read
      // a page written for people who do not have their condition.
      setSaveState('error');
    }
  };

  // Saved on the tick, debounced, exactly like every other draft here.
  const signature = chosen.slice().sort().join(',');
  useEffect(() => {
    if (!restored.current) return;
    if (stored.current === signature) return;
    if (timer.current) clearTimeout(timer.current);
    const ids = signature ? signature.split(',') : [];
    timer.current = setTimeout(() => void push.current(ids), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [signature]);

  const atLimit = chosen.length >= max;

  const toggle = (id: string) => {
    setChosen((held) => {
      if (held.includes(id)) return held.filter((x) => x !== id);
      if (held.length >= max) return held;
      return [...held, id];
    });
  };

  const forget = async () => {
    if (timer.current) clearTimeout(timer.current);
    setSaveState('saving');
    try {
      const res = await fetch(`${apiBase()}/insight/conditions`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      setChosen([]);
      stored.current = '';
      setSaveState('saved');
      setSaid('Deleted. Nothing about a condition is held for you any more.');
      onChange?.([]);
    } catch {
      setSaveState('error');
    }
  };

  if (loading) {
    return <p className="acct__note">Loading what can be taken into account…</p>;
  }
  if (failed) {
    return (
      <p className="probe__err">
        The list of conditions could not be loaded, so the page below is reading the general
        guidance. If you live with something, that reading may not be right for you.
      </p>
    );
  }

  return (
    <div className="cond">
      <button
        type="button"
        className="cond__toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span>
          {chosen.length === 0
            ? 'Living with something? Tell this page and it reads differently'
            : `Read against ${chosen.length} condition${chosen.length === 1 ? '' : 's'} you have told us about`}
        </span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="cond__body">
          <p className="cond__notice">{notice}</p>

          {/*
            The privacy of this section, said before anything is ticked
            rather than in a policy page nobody opens. Somebody deciding
            whether to tell a platform about their pancreas is entitled to
            know where it goes first.
          */}
          <details className="cond__privacy">
            <summary>Who sees this — only you, and it never leaves your account</summary>
            <ul>
              {privacy.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>

          <p className="acct__note">
            Tick what applies, up to {max}. It saves itself and the page below changes as soon as
            it has — the full guidance for anything you tick appears there. No severity, no dates,
            no medication, no test results: this is a list of conditions and nothing else.
          </p>

          {GROUP_ORDER.filter((group) => catalogue.some((c) => c.group === group)).map((group) => (
            <fieldset key={group} className="cond__group">
              <legend>{GROUP_WORD[group]}</legend>
              {catalogue
                .filter((c) => c.group === group)
                .map((card) => {
                  const ticked = chosen.includes(card.id);
                  return (
                    <label
                      key={card.id}
                      className={`cond__opt${ticked ? ' cond__opt--on' : ''}${
                        !ticked && atLimit ? ' cond__opt--full' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={ticked}
                        disabled={!ticked && atLimit}
                        onChange={() => toggle(card.id)}
                      />
                      <span>
                        <strong>{card.label}</strong>
                        <em>{card.inShort}</em>
                      </span>
                    </label>
                  );
                })}
            </fieldset>
          ))}

          <div className="cond__actions">
            <SaveMark state={saveState} />
            {chosen.length > 0 && (
              <button type="button" className="btn btn--ghost" onClick={() => void forget()}>
                Delete what you know about me
              </button>
            )}
          </div>

          {atLimit && (
            <p className="acct__note">
              That is {max}, which is the most this page will read at once — past that the
              guidance starts contradicting itself, and untangling it is a job for the team
              looking after you rather than for a page.
            </p>
          )}

          {saveState === 'saved' && said && <p className="cond__saved">{said}</p>}
          {saveState === 'error' && (
            <p className="probe__err">
              That did not save, so the page below may still be reading the general guidance.
              Change something to try again rather than assuming this page knows.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The declared conditions, read against what this member actually recorded. */
export function ConditionCards({
  findings,
  suppressed,
  notice,
}: {
  findings: (ConditionCard & { noticed: string[] })[];
  suppressed: string[];
  notice?: string;
}) {
  if (findings.length === 0 && suppressed.length === 0) return null;

  return (
    <>
      <h4 className="fl__h">Read against what you live with</h4>
      {notice && <p className="cond__notice">{notice}</p>}

      {suppressed.length > 0 && (
        <ul className="cond__suppressed">
          {suppressed.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <div className="risk__list">
        {findings.map((card) => (
          <article key={card.id} className="cond__card">
            <header className="risk__head">
              <h4>{card.label}</h4>
            </header>
            <p className="risk__assoc">{card.inShort}</p>

            {card.noticed.length > 0 && (
              <div className="cond__noticed">
                <strong>In what you have recorded</strong>
                <ul>
                  {card.noticed.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <Block title="What usually helps" lines={card.helps} tone="help" />
            <Block title="What to be careful with" lines={card.careful} tone="careful" />
            <Block
              title="Not ours to touch — take these to your clinician"
              lines={card.clinicianOnly}
              tone="clinician"
            />
          </article>
        ))}
      </div>
    </>
  );
}

function Block({ title, lines, tone }: { title: string; lines: string[]; tone: string }) {
  if (lines.length === 0) return null;
  return (
    <div className={`cond__block cond__block--${tone}`}>
      <strong>{title}</strong>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
