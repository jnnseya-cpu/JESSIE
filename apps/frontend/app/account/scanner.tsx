'use client';

import { useEffect, useRef, useState } from 'react';
import { apiBase } from '../api-base';
import { shrinkImage } from './image-shrink';

/**
 * The supermarket scanner.
 *
 * Standing in an aisle, a photograph is the wrong tool: the packet
 * already carries a laboratory measurement, and the barcode is the
 * fastest route to it. This scans continuously, so a trolley can be
 * worked through in a couple of minutes, and each product lands in a
 * list with its real front-of-pack bands and declared allergens.
 *
 * Detection uses the browser's own BarcodeDetector where it exists —
 * Android Chrome, which is most of a supermarket — and falls back to
 * typing the number, which is what every scanner app makes you do
 * eventually anyway.
 */

interface Scanned {
  barcode: string;
  found: boolean;
  name?: string;
  brand?: string | null;
  quantity?: string | null;
  kcalPer100g?: number | null;
  per100g?: { fatG?: number; saturatesG?: number; sugarsG?: number; saltG?: number };
  allergensPresent?: string[];
  declaresFullList?: boolean;
  note?: string;
}

const BANDS = {
  fatG: { low: 3, high: 17.5, label: 'fat' },
  saturatesG: { low: 1.5, high: 5, label: 'saturates' },
  sugarsG: { low: 5, high: 22.5, label: 'sugars' },
  saltG: { low: 0.3, high: 1.5, label: 'salt' },
} as const;

function bandOf(value: number, low: number, high: number): 'green' | 'amber' | 'red' {
  return value <= low ? 'green' : value >= high ? 'red' : 'amber';
}

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

