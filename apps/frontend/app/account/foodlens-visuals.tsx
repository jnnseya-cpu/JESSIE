'use client';

/**
 * FoodLens, drawn.
 *
 * The engine already returns a range, a confidence level, a macro split,
 * front-of-pack bands and fourteen allergen verdicts. Reading them as a
 * paragraph wastes all of it — a range is a shape, a macro split is a
 * proportion, and "unknown" needs to look different from "absent" at a
 * glance. Every figure below comes from the response; nothing is styled
 * into looking more certain than it is.
 */

export interface Energy {
  min: number;
  likely: number;
  max: number;
  unit: string;
  source: string;
  confidence: string;
}

export interface TrafficLight {
  nutrient: string;
  grams: number;
  band: 'green' | 'amber' | 'red';
  derived: boolean;
  basis: 'label' | 'estimate' | 'calculated';
}

/** How the figure was arrived at. A row never poses as more than it is. */
const BASIS_WORD: Record<string, string> = {
  label: 'from the label',
  estimate: 'estimated',
  calculated: 'worked out',
};

const BAND_WORD: Record<string, string> = { green: 'low', amber: 'medium', red: 'high' };

/** The meal-intelligence gauge: how well the plate is understood. */
export function IntelligenceGauge({
  score,
  band,
}: {
  score: number;
  band: string;
}) {
  const r = 52;
  const circumference = Math.PI * r; // a half circle
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className="fl__gauge">
      <svg viewBox="0 0 130 74" width="130" height="74" role="img" aria-label={`Meal intelligence ${score} of 100`}>
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke="rgba(244,250,249,0.14)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke="url(#flgauge)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
        <defs>
          <linearGradient id="flgauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00a99d" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        <text x="65" y="58" textAnchor="middle" fontSize="26" fontWeight="700" fill="#f4faf9">
          {score}
        </text>
      </svg>
      <div>
        <strong className="fl__gaugeband">{band}</strong>
        <span className="fl__gaugesays">
          How much we know about this plate — not a rating of the food.
        </span>
      </div>
    </div>
  );
}

/** The energy cone: a range you can see, with the likely point marked. */
export function EnergyRange({ energy }: { energy: Energy }) {
  const span = Math.max(1, energy.max - energy.min);
  const markerAt = ((energy.likely - energy.min) / span) * 100;

  return (
    <div className="fl__energy">
      <div className="fl__energyhead">
        <span className="fl__big">{energy.likely}</span>
        <span className="fl__unit">{energy.unit} most likely</span>
        <span className={`fl__conf fl__conf--${energy.confidence}`}>{energy.confidence} confidence</span>
      </div>
      <div className="fl__range" role="img" aria-label={`Between ${energy.min} and ${energy.max} ${energy.unit}`}>
        <span className="fl__rangebar" />
        <span className="fl__rangemark" style={{ left: `${Math.max(2, Math.min(98, markerAt))}%` }} />
      </div>
      <div className="fl__rangeends">
        <span>{energy.min}</span>
        <span>{energy.max}</span>
      </div>
      <p className="fl__note">
        A photograph cannot resolve portion size, hidden oil or cooking method exactly, so this
        stays a range. Source: {energy.source.replace(/_/g, ' ')}.
      </p>
    </div>
  );
}

