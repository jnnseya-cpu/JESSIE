'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';

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
  seconds: number;
}

interface Reading {
  key: string;
  label: string;
  value: number | null;
  says: string;
}

export interface Dashboard {
  days: DayPoint[];
  todaySeconds: number;
  todayCompleted: number;
  completionRate: number | null;
  streak: number;
  daysMovedInWindow: number;
  mix: { category: string; completed: number }[];
  foodChecks: number;
  heldWithReasons: { detail: string; count: number }[];
  readings: Reading[];
  totalActs: number;
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
          <span key={d.day} className="dash__bar" title={`${d.day}: ${minutes} min`}>
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

export function DashboardModule({ data }: { data: Dashboard | null }) {
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
          Nothing recorded yet. Take a Snap and mark it done, or photograph a meal, and this
          fills in with your own history — never anybody else&rsquo;s, and never a number we
          made up.
        </p>
      ) : (
        <p className="tdv__what">
          {minutesToday > 0
            ? `${minutesToday} minute${minutesToday === 1 ? '' : 's'} of movement today`
            : 'Nothing yet today'}
          {data.streak > 1 ? ` · ${data.streak} days in a row` : ''} · moved on{' '}
          {data.daysMovedInWindow} of the last 14 days
          {data.completionRate !== null
            ? ` · ${Math.round(data.completionRate * 100)}% of Snaps offered were done`
            : ''}
        </p>
      )}

      <Fortnight days={data.days} />

      <div className="dash__readings">
        {data.readings.map((r) => (
          <ReadingTile key={r.key} reading={r} />
        ))}
      </div>
      <p className="acct__note">
        Six readings rather than one score, because a single number invites a comparison this
        product refuses to make. A dash means not enough of your history yet.
      </p>

      {data.mix.length > 0 && (
        <p className="tdv__line">
          <strong>Your mix:</strong>{' '}
          {data.mix.map((m) => `${m.category} ×${m.completed}`).join(' · ')}
        </p>
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