export function ScannerModule() {
  const [scans, setScans] = useState<Scanned[]>([]);
  const [typed, setTyped] = useState('');
  const [live, setLive] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  // An installed app has no address bar, so any advice about a padlock in
  // one is advice nobody can follow.
  const installed =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true);

  const lookup = async (barcode: string) => {
    if (seenRef.current.has(barcode)) return;
    seenRef.current.add(barcode);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase()}/foodlens/barcode/${encodeURIComponent(barcode)}`);
      const json = await res.json();
      const data = json.data as Scanned;
      setScans((all) => [data, ...all].slice(0, 40));
      if (navigator.vibrate) navigator.vibrate(data.found ? 40 : [20, 40, 20]);
    } catch (e) {
      setNote(`lookup failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  };

  const start = async () => {
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setLive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      // "Could not be opened" is not a diagnosis. Say which wall we hit,
      // because each one has a different way round it.
      const name = (error as { name?: string })?.name ?? '';
      const why =
        name === 'NotAllowedError'
          ? installed
            ? 'Camera access is blocked for the installed app. Press and hold the JESS MOVE icon on your home screen → App info → Permissions → Camera → Allow. Until then, use Photograph a barcode above — it opens your normal camera app and needs no permission here.'
            : 'Camera access is blocked for this site. Tap the padlock in the address bar, allow Camera, then try again — or photograph the barcode instead.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : name === 'NotReadableError'
              ? 'Another app is holding the camera. Close it and try again.'
              : name === 'SecurityError'
                ? 'This browser will not open a camera here. Photograph the barcode below instead.'
                : `The camera did not open (${name || 'unknown reason'}).`;
      setNote(
        name === 'NotAllowedError'
          ? why
          : `${why} Photographing the barcode works on every device.`,
      );
    }
  };

  /**
   * The fallback that always works: take one still of the barcode. The
   * browser reads it where it can, and where it cannot the photograph
   * goes to the model, which reads the digits printed under the bars.
   */
  const photographBarcode = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      setNote(null);
      try {
        const photo = await shrinkImage(file, 1600, 0.9);

        // Try the browser's own detector on the still first — instant and free.
        if (supported) {
          try {
            const Detector = (
              window as unknown as { BarcodeDetector: new (o: object) => BarcodeDetectorLike }
            ).BarcodeDetector;
            const detector = new Detector({
              formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
            });
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            if (codes[0]?.rawValue) {
              await lookup(codes[0].rawValue);
              return;
            }
          } catch {
            /* fall through to the model */
          }
        }

        const res = await fetch(`${apiBase()}/foodlens/barcode/read`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mimeType: photo.mimeType, dataBase64: photo.dataBase64 }),
        });
        const json = await res.json();
        const data = json.data as Scanned;
        if (data.found) {
          seenRef.current.add(data.barcode);
          setScans((all) => [data, ...all.filter((s) => s.barcode !== data.barcode)].slice(0, 40));
        } else {
          setNote(data.note ?? 'No barcode could be read in that photograph.');
        }
      } catch (e) {
        setNote(`that photo could not be read: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  // The read loop. Runs only while the camera is live.
  useEffect(() => {
    if (!live || !supported) return;
    let cancelled = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: object) => BarcodeDetectorLike })
      .BarcodeDetector;
    const detector = new Detector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
    });

    const tick = async () => {
      if (cancelled || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        for (const code of codes) {
          if (code.rawValue) void lookup(code.rawValue);
        }
      } catch {
        /* a frame that cannot be read is simply the next frame's problem */
      }
      if (!cancelled) setTimeout(() => void tick(), 350);
    };
    void tick();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, supported]);

  useEffect(() => stop, []);

  return (
    <section className="acct__module acct__module--food">
      <h3>
        Shelf scanner <span className="tdv__chip">supermarket</span>
      </h3>
      <p className="tdv__what">
        In an aisle the packet already holds a laboratory measurement, so scanning beats
        photographing. Point the camera and keep moving — every product lands below with its
        real front-of-pack bands and the allergens its label declares.
      </p>

      {live && (
        <div className="scan__stage">
          <video ref={videoRef} playsInline muted className="scan__video" />
          <span className="scan__reticle" />
        </div>
      )}

      <button className="btn btn--primary" type="button" disabled={busy} onClick={photographBarcode}>
        {busy ? 'Reading the barcode…' : 'Photograph a barcode'}
      </button>
      <p className="fl__note">
        This opens your normal camera app, so it works in the installed app and needs no extra
        permission. Fill the frame with the bars.
      </p>

      <div className="tdv__chips">
        {supported && (
          <button type="button" onClick={() => (live ? stop() : void start())}>
            {live ? 'Stop scanning' : 'Scan continuously (needs camera access)'}
          </button>
        )}
        {scans.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setScans([]);
              seenRef.current.clear();
            }}
          >
            Clear the list
          </button>
        )}
      </div>

      <div className="tdv__askrow" style={{ marginTop: 10 }}>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && typed.trim().length >= 6) {
              void lookup(typed.trim());
              setTyped('');
            }
          }}
          placeholder="Or type the barcode number"
          aria-label="Barcode number"
          inputMode="numeric"
        />
        <button
          className="btn acct__ghostbtn"
          type="button"
          disabled={busy || typed.trim().length < 6}
          onClick={() => {
            void lookup(typed.trim());
            setTyped('');
          }}
        >
          Look up
        </button>
      </div>
      {note && <p className="acct__note">{note}</p>}

      {scans.length > 0 && (
        <ul className="scan__list">
          {scans.map((s) => (
            <li key={s.barcode} className={s.found ? 'scan__item' : 'scan__item scan__item--miss'}>
              {s.found ? (
                <>
                  <div className="scan__head">
                    <strong>{s.name}</strong>
                    <span>
                      {[s.brand, s.quantity].filter(Boolean).join(' · ') || s.barcode}
                    </span>
                  </div>
                  {typeof s.kcalPer100g === 'number' && (
                    <span className="scan__kcal">{Math.round(s.kcalPer100g)} kcal / 100g</span>
                  )}
                  <div className="scan__bands">
                    {(['fatG', 'saturatesG', 'sugarsG', 'saltG'] as const).map((key) => {
                      const value = s.per100g?.[key];
                      if (typeof value !== 'number') return null;
                      const spec = BANDS[key];
                      const band = bandOf(value, spec.low, spec.high);
                      return (
                        <span key={key} className={`scan__band scan__band--${band}`}>
                          {spec.label} {value}g
                        </span>
                      );
                    })}
                  </div>
                  <p className="scan__allergens">
                    {s.allergensPresent && s.allergensPresent.length > 0 ? (
                      <>
                        <strong>Contains:</strong> {s.allergensPresent.join(', ')}
                      </>
                    ) : s.declaresFullList ? (
                      'The label declares no allergens from the fourteen.'
                    ) : (
                      'This label does not list its allergens, so nothing can be called absent.'
                    )}
                  </p>
                </>
              ) : (
                <>
                  <div className="scan__head">
                    <strong>{s.barcode}</strong>
                    <span>not in the open label database</span>
                  </div>
                  <p className="scan__allergens">{s.note}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="fl__note">
        Labels come from Open Food Facts, the open database of product labels — free, no
        account, published under an open licence. A product nobody has added yet returns
        nothing rather than a guess, and photographing the packet still works.
      </p>
    </section>
  );
}
