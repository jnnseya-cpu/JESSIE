'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';
import { Curve, DayStrip, Heatmap, StackedMix } from './charts';

/**
 * Your day, drawn from what you actually did.
 *
 * Every figure here comes from the member's own activity log. Where
 * there is not enough history for a reading to mean anything, it says so
 * rather than drawing a line — the product refuses invented precision in
 * FoodLens and BodyCommand, and a dashboard is no different.
 */

interface DayPoint {
  day: string;
  offered: number;
  completed: number;
  held: number;
  walks: number;
  seconds: number;
}

interface Reading {
  key: string;
  label: string;
  value: number | null;
  says: string;
}

interface Rewards {
  movePoints: number;
  energyCrystals: number;
  levelStars: number;
  pointsIntoLevel: number;
  pointsForNextLevel: number;
  streakShields: number;
  world: string;
  worldProgress: number;
  awards: { reason: string; points: number }[];
}

export interface Dashboard {
  days: DayPoint[];
  todaySeconds: number;
  todayCompleted: number;
  todayWalks: number;
  walksInWindow: number;
  /** Snaps only, both sides — a walk nobody offered is not evidence about timing. */
  completionRate: number | null;
  streak: number;
  daysMovedInWindow: number;
  mix: { category: string; completed: number }[];
  foodChecks: number;
  heldWithReasons: { detail: string; count: number }[];
  readings: Reading[];
  totalActs: number;
  rewards: Rewards;
  heatmap: number[][];
  today: { hour: number; kind: string }[];
  weights: { day: string; kg: number }[];
  meals: { day: string; kcal: number }[];
}

