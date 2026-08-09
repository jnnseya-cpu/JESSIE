'use client';

/**
 * The chart primitives the console draws with.
 *
 * Hand-written SVG rather than a charting library: every one of these is
 * a shape with a rule behind it, and the rules matter more than the
 * pixels. A cone widens because the future is less certain, not because
 * it looks good. A heatmap cell that is empty stays empty. Nothing here
 * interpolates a value the member never produced.
 */

const TEAL = '#2dd4bf';
const DEEP = '#00a99d';
const AMBER = '#fbbf24';
/* A walk. Its own colour rather than the completed teal, because the strip
   is the one place a member can see what the platform prompted against what
   they did on their own — and merging the two loses exactly that. */
const VIOLET = '#a78bfa';

/** A line with an area beneath it. Gaps in the data are gaps in the line. */
export function Curve({
  points,
  height = 90,
  label,
}: {
  points: (number | null)[];
  height?: number;
  label: string;
}) {
  const width = 300;
  const real = points.filter((p): p is number => p !== null);
  const max = Math.max(1, ...real);
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((p, i) =>
    p === null ? null : [i * step, height - (p / max) * (height - 12) - 6],
  );
  const path = coords
    .map((c, i) => (c === null ? '' : `${i === 0 || coords[i - 1] === null ? 'M' : 'L'}${c[0]},${c[1]}`))
    .join(' ')
    .trim();
  const area =
    real.length > 1
      ? `${path} L${(points.length - 1) * step},${height} L0,${height} Z`
      : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={label}>
      {area && <path d={area} fill="rgba(45,212,191,0.14)" />}
      <path d={path} fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
      {coords.map((c, i) =>
        c === null ? null : <circle key={i} cx={c[0]} cy={c[1]} r="2.5" fill={TEAL} />,
      )}
    </svg>
  );
}

/**
 * A widening cone. The further out the projection, the less anyone can
 * honestly say, so the band grows rather than the line getting bolder.
 */
export function Cone({
  history,
  weeks = 8,
  label,
}: {
  history: number[];
  weeks?: number;
  label: string;
}) {
  const width = 300;
  const height = 130;
  if (history.length < 2) {
    return (
      <p className="chart__empty">
        Two readings and the trajectory starts. One point is a fact; a line needs two.
      </p>
    );
  }

  const last = history[history.length - 1]!;
  const perStep = (last - history[0]!) / (history.length - 1);
  const centre = Array.from({ length: weeks }, (_, i) => last + perStep * (i + 1));
  // The band widens by 0.6 a week either side: the honest spread of a
  // projection built from this little history.
  const spread = (i: number) => 0.6 * (i + 1);

  const values = [
    ...history,
    ...centre.map((v, i) => v + spread(i)),
    ...centre.map((v, i) => v - spread(i)),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(0.8, (max - min) * 0.15);
  const lo = min - pad;
  const span = Math.max(0.1, max + pad - lo);

  const total = history.length + centre.length;
  const x = (i: number) => (i / (total - 1)) * (width - 8) + 4;
  const y = (v: number) => height - 18 - ((v - lo) / span) * (height - 34);

  const historyPath = history.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const centrePath = `M${x(history.length - 1)},${y(last)} ` +
    centre.map((v, i) => `L${x(history.length + i)},${y(v)}`).join(' ');
  const band =
    `M${x(history.length - 1)},${y(last)} ` +
    centre.map((v, i) => `L${x(history.length + i)},${y(v + spread(i))}`).join(' ') +
    ' ' +
    centre
      .map((v, i) => {
        const j = centre.length - 1 - i;
        return `L${x(history.length + j)},${y(centre[j]! - spread(j))}`;
      })
      .join(' ') +
    ' Z';

  const lowEnd = Math.round((centre[centre.length - 1]! - spread(centre.length - 1)) * 10) / 10;
  const highEnd = Math.round((centre[centre.length - 1]! + spread(centre.length - 1)) * 10) / 10;

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={label}>
        <path d={band} fill="rgba(45,212,191,0.15)" stroke="rgba(45,212,191,0.28)" />
        <path d={centrePath} fill="none" stroke="rgba(45,212,191,0.6)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={historyPath} fill="none" stroke={TEAL} strokeWidth="2.5" />
        {history.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={TEAL} />
        ))}
        <text x="4" y={height - 4} fontSize="9" fill="rgba(244,250,249,0.45)">
          your readings
        </text>
        <text x={width - 4} y={height - 4} fontSize="9" textAnchor="end" fill="rgba(244,250,249,0.45)">
          +{weeks} weeks
        </text>
      </svg>
      <p className="chart__note">
        On this trend, eight weeks out lands somewhere between {lowEnd} and {highEnd}. A single
        confident line would be a promise nobody can keep, so the band widens the further out
        it goes — and two readings is the thinnest possible history.
      </p>
    </>
  );
}