/** Where the energy comes from — the macro split as proportion, not text. */
export function MacroBars({
  macros,
}: {
  macros: { proteinPct: number; carbohydratePct: number; fatPct: number };
}) {
  const parts = [
    { key: 'Protein', value: macros.proteinPct, colour: '#2dd4bf' },
    { key: 'Carbohydrate', value: macros.carbohydratePct, colour: '#60a5fa' },
    { key: 'Fat', value: macros.fatPct, colour: '#fbbf24' },
  ];
  return (
    <div className="fl__macros">
      <div className="fl__stack" role="img" aria-label="Macro split">
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${p.value}%`, background: p.colour }} />
        ))}
      </div>
      <div className="fl__legend">
        {parts.map((p) => (
          <span key={p.key}>
            <i style={{ background: p.colour }} /> {p.key} {p.value}%
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * UK front-of-pack bands. The word is printed beside the colour.
 *
 * The last guard against a fabricated panel. The analysis already refuses
 * to send a set of zeros — a nutrient nobody measured is absent, not 0g —
 * but four tiles reading "0g LOW" is the single worst thing this module
 * could put on a screen, because it looks like a measurement and is not
 * one. If a set of zeros ever reaches here, from a cached old reply or a
 * future bug, nothing is drawn.
 */
export function TrafficLights({ lights }: { lights: TrafficLight[] }) {
  if (lights.length === 0 || lights.every((l) => !(l.grams > 0))) return null;

  return (
    <div className="fl__lights">
      {lights.map((l) => (
        <div key={l.nutrient} className={`fl__light fl__light--${l.band}`}>
          <span className="fl__lightname">{l.nutrient}</span>
          <span className="fl__lightval">{Math.round(l.grams * 10) / 10}g</span>
          <span className="fl__lightband">{BAND_WORD[l.band] ?? l.band}</span>
          <span className="fl__lightbasis">{BASIS_WORD[l.basis] ?? l.basis}</span>
        </div>
      ))}
    </div>
  );
}

const WHEEL_LABELS: Record<string, string> = {
  energyBalance: 'Energy',
  proteinStrength: 'Protein',
  fibreStrength: 'Fibre',
  plantDiversity: 'Plants',
  fatQuality: 'Fat quality',
  sugarLoad: 'Sugars',
  saltLoad: 'Salt',
  processingLevel: 'Processing',
  portionAlignment: 'Portion',
  personalFit: 'Personal fit',
  allergenConfidence: 'Allergens',
  mealConfidence: 'Confidence',
};

/**
 * The twelve-axis wheel. An axis with no evidence is drawn faintly at the
 * centre rather than guessed at — the empty spokes are the honest part.
 */
export function FoodWheel({ wheel }: { wheel: Record<string, number | null> }) {
  const axes = Object.keys(WHEEL_LABELS);
  const size = 240;
  const centre = size / 2;
  const radius = 82;

  const point = (index: number, value: number) => {
    const angle = (index / axes.length) * Math.PI * 2 - Math.PI / 2;
    const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return [centre + Math.cos(angle) * r, centre + Math.sin(angle) * r];
  };

  // Unknown axes are absent, not zero. A polygon dragged through the
  // centre reads as "scored badly" when the truth is "not measured", so
  // only known axes are joined; a lone known axis is drawn as a point.
  const knownAxes = axes
    .map((axis, i) => ({ axis, i, value: wheel[axis] }))
    .filter((a): a is { axis: string; i: number; value: number } => typeof a.value === 'number');
  const polygon = knownAxes.map((a) => point(a.i, a.value).join(',')).join(' ');

  return (
    <div className="fl__wheelwrap">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" role="img" aria-label="Food intelligence wheel">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <circle
            key={ring}
            cx={centre}
            cy={centre}
            r={radius * ring}
            fill="none"
            stroke="rgba(244,250,249,0.09)"
          />
        ))}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 100);
          return <line key={axis} x1={centre} y1={centre} x2={x} y2={y} stroke="rgba(244,250,249,0.09)" />;
        })}
        {knownAxes.length >= 3 && (
          <polygon points={polygon} fill="rgba(45,212,191,0.22)" stroke="#2dd4bf" strokeWidth="1.6" />
        )}
        {knownAxes.map((a) => {
          const [px, py] = point(a.i, a.value);
          return <circle key={`p-${a.axis}`} cx={px} cy={py} r="3" fill="#2dd4bf" />;
        })}
        {axes.map((axis, i) => {
          const [x, y] = point(i, 128);
          const value = wheel[axis];
          return (
            <text
              key={`l-${axis}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8.5"
              fill={typeof value === 'number' ? 'rgba(244,250,249,0.75)' : 'rgba(244,250,249,0.3)'}
            >
              {WHEEL_LABELS[axis]}
            </text>
          );
        })}
      </svg>
      <p className="fl__note">
        {knownAxes.length} of {axes.length} dimensions could be read from this photograph.
        A faint label is an axis nothing could tell us — not a low score. There is no
        composite health rating, because that is the number this product refuses to invent.
      </p>
    </div>
  );
}

/** Fourteen UK allergens. Unknown is a warning, never a pass. */
export function AllergenGrid({
  allergens,
}: {
  allergens: { allergen: string; status: string }[];
}) {
  return (
    <div className="fl__allergens">
      {allergens.map((a) => (
        <span key={a.allergen} className={`fl__alg fl__alg--${a.status}`}>
          {a.status === 'present' ? '!' : a.status === 'absent' ? '✓' : '?'}{' '}
          {a.allergen.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}
