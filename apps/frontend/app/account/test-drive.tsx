'use client';

import { useState } from 'react';
import {
  AGENT_REGISTRY,
  AGE_MODE_DEFINITIONS,
  MOVEMENT_VARIANTS,
  NINE_QUESTIONS,
  OPPORTUNITY_MULTIPLIERS,
  OPPORTUNITY_PENALTIES,
  OPPORTUNITY_THRESHOLD,
  VARIANT_LABELS,
  modeForAge,
} from '@jessmove/shared';
import { apiBase } from '../api-base';
import { shrinkImage } from './image-shrink';
import { recordActivity, type Dashboard } from './dashboard';
import {
  AllergenGrid,
  EnergyRange,
  FoodWheel,
  IntelligenceGauge,
  MacroBars,
  TrafficLights,
} from './foodlens-visuals';

/**
 * The two live test surfaces on the account console: point FoodLens at a
 * real meal, and ask the engine for your next Snap. Both call the same
 * production endpoints the API console documents — nothing here is
 * illustrative, and the under-18 rules the caller sees are the server's
 * own, not the page's.
 */

interface Subject {
  userId: string;
  age: number;
}

/* ------------------------------------------------------------------ *
 * FoodLens — photograph a meal, get the honest analysis
 * ------------------------------------------------------------------ */

interface FoodLensResult {
  mode: 'live' | 'sandbox';
  note?: string;
  items: { name: string; confidencePct: number | null }[];
  intelligence: { score: number; band: string; says: string; caption: string };
  energy:
    | null
    | { withheld: true; why: string }
    | {
        min: number;
        likely: number;
        max: number;
        unit: string;
        source: string;
        confidence: string;
      };
  macros: { proteinPct: number; carbohydratePct: number; fatPct: number } | null;
  frontOfPack:
    | {
        nutrient: string;
        grams: number | null;
        band: 'green' | 'amber' | 'red' | null;
        derived: boolean;
        basis: 'label' | 'estimate' | 'calculated' | 'reference' | 'unmeasured';
      }[]
    | null;
  wheel: Record<string, number | null>;
  capture: { checks: { check: string; passed: boolean; detail: string }[]; passRate: number };
  swaps: { level: number; action: string; effect: string; keeps: string }[];
  plants: { distinct: string[]; count: number };
  allergens: { allergen: string; status: string; note?: string }[];
  underEighteen: boolean;
}

