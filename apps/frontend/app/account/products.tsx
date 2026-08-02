'use client';

import { useEffect, useState } from 'react';
import {
  CHALLENGE_TEMPLATES,
  DELIVERY_TIERS,
  DELIVERY_TIER_DEFINITIONS,
  modeForAge,
} from '@jessmove/shared';
import { apiBase } from '../api-base';
import { Cone, WeightedBars } from './charts';
import { recordActivity } from './dashboard';
import { SaveMark, useAutosave, useSavedState } from './autosave';

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
    <section className="acct__module acct__module--coach">
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

export function BodyCommandModule({
  me,
  dashboard,
}: {
  me: Subject;
  dashboard?: { daysMovedInWindow: number; foodChecks: number } | null;
}) {
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [goal, setGoal] = useState<string>('REDUCE');
  const { loaded, state, restored } = useSavedState();

  // Come back tomorrow and your height is still there.
  useEffect(() => {
    if (!loaded) return;
    const saved = state['body.inputs'] as
      | {
          heightCm?: string;
          weightKg?: string;
          waistCm?: string;
          goal?: string;
          history?: number[];
          readings?: { day: string; kg: number }[];
        }
      | undefined;
    if (!saved) return;
    if (saved.heightCm) setHeightCm(saved.heightCm);
    if (saved.weightKg) setWeightKg(saved.weightKg);
    if (saved.waistCm) setWaistCm(saved.waistCm);
    if (saved.goal) setGoal(saved.goal);
    if (Array.isArray(saved.history)) setHistory(saved.history);
    if (Array.isArray(saved.readings)) setReadings(saved.readings);
  }, [loaded, state]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [readings, setReadings] = useState<{ day: string; kg: number }[]>([]);
  const [progress, setProgress] = useState<{
    trend: { kgPerWeek: number | null; changeKg: number | null; spanDays: number; readings: number; direction: string; says: string };
    warnings: { level: string; says: string; action: string }[];
    alongside: { daysMoved: number; mealsChecked: number; windowDays: number; says: string };
    howItWorks: string[];
  } | null>(null);
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
      // The reading becomes history, which is what lets a trajectory and
      // a trend exist at all.
      if (!minor && weightKg) {
        void recordActivity({ kind: 'body_read', value: Number(weightKg) });
        setHistory((h) => [...h, Number(weightKg)]);
        const today = new Date().toISOString().slice(0, 10);
        const nextReadings = [
          ...readings.filter((r) => r.day !== today),
          { day: today, kg: Number(weightKg) },
        ];
        setReadings(nextReadings);

        // The loop: what has changed, what to watch, what you were doing.
        const metrics = (data as Assessment).metrics;
        try {
          setProgress(
            (await post('/body/progress', {
              age: me.age,
              bmi: metrics?.bmi,
              readings: nextReadings,
              daysMoved: dashboard?.daysMovedInWindow ?? 0,
              mealsChecked: dashboard?.foodChecks ?? 0,
              windowDays: 14,
            })) as typeof progress,
          );
        } catch {
          /* the assessment still stands without the loop around it */
        }
      }
    } catch (e) {
      setNote(`could not assess: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const metrics = result?.metrics;
  const saveState = useAutosave(
    'body.inputs',
    { heightCm, weightKg, waistCm, goal, history, readings },
    restored,
  );

  return (
    <section className="acct__module acct__module--body">
      <h3>
        BodyCommand <span className="tdv__chip">your starting point</span>
        <SaveMark state={saveState} />
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

          {!minor && progress && (
            <>
              <h4 className="fl__h">What has changed</h4>
              <p className="tdv__line">{progress.trend.says}</p>
              {progress.trend.changeKg !== null && (
                <p className="fl__big">
                  {progress.trend.changeKg > 0 ? '+' : ''}
                  {progress.trend.changeKg}kg
                  <span className="fl__unit"> over {progress.trend.spanDays} days</span>
                </p>
              )}

              {progress.warnings.length > 0 && (
                <>
                  <h4 className="fl__h">Worth knowing</h4>
                  {progress.warnings.map((w) => (
                    <div key={w.says} className={`warn warn--${w.level}`}>
                      <strong>{w.says}</strong>
                      <em>{w.action}</em>
                    </div>
                  ))}
                </>
              )}

              <h4 className="fl__h">What you were doing alongside</h4>
              <p className="tdv__line">{progress.alongside.says}</p>

              <details className="mm__agents">
                <summary>How this works</summary>
                <ul className="mm__nine">
                  {progress.howItWorks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            </>
          )}

          {!minor && (
            <>
              <h4 className="fl__h">Your trajectory</h4>
              <Cone history={history} label="Weight trajectory with widening uncertainty" />
              {readings.length > 0 && (
                <p className="chart__note">
                  Your readings:{' '}
                  {readings
                    .slice(-6)
                    .map((r) => `${r.day.slice(5)} ${r.kg}kg`)
                    .join(' · ')}
                </p>
              )}
            </>
          )}

          <h4 className="fl__h">What the score is actually made of</h4>
          <WeightedBars
            items={[
              { label: 'Food-pattern quality', value: 15 },
              { label: 'Movement consistency', value: 15 },
              { label: 'Sedentary interruption', value: 10 },
              { label: 'Strength protection', value: 10 },
              { label: 'Sleep and recovery', value: 10 },
              { label: 'Waist or body-risk trend', value: 10 },
              { label: 'Goal adherence', value: 10 },
              { label: 'Behavioural stability', value: 10 },
              { label: 'Sustainability', value: 5 },
              { label: 'Measurement confidence', value: 5 },
            ]}
          />
          <p className="chart__note">
            BMI contributes nothing directly. Ninety per cent of the score is behaviour you
            control today, not a number on a scale.
          </p>

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
  const [status, setStatus] = useState<{ providers?: { provider: string; configured: boolean }[] } | null>(null);

  useEffect(() => {
    void fetch(`${apiBase()}/wearables/providers`)
      .then((r) => r.json())
      .then((j) => setStatus(j.data))
      .catch(() => setStatus(null));
  }, []);

  const live = (status?.providers ?? []).filter((p) => p.configured);

  return (
    <section className="acct__module acct__module--move">
      <h3>
        Wearables &amp; reach <span className="tdv__chip">four tiers</span>
      </h3>
      <p className="tdv__what">
        The lowest tier defines the product. A council programme cannot assume smartphones and
        a care group cannot assume wearables, so messaging and assisted delivery are real
        tiers with their own rules — not an accessibility afterthought.
      </p>

      <ul className="tdv__list">
        {DELIVERY_TIERS.map((t) => {
          const def = DELIVERY_TIER_DEFINITIONS[t];
          return (
            <li key={t}>
              <strong>
                {t} — {def.name}
              </strong>
              <em>
                {def.dataAvailable} · {def.channels.map((c) => c.replace(/_/g, ' ')).join(' · ')}
              </em>
            </li>
          );
        })}
      </ul>

      <p className="fl__note">
        You are on <strong>T2 — phone-only</strong>: phone motion and your own confirmation,
        which needs no device at all.
        {live.length === 0
          ? ' No wearable partner is switched on yet — each needs its own developer keys from that company before a connect button could be honest.'
          : ` Connected: ${live.map((p) => p.provider).join(', ')}.`}
      </p>
      <p className="fl__note">
        Whatever a device offers, an under-18 account never ingests body measurements. The
        refusal is in the server, not in a settings screen.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Challenges — what exists, and what is honestly not built yet
 * ------------------------------------------------------------------ */

interface ChallengeSummary {
  id: string;
  name: string;
  joinCode: string;
  endsOn: string;
  isOwner: boolean;
}

interface Progress {
  teamSize: number;
  participation: number;
  teamScore: number;
  daysElapsed: number;
  daysTotal: number;
  whoTookPart: string[];
  someoneCapped: boolean;
}

export function ChallengesModule({ me }: { me: Subject }) {
  const [mine, setMine] = useState<ChallengeSummary[] | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadMine = async () => {
    try {
      const res = await fetch(`${apiBase()}/challenges/mine`, { credentials: 'include' });
      if (!res.ok) {
        setMine([]);
        return;
      }
      const list = ((await res.json()).data.challenges ?? []) as ChallengeSummary[];
      setMine(list);
      for (const c of list) void loadProgress(c.id);
    } catch {
      setMine([]);
    }
  };

  const loadProgress = async (id: string) => {
    try {
      const res = await fetch(`${apiBase()}/challenges/${id}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()).data as Progress;
      setProgress((p) => ({ ...p, [id]: data }));
    } catch {
      /* a challenge that will not load simply shows no bar */
    }
  };

  useEffect(() => {
    void loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await loadMine();
    } catch (e) {
      setNote(`${failure}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const start = (template: string) =>
    run(() => post('/challenges', { template }), 'could not start that');
  const join = () =>
    run(async () => {
      await post('/challenges/join', { code: code.trim() });
      setCode('');
    }, 'could not join');
  const act = (id: string, kind: 'moved' | 'support') =>
    run(async () => {
      const data = (await post(`/challenges/${id}/act`, { kind })) as Progress;
      setProgress((p) => ({ ...p, [id]: data }));
    }, 'could not record that');

  const suggested = CHALLENGE_TEMPLATES.filter((t) =>
    me.age < 18 ? ['family_expedition', 'class_quest'].includes(t.key) : true,
  ).slice(0, 3);

  return (
    <section className="acct__module acct__module--team">
      <h3>
        Challenges <span className="tdv__chip">team</span>
      </h3>
      <p className="tdv__what">
        Movement as a team, where nobody can win it alone. The score counts turning up,
        keeping at it, improving on your own past and helping others — never how fit you
        are, and never one person against another.
      </p>

      {(mine ?? []).map((c) => {
        const p = progress[c.id];
        return (
          <div key={c.id} className="tdv__result">
            <p className="tdv__snapname">{c.name}</p>
            {p && (
              <>
                <div className="tdv__bar" aria-label={`Team score ${p.teamScore} out of 100`}>
                  <span style={{ width: `${Math.max(2, p.teamScore)}%` }} />
                </div>
                <p className="tdv__line">
                  <strong>Team score {p.teamScore}/100</strong> · {Math.round(p.participation * 100)}%
                  of {p.teamSize} {p.teamSize === 1 ? 'person' : 'people'} have taken part · day{' '}
                  {p.daysElapsed} of {p.daysTotal}
                </p>
                {p.whoTookPart.length > 0 && (
                  <p className="tdv__line">Took part: {p.whoTookPart.join(', ')}</p>
                )}
                {p.someoneCapped && (
                  <p className="tdv__line tdv__line--guard">
                    Someone has hit the contribution ceiling — the team needs more people, not
                    more effort from one.
                  </p>
                )}
              </>
            )}
            <h4 className="fl__h">What the team score counts</h4>
            <WeightedBars
              items={[
                { label: 'Participation', value: 35 },
                { label: 'Consistency', value: 25 },
                { label: 'Improvement', value: 25 },
                { label: 'Mutual support', value: 15 },
              ]}
            />
            <p className="chart__note">
              Physical capability is absent by design — that is what lets a ten-year-old, a
              wheelchair user and an eighty-eight-year-old share one leaderboard fairly.
            </p>

            <div className="tdv__chips">
              <button type="button" disabled={busy} onClick={() => void act(c.id, 'moved')}>
                I moved today
              </button>
              <button type="button" disabled={busy} onClick={() => void act(c.id, 'support')}>
                Cheer the team
              </button>
            </div>
            <p className="acct__note">
              Share this code so others can join: <strong>{c.joinCode}</strong>
            </p>
          </div>
        );
      })}

      {mine !== null && mine.length === 0 && (
        <>
          <p className="acct__note" style={{ marginTop: 0 }}>
            Start one and share the code, or enter a code you were given.
          </p>
          <div className="tdv__chips">
            {suggested.map((t) => (
              <button key={t.key} type="button" disabled={busy} onClick={() => void start(t.key)}>
                Start {t.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="tdv__askrow" style={{ marginTop: 12 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Join with a code"
          aria-label="Challenge join code"
          maxLength={12}
        />
        <button className="btn acct__ghostbtn" type="button" disabled={busy || code.length < 4} onClick={() => void join()}>
          Join
        </button>
      </div>
      {note && <p className="acct__note">{note}</p>}
      <p className="acct__note">
        Nothing here is public and no individual is ever ranked
        {me.age < 18 ? ', and under-18 accounts never appear in any ranking at all' : ''}.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Household & organisation — one list, two very different promises
 * ------------------------------------------------------------------ */

interface GroupSummary {
  id: string;
  kind: 'household' | 'organisation';
  name: string;
  joinCode: string;
  isOwner: boolean;
  size: number;
}

type GroupReport =
  | {
      kind: 'household';
      size: number;
      people: { displayName: string; daysMoved: number; minor: boolean }[];
      sharedDays: number;
      note: string;
    }
  | {
      kind: 'organisation';
      size: number;
      suppressed: boolean;
      participationPct: number | null;
      activeMembers: number | null;
      medianDaysMoved: number | null;
      floor: number;
      note: string;
    };

export function GroupsModule({ me }: { me: Subject }) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [reports, setReports] = useState<Record<string, GroupReport>>({});
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${apiBase()}/groups/mine`, { credentials: 'include' });
      if (!res.ok) {
        setGroups([]);
        return;
      }
      const list = ((await res.json()).data.groups ?? []) as GroupSummary[];
      setGroups(list);
      for (const g of list) {
        const r = await fetch(`${apiBase()}/groups/${g.id}/report`, { credentials: 'include' });
        if (!r.ok) continue;
        const report = ((await r.json()).data as GroupReport);
        setReports((prev) => ({ ...prev, [g.id]: report }));
      }
    } catch {
      setGroups([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNote(`${failure}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acct__module acct__module--team">
      <h3>
        Household &amp; team <span className="tdv__chip">shared</span>
      </h3>
      <p className="tdv__what">
        A household sees each other by name — that is what makes a grandparent-and-grandchild
        streak possible. An organisation sees participation above a privacy floor and never a
        person, however senior they are.
      </p>

      {(groups ?? []).map((g) => {
        const report = reports[g.id];
        return (
          <div key={g.id} className="tdv__result">
            <p className="tdv__snapname">
              {g.name} <span className="tdv__chip">{g.kind}</span>
            </p>

            {report?.kind === 'household' && (
              <>
                <div className="chart__wbars">
                  {report.people.map((p) => (
                    <div key={p.displayName} className="chart__wbar">
                      <span className="chart__wlabel">
                        {p.displayName}
                        {p.minor ? ' · under 18' : ''}
                      </span>
                      <span className="chart__wtrack">
                        <span
                          className="chart__wfill"
                          style={{
                            width: `${Math.min(100, (p.daysMoved / 14) * 100)}%`,
                            background: 'linear-gradient(90deg, #00a99d, #2dd4bf)',
                          }}
                        />
                      </span>
                      <span className="chart__wvalue">{p.daysMoved}d</span>
                    </div>
                  ))}
                </div>
                <p className="tdv__line">
                  <strong>{report.sharedDays}</strong> day{report.sharedDays === 1 ? '' : 's'}{' '}
                  where everybody moved — the thing a family actually plays for.
                </p>
                <p className="chart__note">{report.note}</p>
              </>
            )}

            {report?.kind === 'organisation' && (
              <>
                {report.suppressed ? (
                  <>
                    <p className="tdv__line tdv__line--guard">
                      Suppressed — {report.size} of {report.floor} people needed.
                    </p>
                    <p className="chart__note">{report.note}</p>
                  </>
                ) : (
                  <>
                    <p className="fl__big">{report.participationPct}%</p>
                    <p className="tdv__line">
                      of {report.size} people moved at least once in the fortnight · median{' '}
                      {report.medianDaysMoved} days each
                    </p>
                    <p className="chart__note">{report.note}</p>
                  </>
                )}
              </>
            )}

            <p className="acct__note">
              Join code: <strong>{g.joinCode}</strong>
            </p>
          </div>
        );
      })}

      <div className="tdv__askrow" style={{ marginTop: 12 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name it — e.g. The Nseyas"
          aria-label="Group name"
          maxLength={60}
        />
      </div>
      <div className="tdv__chips">
        <button
          type="button"
          disabled={busy || name.trim().length < 2}
          onClick={() => void run(() => post('/groups', { kind: 'household', name }), 'could not create')}
        >
          Start a household
        </button>
        {me.age >= 18 && (
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={() =>
              void run(() => post('/groups', { kind: 'organisation', name }), 'could not create')
            }
          >
            Start an organisation
          </button>
        )}
      </div>

      <div className="tdv__askrow" style={{ marginTop: 10 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Join with a code"
          aria-label="Group join code"
          maxLength={12}
        />
        <button
          className="btn acct__ghostbtn"
          type="button"
          disabled={busy || code.length < 4}
          onClick={() => void run(async () => { await post('/groups/join', { code }); setCode(''); }, 'could not join')}
        >
          Join
        </button>
      </div>
      {note && <p className="acct__note">{note}</p>}
    </section>
  );
}
