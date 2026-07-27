import { Fragment } from 'react';

/**
 * MOVEQUEST — data visualisation primitives.
 *
 * Every chart here is hand-drawn SVG with no external dependency, no
 * runtime data fetch and no randomness, so the markup the server renders
 * is byte-identical to the markup the client hydrates.
 *
 * Colour comes from the canonical ramp in globals.css (§2). Nothing in
 * this file introduces a hex value.
 *
 * Motion: every animation is a one-shot draw-in under 1.2s. Nothing
 * loops above 0.3Hz and `prefers-reduced-motion` disables all of it
 * globally.
 */

/* ---------------- geometry helpers ---------------- */

const r2 = (n: number) => Math.round(n * 100) / 100;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: r2(cx + r * Math.cos(rad)), y: r2(cy + r * Math.sin(rad)) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Catmull-Rom → cubic bézier, so the sparkline reads as a signal not a saw. */
function smooth(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return '';
  let d = `M ${r2(points[0].x)} ${r2(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d +=
      ` C ${r2(p1.x + (p2.x - p0.x) / 6)} ${r2(p1.y + (p2.y - p0.y) / 6)},` +
      ` ${r2(p2.x - (p3.x - p1.x) / 6)} ${r2(p2.y - (p3.y - p1.y) / 6)},` +
      ` ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return d;
}

/* ---------------- Body Balance ring ---------------- */

export type RingSegment = { label: string; value: number; tone: string };

/**
 * Four concentric arcs — the Body Balance scorecard rendered as a dial.
 * Deliberately four separate readings rather than one composite score:
 * a single number invites comparison, which C6 forbids.
 */
export function BalanceRing({
  segments,
  caption,
}: {
  segments: readonly RingSegment[];
  caption?: string;
}) {
  const cx = 90;
  const cy = 90;
  const sweep = 250; // leaves a 110° gap at the base, where the arcs are read
  const start = -125;
  // Arcs must not close on the centre. The stroke thins as segments are added
  // so six readings stay legible in the same footprint as four.
  const stroke = Math.max(5, Math.min(9, 54 / segments.length));

  return (
    <div className="ring">
      <svg viewBox="0 0 180 180" role="img" aria-label={caption ?? 'Body Balance scorecard'}>
        {segments.map((s, i) => {
          const radius = 78 - i * (62 / segments.length);
          const end = start + (sweep * s.value) / 100;
          return (
            <g key={s.label}>
              <path
                d={arc(cx, cy, radius, start, start + sweep)}
                className="ring__track"
                fill="none"
                style={{ strokeWidth: stroke }}
              />
              <path
                d={arc(cx, cy, radius, start, end)}
                className="ring__fill"
                fill="none"
                style={{ stroke: s.tone, strokeWidth: stroke, animationDelay: `${i * 110}ms` }}
              />
            </g>
          );
        })}
      </svg>
      <ul className="ring__key">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.tone }} aria-hidden="true" />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- sparkline ---------------- */

/**
 * Completion rate over 14 days. Completion — not minutes moved — is the
 * north-star metric under Law 1, so it is the series shown first.
 */
export function Spark({
  series,
  label,
  tone = 'var(--mq-teal)',
  band,
}: {
  series: readonly number[];
  label: string;
  tone?: string;
  band?: [number, number];
}) {
  const w = 320;
  const h = 96;
  const pad = 6;
  const lo = Math.min(...series) - 6;
  const hi = Math.max(...series) + 6;
  const pts = series.map((v, i) => ({
    x: pad + (i * (w - pad * 2)) / (series.length - 1),
    y: pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo)),
  }));
  const line = smooth(pts);
  const area = `${line} L ${r2(pts[pts.length - 1].x)} ${h} L ${r2(pts[0].x)} ${h} Z`;
  const last = pts[pts.length - 1];
  const y = (v: number) => r2(pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo)));

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {band && (
        <rect
          x="0"
          y={y(band[1])}
          width={w}
          height={r2(y(band[0]) - y(band[1]))}
          className="spark__band"
        />
      )}
      <path d={area} className="spark__area" style={{ fill: tone }} />
      <path d={line} className="spark__line" style={{ stroke: tone }} fill="none" />
      <circle cx={last.x} cy={last.y} r="4.5" style={{ fill: tone }} className="spark__dot" />
    </svg>
  );
}

/* ---------------- comparison bars ---------------- */