export function FoodLensModule({
  me,
  onActivity,
}: {
  me: Subject;
  onActivity?: (d: Dashboard | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<FoodLensResult | null>(null);

  const [photos, setPhotos] = useState<{ mimeType: string; dataBase64: string }[]>([]);
  const [barcode, setBarcode] = useState('');
  const [knownKcal, setKnownKcal] = useState('');

  /** Adds a photograph. Up to three of the same meal, from any angle. */
  const addPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setNote(null);
      try {
        const photo = await shrinkImage(file, 1280, 0.85);
        setPhotos((p) => [...p, photo].slice(0, 3));
      } catch (e) {
        setNote(`that photo could not be read: ${(e as Error).message}`);
      }
    };
    input.click();
  };

  const analyse = async () => {
    if (photos.length === 0) {
      addPhoto();
      return;
    }
    setBusy(true);
    setNote(null);
    setResult(null);
    try {
      const res = await fetch(`${apiBase()}/foodlens/analyze`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          age: me.age,
          photos,
          ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
          ...(knownKcal && Number(knownKcal) > 0 ? { userConfirmedKcal: Number(knownKcal) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      const analysis = json.data as FoodLensResult;
      setResult(analysis);
      const energy = analysis.energy && !('withheld' in analysis.energy) ? analysis.energy.likely : undefined;
      onActivity?.(await recordActivity({ kind: 'food_checked', ...(energy ? { value: energy } : {}) }));
    } catch (e) {
      setNote(`analysis failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const named = result?.allergens.filter((a) => a.status !== 'unknown') ?? [];

  return (
    <section className="acct__module acct__module--food">
      <h3>
        FoodLens 360° <span className="tdv__chip">live</span>
      </h3>
      <p className="tdv__what">
        Photograph any meal and see what is on the plate. You get an honest energy range
        rather than a fake exact number, and never a judgement about you or the food.
      </p>
      <div className="fl__capture">
        <div className="fl__shots">
          {photos.map((p, i) => (
            <span key={i} className="fl__shot">
              <img src={`data:${p.mimeType};base64,${p.dataBase64}`} alt={`Photo ${i + 1}`} />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
          {photos.length < 3 && (
            <button type="button" className="fl__addshot" onClick={addPhoto}>
              <span>+</span>
              {photos.length === 0 ? 'Photograph the meal' : 'Add another angle'}
            </button>
          )}
        </div>
        {photos.length === 1 && (
          <p className="fl__note">
            One more photo from the side resolves depth, which is most of portion size.
          </p>
        )}

        <div className="tdv__askrow">
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Barcode, if it came in a packet"
            aria-label="Barcode"
            inputMode="numeric"
            maxLength={48}
          />
          <input
            value={knownKcal}
            onChange={(e) => setKnownKcal(e.target.value)}
            placeholder="kcal, if you know it"
            aria-label="Known calories"
            inputMode="numeric"
          />
        </div>
        <p className="fl__note">
          A barcode beats any estimate, and what you tell us outranks everything — including a
          manufacturer&rsquo;s label. You know what went on the plate; the model is guessing.
        </p>

        <button
          className="btn btn--primary"
          type="button"
          onClick={() => void analyse()}
          disabled={busy}
        >
          {busy ? 'Reading the plate…' : photos.length === 0 ? 'Photograph a meal' : `Analyse ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
        </button>
      </div>
      {note && <p className="acct__note">{note}</p>}

      {result && (
        <div className="tdv__result fl__reveal">
          {photos.length > 0 && (
            <figure className="fl__hero">
              <img src={`data:${photos[0]!.mimeType};base64,${photos[0]!.dataBase64}`} alt="The meal you photographed" />
              <figcaption>
                {result.items.length > 0 ? (
                  <>
                    <span className="fl__herofound">Found on your plate</span>
                    <span className="fl__heronames">
                      {result.items.map((i) => i.name).join(' · ')}
                    </span>
                  </>
                ) : (
                  <span className="fl__herofound">Nothing on this plate could be named</span>
                )}
              </figcaption>
            </figure>
          )}
          <p className="tdv__mode">
            {result.mode === 'live'
              ? 'Analysed by the live vision engine.'
              : 'Sandbox result — the vision model was not reachable for this call.'}
            {result.note ? ` ${result.note}` : ''}
          </p>

          {result.items.length > 0 ? (
            <ul className="tdv__items">
              {result.items.map((i) => (
                <li key={i.name}>
                  <span>{i.name}</span>
                  <em>
                    {typeof i.confidencePct === 'number'
                      ? `${Math.round(i.confidencePct)}% sure`
                      : 'certainty not stated'}
                  </em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="acct__note">No food could be identified in that photo.</p>
          )}

          <IntelligenceGauge score={result.intelligence.score} band={result.intelligence.band} />
          <p className="fl__note">{result.intelligence.says}</p>

          {result.energy && 'withheld' in result.energy ? (
            <p className="tdv__line tdv__line--guard">{result.energy.why}</p>
          ) : result.energy ? (
            <EnergyRange energy={result.energy} />
          ) : null}

          {result.macros && (
            <>
              <h4 className="fl__h">Where the energy comes from</h4>
              <MacroBars macros={result.macros} />
            </>
          )}

          {/* Always drawn. A nutrient nobody measured says so in its own
              tile rather than the table quietly disappearing. */}
          {result.frontOfPack && result.frontOfPack.length > 0 && (
            <>
              <h4 className="fl__h">Per 100g · UK front-of-pack</h4>
              <TrafficLights lights={result.frontOfPack} />
              <p className="fl__note">
                Bands follow the published UK thresholds, and the word is printed beside the
                colour because colour alone is not an accessible signal. Each figure says how
                it was arrived at: <strong>from the label</strong> when a barcode or a
                confirmed label supplied it, <strong>worked out</strong> when it came from the
                plate&rsquo;s own macros and weight, <strong>typical for this dish</strong> when
                it came from published composition figures for a food of that name, and{' '}
                <strong>estimated</strong> when the model read it from the photograph. A tile
                reading <strong>not measured</strong>
                is exactly that — nobody measured it, and this refuses to print a zero in its
                place, because 0g bands as LOW and LOW is a claim. Scan the barcode and every
                one of them becomes a fact off the packet.
              </p>
            </>
          )}

          {result.capture && (
            <>
              <h4 className="fl__h">Capture quality · {result.capture.passRate}% passed</h4>
              <ul className="fl__checks">
                {result.capture.checks.map((c) => (
                  <li key={c.check} className={c.passed ? 'fl__check fl__check--ok' : 'fl__check'}>
                    <span>{c.passed ? '✓' : '!'}</span>
                    <div>
                      <strong>{c.check}</strong>
                      <em>{c.detail}</em>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.plants && result.plants.count > 0 && (
            <>
              <h4 className="fl__h">Plant diversity · {result.plants.count} on this plate</h4>
              <div className="tdv__chips tdv__chips--static">
                {result.plants.distinct.map((p) => (
                  <span key={p} className="fl__plant">
                    {p}
                  </span>
                ))}
              </div>
              <p className="fl__note">
                A count of distinct plants, not a target you are failing.
              </p>
            </>
          )}

          <h4 className="fl__h">The Food Intelligence Wheel</h4>
          <FoodWheel wheel={result.wheel ?? {}} />

          {result.swaps && result.swaps.length > 0 && (
            <>
              <h4 className="fl__h">The swap ladder · smallest change first</h4>
              <ol className="fl__ladder">
                {result.swaps.map((sw) => (
                  <li key={sw.level}>
                    <strong>{sw.action}</strong>
                    <em>{sw.effect}</em>
                    <span>Keeps: {sw.keeps}</span>
                  </li>
                ))}
              </ol>
              <p className="fl__note">
                &ldquo;Choose something else&rdquo; is level five, because a suggestion that
                ignores what you actually feel like eating is a suggestion nobody takes. A
                short walk after a meal supports your movement — it never cancels out food.
              </p>
            </>
          )}

          <h4 className="fl__h">All 14 UK declarable allergens</h4>
          <AllergenGrid allergens={result.allergens} />
          <p className="fl__note">
            {named.length > 0
              ? 'Only a complete declaration from a verifiable source may say absent.'
              : 'Nothing here is declared by a source we can verify. FoodLens never claims an allergen is absent from a photograph — check the packet or ask, especially if a reaction would be serious.'}
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The engine — ask for your next Snap
 * ------------------------------------------------------------------ */

interface Snap {
  prescriptionId: string;
  movement: { name: string; category: string; variant: string };
  guide?: { what: string; steps: string[]; feel: string; stopIf: string };
  dose: { durationSeconds: number; rounds: number; tempo: string };
  expectedRpe: number;
  why: string;
  safety: { verdict: string; rulesEvaluated: number };
  sparksEstimate: number;
  expiresAt: string;
}

/** "96s × 1 round" is engine-speak. A person hears time. */
function friendlyDuration(dose: Snap['dose']): string {
  const total = dose.durationSeconds * dose.rounds;
  const minutes = total / 60;
  const time =
    minutes < 1.25
      ? 'about a minute'
      : minutes < 1.75
        ? 'about a minute and a half'
        : `about ${Math.round(minutes)} minutes`;
  return dose.rounds > 1 ? `${time}, in ${dose.rounds} short rounds` : time;
}

function friendlyEffort(rpe: number): string {
  if (rpe <= 2) return 'Very gentle';
  if (rpe <= 4) return 'Gentle — you could hold a conversation the whole way';
  if (rpe <= 6) return 'Moderate — working, but comfortable';
  return 'Strong effort';
}

interface Hold {
  held: true;
  reason: string;
  blocks: string[];
  retryAfterSeconds: number;
}

export function SnapModule({
  me,
  onActivity,
}: {
  me: Subject;
  onActivity?: (d: Dashboard | null) => void;
}) {
  const mode = modeForAge(me.age);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [done, setDone] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);

  const ask = async () => {
    setBusy(true);
    setNote(null);
    setSnap(null);
    setHold(null);
    try {
      const res = await fetch(`${apiBase()}/prescriptions/next`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: me.userId,
          mode,
          availableSeconds: 900,
          capabilityNormaliser: 1,
          permittedVariants: ['seated', 'standing'],
          signals: {
            userId: me.userId,
            motionState: 'still',
            locationClass: 'home',
            onCall: false,
            doNotDisturb: false,
            localHour: new Date().getHours(),
            snapsDeliveredToday: 0,
            dailyCap: 6,
            minutesSinceLastNudge: 120,
            consentedSignals: ['motion', 'device_state'],
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      const data = json.data as Snap | Hold;
      if ('held' in data && data.held) {
        setHold(data);
        onActivity?.(await recordActivity({ kind: 'snap_held', detail: data.blocks.join(', ') }));
      } else {
        const issued = data as Snap;
        setSnap(issued);
        setDone(false);
        onActivity?.(
          await recordActivity({ kind: 'snap_offered', category: issued.movement.category }),
        );
      }
    } catch (e) {
      setNote(`the engine said no: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acct__module acct__module--move">
      <h3>
        Micro-Movement <span className="tdv__chip">{modeForAge(me.age)} mode</span>
      </h3>
      <p className="tdv__what">
        One short movement you can do right now, wherever you are — no kit, no changing, no
        gym. It is sized for your age and checked for safety before you ever see it.
      </p>
      <div className="mm__facts">
        <span>
          <strong>{AGE_MODE_DEFINITIONS[modeForAge(me.age)].dailyCap}</strong> a day, maximum
        </span>
        <span>
          <strong>90–300s</strong> per Snap
        </span>
        <span>
          <strong>≤ 7%</strong> harder per week
        </span>
        <span>
          <strong>5/5</strong> variants required
        </span>
      </div>
      <div className="tdv__chips tdv__chips--static">
        {MOVEMENT_VARIANTS.map((v) => (
          <span key={v} className="fl__plant">
            {VARIANT_LABELS[v]}
          </span>
        ))}
      </div>
      <p className="fl__note">
        Every movement exists in all five variants before it may be published — independently
        authored, not degraded from the standing version. There is no override flag.
      </p>

      <button className="btn btn--primary" type="button" onClick={() => void ask()} disabled={busy}>
        {busy ? 'Asking the engine…' : 'Give me a Snap'}
      </button>
      {note && <p className="acct__note">{note}</p>}

      {hold && (
        <div className="tdv__result">
          <p className="tdv__line tdv__line--guard">
            The engine held back: {hold.reason} Try again in{' '}
            {Math.round(hold.retryAfterSeconds / 60)} minutes.
          </p>
        </div>
      )}

      {snap && (
        <div className="tdv__result">
          <p className="tdv__snapname">{snap.movement.name}</p>
          {snap.guide && <p className="tdv__line">{snap.guide.what}</p>}
          <p className="tdv__line">
            <strong>{friendlyDuration(snap.dose)}</strong>, taken slowly.{' '}
            {friendlyEffort(snap.expectedRpe)}.
          </p>

          {snap.guide && (
            <>
              <ol className="tdv__steps">
                {snap.guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="tdv__line">
                <strong>You should feel:</strong> {snap.guide.feel}
              </p>
              <p className="tdv__line tdv__line--guard">{snap.guide.stopIf}</p>
            </>
          )}

          <p className="tdv__line">{snap.why}</p>

          {/* The act that makes every chart on this page possible. */}
          <div className="tdv__chips">
            <button
              type="button"
              disabled={done}
              onClick={async () => {
                setDone(true);
                onActivity?.(
                  await recordActivity({
                    kind: 'snap_completed',
                    category: snap.movement.category,
                    seconds: snap.dose.durationSeconds * snap.dose.rounds,
                  }),
                );
              }}
            >
              {done ? 'Logged — nice one' : 'I did it'}
            </button>
          </div>

          <details className="mm__agents">
            <summary>How this moment was scored</summary>
            <p className="fl__note">
              Seven factors multiply and three penalties subtract, all normalised so no single
              input can dominate. Below {OPPORTUNITY_THRESHOLD} the OS says nothing at all —
              silence is a valid outcome, and it is logged as one.
            </p>
            <div className="mm__score">
              <div>
                <span className="fl__h">Multiplied</span>
                {OPPORTUNITY_MULTIPLIERS.map((k) => (
                  <span key={k} className="mm__factor mm__factor--plus">
                    × {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </span>
                ))}
              </div>
              <div>
                <span className="fl__h">Subtracted</span>
                {OPPORTUNITY_PENALTIES.map((k) => (
                  <span key={k} className="mm__factor mm__factor--minus">
                    − {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
            <p className="fl__note">
              Safety confidence sits in the multiplied half, so a zero there kills the
              recommendation however good the moment otherwise looks.
            </p>
          </details>

          <details className="mm__agents">
            <summary>The nine questions settled first</summary>
            <ol className="mm__nine">
              {NINE_QUESTIONS.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          </details>

          <details className="mm__agents">
            <summary>Which agents decided this</summary>
            <ul>
              {(['SIA', 'CTX', 'RX', 'SAFE', 'ADA'] as const).map((code) => {
                const agent = AGENT_REGISTRY[code];
                return agent ? (
                  <li key={code}>
                    <strong>{agent.name}</strong>
                    <em>{agent.output}</em>
                  </li>
                ) : null;
              })}
            </ul>
          </details>

          <p className="tdv__fine">
            Safety-checked against {snap.safety.rulesEvaluated} rules before it reached you ·
            worth ~{snap.sparksEstimate} Sparks when you finish · best used before{' '}
            {new Date(snap.expiresAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}
    </section>
  );
}
