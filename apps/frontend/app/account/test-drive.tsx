'use client';

import { useState } from 'react';
import { modeForAge } from '@jessmove/shared';
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
  items: { name: string; confidencePct: number }[];
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
  frontOfPack: Record<string, 'green' | 'amber' | 'red'> | null;
  per100g: { fatG: number; saturatesG: number; sugarsG: number; saltG: number } | null;
  wheel: Record<string, number | null>;
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

  const analyse = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    // On a phone this opens the camera directly.
    input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setNote(null);
      setResult(null);
      try {
        // Camera photos are far bigger than the request pipeline allows;
        // shrink in the browser so the upload always fits and travels fast.
        const photo = await shrinkImage(file, 1280, 0.85);
        const res = await fetch(`${apiBase()}/foodlens/analyze`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            age: me.age,
            mimeType: photo.mimeType,
            dataBase64: photo.dataBase64,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? `${res.status}`);
        const analysis = json.data as FoodLensResult;
        setResult(analysis);
        // The energy figure becomes history, so a meal can later be read
        // against the member's own fortnight rather than a population.
        const energy = analysis.energy && !('withheld' in analysis.energy) ? analysis.energy.likely : undefined;
        onActivity?.(await recordActivity({ kind: 'food_checked', ...(energy ? { value: energy } : {}) }));
      } catch (e) {
        setNote(`analysis failed: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const named = result?.allergens.filter((a) => a.status !== 'unknown') ?? [];

  return (
    <section className="acct__module">
      <h3>
        FoodLens 360° <span className="tdv__chip">live</span>
      </h3>
      <p className="tdv__what">
        Photograph any meal and see what is on the plate. You get an honest energy range
        rather than a fake exact number, and never a judgement about you or the food.
      </p>
      <button className="btn btn--primary" type="button" onClick={analyse} disabled={busy}>
        {busy ? 'Reading the plate…' : 'Photograph a meal'}
      </button>
      {note && <p className="acct__note">{note}</p>}

      {result && (
        <div className="tdv__result">
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
                  <em>{Math.round(i.confidencePct)}% sure</em>
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

          {result.frontOfPack && Object.keys(result.frontOfPack).length > 0 && (
            <>
              <h4 className="fl__h">Per 100g · UK front-of-pack</h4>
              <TrafficLights bands={result.frontOfPack} per100g={result.per100g} />
              <p className="fl__note">
                Bands follow the published UK thresholds. The word is printed beside the
                colour, because colour on its own is not an accessible signal.
              </p>
            </>
          )}

          <h4 className="fl__h">The Food Intelligence Wheel</h4>
          <FoodWheel wheel={result.wheel ?? {}} />

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
          mode: modeForAge(me.age),
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
    <section className="acct__module">
      <h3>
        Micro-Movement <span className="tdv__chip">{modeForAge(me.age)} mode</span>
      </h3>
      <p className="tdv__what">
        One short movement you can do right now, wherever you are — no kit, no changing, no
        gym. It is sized for your age and checked for safety before you ever see it.
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