export function CompareBars({
  rows,
  max = 100,
  unit = '%',
}: {
  rows: ReadonlyArray<{ label: string; value: number; tone: string; note?: string }>;
  max?: number;
  unit?: string;
}) {
  return (
    <ul className="cbars">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="cbars__head">
            <span>{row.label}</span>
            <b style={{ color: row.tone }}>
              {row.value}
              {unit}
            </b>
          </div>
          <div className="cbars__track">
            <div
              className="cbars__fill"
              style={{ width: `${(row.value / max) * 100}%`, background: row.tone }}
            />
          </div>
          {row.note && <p className="cbars__note">{row.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- day timeline ---------------- */

export type DaySlot = 'busy' | 'gap' | 'snap' | 'held';

const SLOT_LABEL: Record<DaySlot, string> = {
  busy: 'Committed',
  gap: 'Gap found, unused',
  snap: 'Mission delivered and completed',
  held: 'Held — prompt suppressed',
};

/**
 * A working day as the Context Engine sees it. The point of the graphic
 * is the ratio: many gaps are found, few are used, and a held slot is a
 * success (Law 2) rather than a miss.
 */
export function DayTimeline({ slots, from = 7 }: { slots: readonly DaySlot[]; from?: number }) {
  return (
    <div className="tl">
      <div className="tl__row" role="img" aria-label="A working day of verified movement gaps">
        {slots.map((s, i) => (
          <span
            key={`${s}-${i}`}
            className={`tl__cell tl__cell--${s}`}
            style={{ animationDelay: `${i * 26}ms` }}
            title={`${String(from + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'} — ${SLOT_LABEL[s]}`}
          />
        ))}
      </div>
      <div className="tl__axis">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>
            {String(from + Math.round((slots.length * f) / 2)).padStart(2, '0')}:00
          </span>
        ))}
      </div>
      <ul className="tl__key">
        {(['busy', 'gap', 'snap', 'held'] as const).map((s) => (
          <li key={s}>
            <i className={`tl__cell tl__cell--${s}`} aria-hidden="true" />
            {SLOT_LABEL[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- donut ---------------- */

export function Donut({
  slices,
  centre,
  sub,
}: {
  slices: ReadonlyArray<{ label: string; value: number; tone: string }>;
  centre: string;
  sub: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  let cursor = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${centre} ${sub}`}>
        {slices.map((s, i) => {
          const from = (cursor / total) * 360;
          cursor += s.value;
          const to = (cursor / total) * 360;
          return (
            <path
              key={s.label}
              d={arc(70, 70, 56, from, to - 2)}
              fill="none"
              className="donut__seg"
              style={{ stroke: s.tone, animationDelay: `${i * 90}ms` }}
            />
          );
        })}
        <text x="70" y="70" className="donut__n" textAnchor="middle">
          {centre}
        </text>
        <text x="70" y="88" className="donut__s" textAnchor="middle">
          {sub}
        </text>
      </svg>
      <ul className="donut__key">
        {slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.tone }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- age spectrum columns ---------------- */

/**
 * One column per age mode, height mapped to the daily Snap cap. It makes
 * the dosing philosophy legible at a glance: the middle of life carries
 * the most, the ends carry the least, and nobody carries nothing.
 */
export function AgeColumns({
  columns,
}: {
  columns: ReadonlyArray<{
    key: string;
    label: string;
    range: string;
    cap: number;
    tone: string;
  }>;
}) {
  const max = Math.max(...columns.map((c) => c.cap));
  return (
    <div className="agec" role="img" aria-label="Daily Snap cap by age mode">
      {columns.map((c, i) => (
        <div className="agec__col" key={c.key}>
          <div className="agec__val">{c.cap}</div>
          <div className="agec__track">
            <div
              className="agec__fill"
              style={{
                height: `${(c.cap / max) * 100}%`,
                background: c.tone,
                animationDelay: `${i * 90}ms`,
              }}
            />
          </div>
          <div className="agec__label" style={{ color: c.tone }}>
            {c.label}
          </div>
          <div className="agec__range">{c.range}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- radar wheel ---------------- */

/**
 * The FoodLens 360° wheel. Twelve dimensions, no composite score — a
 * single "health rating" is exactly the number the product refuses to
 * produce.
 */
export function Radar({
  axes,
  values,
  tone = 'var(--mq-orange)',
  size = 240,
}: {
  axes: readonly string[];
  values: readonly number[];
  tone?: string;
  size?: number;
}) {
  const c = size / 2;
  const rMax = c - 60; // room for the axis labels
  const step = 360 / axes.length;
  const pts = values.map((v, i) => polar(c, c, (rMax * v) / 100, i * step));
  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      className="radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Twelve-dimension nutrition wheel"
    >
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={c} cy={c} r={r2(rMax * f)} className="radar__grid" fill="none" />
      ))}
      {axes.map((a, i) => {
        const p = polar(c, c, rMax, i * step);
        return <line key={a} x1={c} y1={c} x2={p.x} y2={p.y} className="radar__spoke" />;
      })}
      <polygon points={poly} className="radar__area" style={{ fill: tone, stroke: tone }} />
      {pts.map((p, i) => (
        <circle key={axes[i]} cx={p.x} cy={p.y} r="2.8" style={{ fill: tone }} />
      ))}
      {/* §21 — a chart without visible labels is not a permitted chart. */}
      {axes.map((a, i) => {
        const deg = i * step;
        const p = polar(c, c, rMax + 12, deg);
        const anchor = deg < 4 || deg > 356 || Math.abs(deg - 180) < 4
          ? 'middle'
          : deg < 180
            ? 'start'
            : 'end';
        return (
          <text key={a} x={p.x} y={r2(p.y + 3.5)} className="radar__label" textAnchor={anchor}>
            {a}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------------- stat tile ---------------- */

export function Stat({
  k,
  v,
  sub,
  tone,
  children,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="stat" style={tone ? { ['--tone' as string]: tone } : undefined}>
      <div className="stat__k">{k}</div>
      <div className="stat__v">{v}</div>
      {children}
      {sub && <p className="stat__s">{sub}</p>}
    </article>
  );
}

/* ---------------- heatmap ---------------- */

/**
 * Sedentary and movement pattern by day and hour. §20.
 * Intensity is carried by opacity *and* by a printed value on hover, so the
 * chart is not colour-only.
 */
export function Heatmap({
  rows,
  cols,
  values,
  tone = 'var(--mq-teal)',
  label,
}: {
  rows: readonly string[];
  cols: readonly string[];
  /** values[rowIndex][colIndex], 0–100 */
  values: readonly (readonly number[])[];
  tone?: string;
  label: string;
}) {
  return (
    <div className="heat" role="img" aria-label={label}>
      <div className="heat__grid" style={{ gridTemplateColumns: `54px repeat(${cols.length}, 1fr)` }}>
        <span />
        {cols.map((c) => (
          <span className="heat__col" key={c}>
            {c}
          </span>
        ))}
        {rows.map((r, ri) => (
          <Fragment key={r}>
            <span className="heat__row">{r}</span>
            {cols.map((c, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              return (
                <i
                  key={`${r}-${c}`}
                  className="heat__cell"
                  title={`${r} ${c} — ${v}%`}
                  style={{ background: tone, opacity: 0.12 + (v / 100) * 0.88 }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="heat__scale">
        <span>Less movement</span>
        <i style={{ background: tone, opacity: 0.15 }} />
        <i style={{ background: tone, opacity: 0.4 }} />
        <i style={{ background: tone, opacity: 0.65 }} />
        <i style={{ background: tone, opacity: 0.9 }} />
        <span>More</span>
      </div>
    </div>
  );
}

/* ---------------- fan chart ---------------- */

/**
 * A trajectory with honest uncertainty. §19 — conservative, expected and
 * optimised routes, drawn as a widening cone rather than a single line,
 * because a single line is a promise nobody can keep.
 */
export function FanChart({
  expected,
  spread,
  label,
  tone = 'var(--mq-purple)',
}: {
  expected: readonly number[];
  /** half-width of the cone at each point, same length as `expected` */
  spread: readonly number[];
  label: string;
  tone?: string;
}) {
  const w = 340;
  const h = 150;
  const pad = 10;
  const all = expected.flatMap((v, i) => [v - spread[i], v + spread[i]]);
  const lo = Math.min(...all) - 2;
  const hi = Math.max(...all) + 2;
  const x = (i: number) => r2(pad + (i * (w - pad * 2)) / (expected.length - 1));
  const y = (v: number) => r2(pad + (h - pad * 2) * (1 - (v - lo) / (hi - lo)));

  const upper = expected.map((v, i) => ({ x: x(i), y: y(v + spread[i]) }));
  const lower = expected.map((v, i) => ({ x: x(i), y: y(v - spread[i]) }));
  const mid = expected.map((v, i) => ({ x: x(i), y: y(v) }));

  const cone =
    `${smooth(upper)} L ${lower[lower.length - 1].x} ${lower[lower.length - 1].y} ` +
    `${smooth([...lower].reverse()).replace(/^M [\d.]+ [\d.]+/, '')} Z`;

  return (
    <svg className="fan" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <path d={cone} style={{ fill: tone }} className="fan__cone" />
      <path d={smooth(mid)} style={{ stroke: tone }} className="fan__line" fill="none" />
      <circle cx={mid[0].x} cy={mid[0].y} r="3.6" style={{ fill: tone }} />
      <circle
        cx={mid[mid.length - 1].x}
        cy={mid[mid.length - 1].y}
        r="4.5"
        style={{ fill: tone }}
      />
    </svg>
  );
}

/* ---------------- waterfall ---------------- */

/**
 * What is helping and what is blocking, in one view. §19.
 * Positive and negative bars are distinguished by direction and by a
 * printed sign, not by colour alone.
 */
export function Waterfall({
  items,
  label,
}: {
  items: ReadonlyArray<{ name: string; delta: number }>;
  label: string;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.delta)));
  return (
    <ul className="wfall" role="img" aria-label={label}>
      {items.map((i) => {
        const pos = i.delta >= 0;
        return (
          <li key={i.name}>
            <span className="wfall__name">{i.name}</span>
            <span className="wfall__track">
              <i
                className={`wfall__bar wfall__bar--${pos ? 'up' : 'down'}`}
                style={{ width: `${(Math.abs(i.delta) / max) * 50}%` }}
              />
            </span>
            <b className={pos ? 'is-up' : 'is-down'}>
              {pos ? '+' : '−'}
              {Math.abs(i.delta)}
            </b>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- stacked bar ---------------- */

export function StackedBars({
  bars,
  keys,
  label,
}: {
  bars: ReadonlyArray<{ name: string; parts: readonly number[] }>;
  keys: ReadonlyArray<{ name: string; tone: string }>;
  label: string;
}) {
  const max = Math.max(...bars.map((b) => b.parts.reduce((a, c) => a + c, 0)));
  return (
    <div className="sbars" role="img" aria-label={label}>
      <div className="sbars__plot">
        {bars.map((b) => (
          <div className="sbars__col" key={b.name}>
            <div className="sbars__stack">
              {b.parts.map((p, i) => (
                <i
                  key={keys[i].name}
                  style={{ height: `${(p / max) * 100}%`, background: keys[i].tone }}
                  title={`${b.name} · ${keys[i].name} — ${p}`}
                />
              ))}
            </div>
            <span className="sbars__label">{b.name}</span>
          </div>
        ))}
      </div>
      <ul className="donut__key">
        {keys.map((k) => (
          <li key={k.name}>
            <i style={{ background: k.tone }} aria-hidden="true" />
            {k.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- confidence cone ---------------- */

/**
 * FoodLens returns a range, not a figure. §18, §20.
 * The cone's width is the honest part of the answer.
 */
export function ConfidenceCone({
  min,
  likely,
  max,
  unit,
  confidence,
}: {
  min: number;
  likely: number;
  max: number;
  unit: string;
  confidence: string;
}) {
  const span = max - min || 1;
  const pos = ((likely - min) / span) * 100;
  return (
    <div className="cone">
      <div className="cone__figure">
        <span className="cone__likely">
          {likely}
          <em>{unit}</em>
        </span>
        <span className="cone__range">
          {min}–{max} {unit}
        </span>
      </div>
      <div className="cone__track" role="img" aria-label={`Estimated ${min} to ${max} ${unit}`}>
        <i className="cone__band" />
        <i className="cone__mark" style={{ left: `${pos}%` }} />
      </div>
      <p className="cone__note">
        Confidence: <strong>{confidence}</strong>. A photograph cannot resolve portion size,
        hidden ingredients or cooking method exactly, so this stays a range.
      </p>
    </div>
  );
}

/* ---------------- UK traffic lights ---------------- */

const BAND_TONE = {
  green: 'var(--mq-positive)',
  amber: 'var(--mq-monitor)',
  red: 'var(--mq-action)',
} as const;

/**
 * Front-of-pack traffic lights, per 100g. §18.
 * The band name is printed next to the colour — the colour alone is never
 * the signal.
 */
export function TrafficLights({
  rows,
}: {
  rows: ReadonlyArray<{
    name: string;
    grams: number;
    band: keyof typeof BAND_TONE;
    of: number;
  }>;
}) {
  return (
    <ul className="tlights">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="tlights__name">{r.name}</span>
          <span className="tlights__track">
            <i
              style={{
                width: `${Math.min(100, (r.grams / r.of) * 100)}%`,
                background: BAND_TONE[r.band],
              }}
            />
          </span>
          <b>{r.grams}g</b>
          <span className="tlights__band" style={{ color: BAND_TONE[r.band] }}>
            {r.band === 'green' ? 'Low' : r.band === 'amber' ? 'Medium' : 'High'}
          </span>
        </li>
      ))}
    </ul>
  );
}
