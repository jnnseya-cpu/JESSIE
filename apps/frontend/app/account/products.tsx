'use client';

import { useEffect, useState } from 'react';
import { CHALLENGE_TEMPLATES, modeForAge } from '@jessmove/shared';
import { apiBase } from '../api-base';

/**
 * The rest of the product, where a member can actually use it.
 *
 * Each module answers three questions in the member's own language:
 * what this is, what they get, and one button that does it. Anything the
 * platform cannot yet do says so plainly rather than showing a button
 * that fails.
 */

interface Subject {
  userId: string;
  age: number;
  displayName: string;
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `${res.status}`);
  return json.data;
}

/* ------------------------------------------------------------------ *
 * MOVA — the coach you can ask
 * ------------------------------------------------------------------ */

export function MovaModule({ me }: { me: Subject }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const suggestions =
    me.age < 18
      ? ['I sat all day at school — what now?', 'How do I get my energy back after revision?']
      : ['My lower back aches after work', 'I have 3 minutes and no space', 'How do I start again after a break?'];

  const ask = async (text: string) => {
    if (text.trim().length < 2) return;
    setBusy(true);
    setNote(null);
    setAnswer(null);
    try {
      const data = await post('/mova/ask', {
        question: text.trim(),
        age: me.age,
        displayName: me.displayName,
      });
      setAnswer(data.answer as string);
      if (!data.live) setNote('The coaching model was unreachable, so this is the honest fallback.');
    } catch (e) {
      setNote(`MOVA could not answer: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acct__module">
      <h3>
        MOVA — your coach <span className="tdv__chip">ask anything</span>
      </h3>
      <p className="tdv__what">
        Ask about aches, energy, getting started, or what to do with the ten minutes you
        have. MOVA answers in your own age register and refuses to diagnose, judge or
        promise results.
      </p>
      <div className="tdv__askrow">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask(question);
          }}
          placeholder="Ask MOVA something…"
          aria-label="Ask MOVA a question"
          maxLength={500}
        />
        <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void ask(question)}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      <div className="tdv__chips">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => { setQuestion(s); void ask(s); }}>
            {s}
          </button>
        ))}
      </div>
      {note && <p className="acct__note">{note}</p>}
      {answer && (
        <div className="tdv__result">
          {answer.split('\n').filter(Boolean).map((p) => (
            <p key={p} className="tdv__line">
              {p}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * BodyCommand — where you are today, and the plan that follows
 * ------------------------------------------------------------------ */

interface Assessment {
  pathway: string;
  pathwayFocus: string[];
  ageMode: string;
  metrics: {
    bmi?: number;
    waistToHeightRatio?: number;
    waistToHeightApplicable?: boolean;
    bmiUnreliable?: boolean;
    reasons?: string[];
    confidence?: number;
  } | null;
  safety?: { status: string; note?: string; reasons?: string[] };
  surfacePolicy?: { mayDisplay: boolean; mayTarget: boolean; reason?: string };
}

/** The goals an adult may choose. The engine holds nine; these are the
 *  five a member picks between — the rest are set by circumstance. */
const GOALS = [
  { key: 'REDUCE', label: 'Lose weight steadily' },
  { key: 'WAIST', label: 'Bring my waist down' },
  { key: 'RECOMPOSITION', label: 'Get stronger, leaner' },
  { key: 'MAINTAIN', label: 'Stay where I am' },
  { key: 'GAIN', label: 'Gain weight safely' },
] as const;

export function BodyCommandModule({ me }: { me: Subject }) {
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [goal, setGoal] = useState<string>('REDUCE');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const minor = me.age < 18;

  const assess = async () => {
    setBusy(true);
    setNote(null);
    setResult(null);
    try {
      const data = await post('/body/assess', {
        userId: me.userId,
        age: me.age,
        ...(heightCm ? { heightCm: Number(heightCm) } : {}),
        ...(weightKg && !minor ? { weightKg: Number(weightKg) } : {}),
        ...(waistCm && !minor ? { waistCm: Number(waistCm) } : {}),
        ...(minor ? {} : { requestedPathway: goal }),
        optedIntoBodyMetrics: !minor,
      });
      setResult(data as Assessment);
    } catch (e) {
      setNote(`could not assess: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const metrics = result?.metrics;

  return (
    <section className="acct__module">
      <h3>
        BodyCommand <span className="tdv__chip">your starting point</span>
      </h3>
      <p className="tdv__what">
        {minor
          ? 'Find which pathway fits you and what it focuses on. Under 18 there are no numbers about your body — ever.'
          : 'Tell it your goal and your measurements. You get the numbers, what they do and do not mean, and the pathway that follows. Nothing here is a verdict on you.'}
      </p>

      {!minor && (
        <label className="tdv__field">
          <span>What are you here for?</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOALS.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="tdv__askrow">
        <input
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
          inputMode="numeric"
          placeholder="Height in cm"
          aria-label="Height in centimetres"
        />
        {!minor && (
          <input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            inputMode="numeric"
            placeholder="Weight in kg"
            aria-label="Weight in kilograms"
          />
        )}
        {!minor && (
          <input
            value={waistCm}
            onChange={(e) => setWaistCm(e.target.value)}
            inputMode="numeric"
            placeholder="Waist in cm (optional)"
            aria-label="Waist in centimetres"
          />
        )}
      </div>
      <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void assess()}>
        {busy ? 'Reading…' : 'Show me where I am'}
      </button>
      {note && <p className="acct__note">{note}</p>}

      {result && (
        <div className="tdv__result">
          {metrics?.bmi !== undefined && (
            <>
              <p className="tdv__bignum">
                BMI {metrics.bmi}
                {metrics.waistToHeightRatio !== undefined && (
                  <span> · waist-to-height {metrics.waistToHeightRatio}</span>
                )}
              </p>
              <p className="tdv__line">
                BMI is never used on its own here — it cannot tell muscle from fat, and it
                says nothing about your health on its own.
                {metrics.waistToHeightRatio === undefined && metrics.waistToHeightApplicable
                  ? ' Add your waist measurement above and this reading gets materially better.'
                  : ''}
              </p>
              {(metrics.reasons ?? []).map((r) => (
                <p key={r} className="tdv__line">
                  {r}
                </p>
              ))}
              {metrics.confidence !== undefined && (
                <p className="tdv__line">
                  <strong>Confidence in this reading:</strong>{' '}
                  {Math.round(metrics.confidence * 100)}% — more measurements raise it.
                </p>
              )}
            </>
          )}

          {result.metrics === null && (
            <p className="tdv__line tdv__line--guard">
              {result.surfacePolicy?.reason ??
                'No body numbers are calculated or shown for this account.'}
            </p>
          )}

          <p className="tdv__line">
            <strong>Your pathway:</strong>{' '}
            {result.pathway.replace(/_/g, ' ').toLowerCase()} — {result.pathwayFocus.join(' · ')}
          </p>
          {result.safety?.note && <p className="tdv__line tdv__line--guard">{result.safety.note}</p>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Wearables — what can connect, and what it will never take
 * ------------------------------------------------------------------ */

interface Provider {
  provider: string;
  label?: string;
  connect?: string;
  configured?: boolean;
  note?: string;
}

export function WearablesModule() {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  useEffect(() => {
    void fetch(`${apiBase()}/wearables/providers`)
      .then((r) => r.json())
      .then((j) => {
        const data = j.data;
        const list: Provider[] = Array.isArray(data) ? data : (data?.providers ?? []);
        setProviders(list);
      })
      .catch(() => setProviders([]));
  }, []);

  const ready = providers?.filter((p) => p.configured) ?? [];

  return (
    <section className="acct__module">
      <h3>
        Wearables <span className="tdv__chip">bring your own</span>
      </h3>
      <p className="tdv__what">
        Connect a watch or ring and JESS MOVE reads only what it needs — movement and
        activity. It never ingests anything an under-18 account is protected from, whatever
        the device offers.
      </p>
      {providers === null ? (
        <p className="acct__note">Checking which devices are available…</p>
      ) : ready.length > 0 ? (
        <div className="tdv__chips">
          {ready.map((p) => (
            <a key={p.provider} className="tdv__connect" href={p.connect ?? '#'}>
              Connect {p.label ?? p.provider.replace(/_/g, ' ')}
            </a>
          ))}
        </div>
      ) : (
        <p className="acct__note">
          No device partner is switched on yet. Each one needs its own developer keys before
          the connect button can be honest — phone motion still works without any of them.
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Challenges — what exists, and what is honestly not built yet
 * ------------------------------------------------------------------ */

export function ChallengesModule({ me }: { me: Subject }) {
  const forYou = CHALLENGE_TEMPLATES.slice(0, 4);
  return (
    <section className="acct__module">
      <h3>
        Challenges <span className="tdv__chip">soon</span>
      </h3>
      <p className="tdv__what">
        Team movement where nobody can win alone and no individual is ever ranked. These are
        the formats built into the platform — joining opens when your crew or workplace is
        set up.
      </p>
      <ul className="tdv__list">
        {forYou.map((c) => (
          <li key={c.key}>
            <strong>{c.name}</strong>
            <em>
              {c.forWhom} · runs {c.runs}
            </em>
          </li>
        ))}
      </ul>
      <p className="acct__note">
        Your mode: {modeForAge(me.age)}. Under-18 accounts never appear in a public ranking.
      </p>
    </section>
  );
}
