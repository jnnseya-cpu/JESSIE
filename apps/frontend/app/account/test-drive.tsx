'use client';

import { useState } from 'react';
import { modeForAge } from '@jessmove/shared';
import { apiBase } from '../api-base';

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
  allergens: { allergen: string; status: string; note?: string }[];
  underEighteen: boolean;
}

export function FoodLensModule({ me }: { me: Subject }) {
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
      if (file.size > 10_000_000) {
        setNote('That photo is over 10MB — choose a smaller one.');
        return;
      }
      setBusy(true);
      setNote(null);
      setResult(null);
      try {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const res = await fetch(`${apiBase()}/foodlens/analyze`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            age: me.age,
            mimeType: file.type,
            dataBase64: btoa(binary),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? `${res.status}`);
        setResult(json.data as FoodLensResult);
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
        FoodLens <span className="tdv__chip">live</span>
      </h3>
      <p className="acct__note" style={{ marginTop: 0 }}>
        Photograph a meal and the vision engine reads the plate — items, an honest energy
        range, never a judgement.
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

          <p className="tdv__line">
            <strong>Meal intelligence:</strong> {result.intelligence.score}/100 —{' '}
            {result.intelligence.says}
          </p>

          {result.energy && 'withheld' in result.energy ? (
            <p className="tdv__line tdv__line--guard">{result.energy.why}</p>
          ) : result.energy ? (
            <p className="tdv__line">
              <strong>Energy:</strong> {result.energy.min}–{result.energy.max}{' '}
              {result.energy.unit} (most likely {result.energy.likely}) ·{' '}
              {result.energy.confidence} confidence
            </p>
          ) : null}

          {result.macros && (
            <p className="tdv__line">
              <strong>Balance:</strong> {result.macros.proteinPct}% protein ·{' '}
              {result.macros.carbohydratePct}% carbohydrate · {result.macros.fatPct}% fat
            </p>
          )}

          <p className="tdv__line">
            <strong>Allergens:</strong>{' '}
            {named.length > 0
              ? named.map((a) => `${a.allergen}: ${a.status}`).join(' · ')
              : 'unknown from a photo — FoodLens never claims an allergen is absent.'}
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
  dose: { durationSeconds: number; rounds: number; tempo: string };
  expectedRpe: number;
  why: string;
  safety: { verdict: string; rulesEvaluated: number };
  sparksEstimate: number;
  expiresAt: string;
}

interface Hold {
  held: true;
  reason: string;
  blocks: string[];
  retryAfterSeconds: number;
}

export function SnapModule({ me }: { me: Subject }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
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
      if ('held' in data && data.held) setHold(data);
      else setSnap(data as Snap);
    } catch (e) {
      setNote(`the engine said no: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="acct__module">
      <h3>
        Your next Snap <span className="tdv__chip">{modeForAge(me.age)} mode</span>
      </h3>
      <p className="acct__note" style={{ marginTop: 0 }}>
        One movement, dosed for your age mode and the moment you're in, safety-checked
        before it reaches you.
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
          <p className="tdv__line">
            <strong>Dose:</strong> {snap.dose.durationSeconds}s × {snap.dose.rounds}{' '}
            {snap.dose.rounds === 1 ? 'round' : 'rounds'}, {snap.dose.tempo} tempo · effort
            about {snap.expectedRpe}/10
          </p>
          <p className="tdv__line">{snap.why}</p>
          <p className="tdv__line">
            <strong>Safety:</strong> {snap.safety.verdict} after {snap.safety.rulesEvaluated}{' '}
            rules · <strong>Sparks:</strong> ~{snap.sparksEstimate} · expires{' '}
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