export function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/activity/dashboard`, { credentials: 'include' });
      if (res.ok) setData((await res.json()).data as Dashboard);
    } catch {
      /* a dashboard that will not load simply does not draw */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, refresh };
}

/** Records an act and returns the fresh dashboard, so the page moves at once. */
export async function recordActivity(body: {
  kind: 'snap_offered' | 'snap_completed' | 'snap_held' | 'food_checked' | 'body_read';
  category?: string;
  seconds?: number;
  detail?: string;
  /** A measurement the member gave: kilograms, kilocalories. */
  value?: number;
}): Promise<Dashboard | null> {
  try {
    const res = await fetch(`${apiBase()}/activity`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()).data as Dashboard;
  } catch {
    return null;
  }
}

/** Logs a walk and returns the fresh dashboard. Minutes are the whole payload. */
export async function logWalk(minutes: number, where?: string): Promise<Dashboard | null> {
  try {
    const res = await fetch(`${apiBase()}/activity/walk`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ minutes, where: where || undefined }),
    });
    if (!res.ok) return null;
    return (await res.json()).data as Dashboard;
  } catch {
    return null;
  }
}

/**
 * Logging a walk.
 *
 * The one form of movement almost everybody already does, and the platform
 * could not see it. Three presets and a free field, because the walk most
 * people want to record is the one they have just finished and the number
 * they know is roughly how long it took.
 *
 * What this deliberately does not ask for: distance, pace, route, steps.
 * Each of those would either need a second sensor or a guess, and a guess
 * dressed as a measurement is the thing this platform refuses everywhere
 * else. Minutes are what somebody actually knows.
 */
function WalkLogger({ onLogged }: { onLogged: (next: Dashboard) => void }) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');

  const send = async (mins: number) => {
    if (!Number.isFinite(mins) || mins < 1 || mins > 120) {
      setSaid('Between 1 and 120 minutes. A longer walk goes in as two.');
      return;
    }
    setBusy(true);
    setSaid('');
    const next = await logWalk(Math.round(mins), where.trim());
    setBusy(false);
    if (!next) {
      setSaid('That did not save.');
      return;
    }
    onLogged(next);
    setMinutes('');
    setWhere('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--ghost dash__walkopen" onClick={() => setOpen(true)}>
        I went for a walk
      </button>
    );
  }

  return (
    <div className="dash__walk">
      <p className="dash__walklab">Roughly how long were you walking?</p>
      <div className="dash__walkpresets">
        {[10, 20, 30].map((m) => (
          <button key={m} type="button" className="btn btn--ghost" disabled={busy}
            onClick={() => void send(m)}>
            {m} min
          </button>
        ))}
      </div>
      <label className="field">
        <span>Or say the number</span>
        <input
          inputMode="numeric"
          value={minutes}
          disabled={busy}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="e.g. 45"
        />
      </label>
      <label className="field">
        <span>Where, if you like</span>
        <input
          value={where}
          disabled={busy}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="e.g. to the shops and back"
        />
      </label>
      <p className="acct__note">
        Minutes only. No distance, no pace, no calories — none of those can be known from a
        number typed into a phone, so none of them are asked for or invented.
      </p>
      <div className="dash__walkacts">
        <button type="button" className="btn btn--primary" disabled={busy}
          onClick={() => void send(Number(minutes))}>
          {busy ? 'Saving…' : 'Log it'}
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
      {said && <p className="probe__err">{said}</p>}
    </div>
  );
}

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayLetter(iso: string): string {
  return DAY_LETTER[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? '·';
}

/** The fortnight, as bars. Height is minutes moved; a held prompt is marked. */
function Fortnight({ days }: { days: DayPoint[] }) {
  const peak = Math.max(60, ...days.map((d) => d.seconds));
  return (
    <div className="dash__bars" role="img" aria-label="Movement over the last fourteen days">
      {days.map((d) => {
        const height = d.seconds === 0 ? 0 : Math.max(6, Math.round((d.seconds / peak) * 100));
        const minutes = Math.round(d.seconds / 60);
        return (
          <span
            key={d.day}
            className="dash__bar"
            title={`${d.day}: ${minutes} min${d.walks > 0 ? ` · ${d.walks} walk${d.walks === 1 ? '' : 's'}` : ''}`}
          >
            <span className="dash__barfill" style={{ height: `${height}%` }} />
            {d.held > 0 && <span className="dash__held" title={`${d.held} prompt held`} />}
            <em>{dayLetter(d.day)}</em>
          </span>
        );
      })}
    </div>
  );
}

function ReadingTile({ reading }: { reading: Reading }) {
  return (
    <div className="dash__reading">
      <span className="dash__rlabel">{reading.label}</span>
      <span className={reading.value === null ? 'dash__rvalue dash__rvalue--none' : 'dash__rvalue'}>
        {reading.value === null ? '—' : reading.value}
      </span>
      <span className="dash__rsays">{reading.says}</span>
    </div>
  );
}

export function DashboardModule({
  data,
  onActivity,
}: {
  data: Dashboard | null;
  onActivity?: (fresh: Dashboard | null) => void;
}) {
  if (!data) return null;

  const nothingYet = data.totalActs === 0;
  const minutesToday = Math.round(data.todaySeconds / 60);

  return (
    <section className="acct__module acct__module--wide">
      <h3>
        Your fortnight <span className="tdv__chip">your data only</span>
      </h3>

      {nothingYet ? (
        <p className="tdv__what">
          Nothing recorded yet. Take a Snap and mark it done, photograph a meal, or log a walk
          you already went on, and this fills in with your own history — never anybody
          else&rsquo;s, and never a number we made up.
        </p>
      ) : (
        <p className="tdv__what">
          {minutesToday > 0
            ? `${minutesToday} minute${minutesToday === 1 ? '' : 's'} of movement today`
            : 'Nothing yet today'}
          {data.todayWalks > 0
            ? `, ${data.todayWalks === 1 ? 'a walk included' : `${data.todayWalks} walks included`}`
            : ''}
          {data.streak > 1 ? ` · ${data.streak} days in a row` : ''} · moved on{' '}
          {data.daysMovedInWindow} of the last 14 days
          {data.completionRate !== null
            ? ` · ${Math.round(data.completionRate * 100)}% of Snaps offered were done`
            : ''}
        </p>
      )}

      <WalkLogger onLogged={(next) => onActivity?.(next)} />

      <h4 className="fl__h">Today</h4>
      <DayStrip events={data.today} />

      <h4 className="fl__h">Minutes moved, fourteen days</h4>
      <Fortnight days={data.days} />

      {data.days.filter((d) => d.offered > 0).length >= 2 && (
        <>
          <h4 className="fl__h">Prompt → completed movement</h4>
          <Curve
            label="Completion rate over the fortnight"
            points={data.days.map((d) => (d.offered === 0 ? null : Math.round((d.completed / d.offered) * 100)))}
          />
          <p className="chart__note">
            The share of offered Snaps that actually happened, day by day. A gap is a day
            nothing was offered — the engine stayed silent rather than filling the chart.
          </p>
        </>
      )}

      {data.heatmap.flat().some((c) => c > 0) && (
        <>
          <h4 className="fl__h">Where your movement actually happens</h4>
          <Heatmap grid={data.heatmap} />
        </>
      )}

      <div className="dash__readings">
        {data.readings.map((r) => (
          <ReadingTile key={r.key} reading={r} />
        ))}
      </div>
      <p className="acct__note">
        Six readings rather than one score, because a single number invites a comparison this
        product refuses to make. A dash means not enough of your history yet.
      </p>

      {data.rewards.movePoints > 0 && (
        <div className="dash__rewards">
          <div className="dash__world">
            <span className="dash__rlabel">Your world</span>
            <strong>{data.rewards.world}</strong>
            <div className="tdv__bar" aria-label={`Level progress ${data.rewards.worldProgress}%`}>
              <span style={{ width: `${Math.max(2, data.rewards.worldProgress)}%` }} />
            </div>
            <span className="dash__rsays">
              Level {data.rewards.levelStars} · {data.rewards.pointsIntoLevel}/
              {data.rewards.pointsForNextLevel} to the next world
            </span>
          </div>
          <div className="dash__assets">
            <span>
              <strong>{data.rewards.movePoints}</strong> MovePoints
            </span>
            <span>
              <strong>{data.rewards.energyCrystals}</strong> Energy Crystals
            </span>
            <span>
              <strong>{data.rewards.streakShields}</strong> Streak Shields
            </span>
            <span>
              <strong>{data.rewards.levelStars}</strong> Level Stars
            </span>
          </div>
          <p className="dash__rsays">
            Earned for: {data.rewards.awards.map((a) => `${a.reason} (+${a.points})`).join(' · ')}.
            Never for calories, weight, appearance or how hard you went.
          </p>
        </div>
      )}

      {data.mix.length > 0 && (
        <>
          <h4 className="fl__h">Your movement mix</h4>
          <StackedMix parts={data.mix.map((m) => ({ label: m.category, value: m.completed }))} />
        </>
      )}

      {data.heldWithReasons.length > 0 && (
        <p className="tdv__line">
          <strong>Held back:</strong>{' '}
          {data.heldWithReasons.map((h) => `${h.detail} (${h.count})`).join(' · ')}. A prompt
          fired into a moment you cannot move is a defect, so it is logged as one.
        </p>
      )}
    </section>
  );
}