/** Seven weekdays by six four-hour blocks. Darker is more movement. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const blocks = ['00', '04', '08', '12', '16', '20'];
  const peak = Math.max(1, ...grid.flat());

  return (
    <div className="chart__heat">
      <div className="chart__heatgrid">
        <span />
        {blocks.map((b) => (
          <span key={b} className="chart__heatlabel">
            {b}
          </span>
        ))}
        {grid.map((row, d) => (
          <>
            <span key={`d-${days[d]}`} className="chart__heatlabel">
              {days[d]}
            </span>
            {row.map((count, b) => (
              <span
                key={`${d}-${b}`}
                className="chart__heatcell"
                title={`${days[d]} ${blocks[b]}:00 — ${count} movement${count === 1 ? '' : 's'}`}
                style={{
                  background:
                    count === 0
                      ? 'rgba(244,250,249,0.05)'
                      : `rgba(45,212,191,${0.18 + (count / peak) * 0.72})`,
                }}
              />
            ))}
          </>
        ))}
      </div>
      <p className="chart__note">
        Darker is more movement. The empty blocks are where a Snap has never landed — which
        is exactly where the engine looks next.
      </p>
    </div>
  );
}

/** A day, as a strip: what was offered, done, and deliberately held. */
export function DayStrip({ events }: { events: { hour: number; kind: string }[] }) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00–21:00
  const colourFor = (kind: string) =>
    kind === 'snap_completed'
      ? TEAL
      : kind === 'walk_logged'
        ? VIOLET
        : kind === 'snap_held'
          ? AMBER
          : 'rgba(244,250,249,0.35)';
  const nameFor = (kind: string) =>
    kind === 'walk_logged' ? 'a walk' : kind.replace('snap_', '');

  return (
    <div className="chart__day">
      <div className="chart__daystrip" role="img" aria-label="Today, hour by hour">
        {hours.map((h) => {
          const here = events.filter((e) => e.hour === h);
          const best =
            here.find((e) => e.kind === 'snap_completed') ??
            here.find((e) => e.kind === 'walk_logged') ??
            here.find((e) => e.kind === 'snap_held') ??
            here[0];
          return (
            <span
              key={h}
              className="chart__dayhour"
              title={`${String(h).padStart(2, '0')}:00${best ? ` — ${nameFor(best.kind)}` : ''}`}
              style={{ background: best ? colourFor(best.kind) : 'rgba(244,250,249,0.07)' }}
            />
          );
        })}
      </div>
      <div className="chart__daykey">
        <span>
          <i style={{ background: TEAL }} /> completed
        </span>
        <span>
          <i style={{ background: VIOLET }} /> walk
        </span>
        <span>
          <i style={{ background: AMBER }} /> held
        </span>
        <span>
          <i style={{ background: 'rgba(244,250,249,0.35)' }} /> offered
        </span>
        <span>06:00 → 21:00</span>
      </div>
    </div>
  );
}

/** Weighted horizontal bars — a scorecard or a set of score terms. */
export function WeightedBars({
  items,
  unit = '%',
}: {
  items: { label: string; value: number; note?: string }[];
  unit?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="chart__wbars">
      {items.map((item) => (
        <div key={item.label} className="chart__wbar">
          <span className="chart__wlabel">{item.label}</span>
          <span className="chart__wtrack">
            <span
              className="chart__wfill"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: `linear-gradient(90deg, ${DEEP}, ${TEAL})`,
              }}
            />
          </span>
          <span className="chart__wvalue">
            {item.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Stacked proportion bar — a mix that must add to the whole. */
export function StackedMix({ parts }: { parts: { label: string; value: number }[] }) {
  const total = Math.max(1, parts.reduce((a, p) => a + p.value, 0));
  const colours = [TEAL, '#60a5fa', AMBER, '#c084fc', '#34d399', '#f87171'];
  return (
    <div>
      <div className="fl__stack" role="img" aria-label="Movement mix">
        {parts.map((p, i) => (
          <span
            key={p.label}
            style={{ width: `${(p.value / total) * 100}%`, background: colours[i % colours.length] }}
          />
        ))}
      </div>
      <div className="fl__legend">
        {parts.map((p, i) => (
          <span key={p.label}>
            <i style={{ background: colours[i % colours.length] }} /> {p.label} ×{p.value}
          </span>
        ))}
      </div>
    </div>
  );
}
