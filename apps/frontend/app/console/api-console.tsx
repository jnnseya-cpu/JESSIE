'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A live API console.
 *
 * The rest of the site is statically rendered marketing. This is the one
 * page that talks to a running backend, so a deployment can be tested from
 * a browser without curl — pick a request, send it, read the envelope.
 *
 * The base URL is editable at runtime rather than baked in, because the
 * person testing a staging deploy is rarely on the same host as the build.
 */

type Probe = {
  key: string;
  method: 'GET' | 'POST';
  path: string;
  label: string;
  note: string;
  body?: unknown;
  /** What a correct deployment returns. Shown next to the actual result. */
  expect: number;
};

const SIGNALS = {
  userId: 'u_demo',
  motionState: 'still',
  locationClass: 'office',
  onCall: false,
  doNotDisturb: false,
  localHour: 14,
  snapsDeliveredToday: 1,
  dailyCap: 6,
  minutesSinceLastNudge: 95,
  consentedSignals: ['calendar', 'motion', 'device_state'],
};

const PROBES: readonly Probe[] = [
  {
    key: 'health',
    method: 'GET',
    path: '/health',
    label: 'Health',
    note: 'Liveness, plus which AI providers are configured.',
    expect: 200,
  },
  {
    key: 'system',
    method: 'GET',
    path: '/system',
    label: 'System invariants',
    note: 'The operating system’s rules, machine-readable.',
    expect: 200,
  },
  {
    key: 'providers',
    method: 'GET',
    path: '/ai/providers',
    label: 'AI providers',
    note: 'Configuration and resolved model names. Staff session required — 401 here is the guard working.',
    expect: 200,
  },
  {
    key: 'gate',
    method: 'GET',
    path: '/movements/gate',
    label: 'Publishing gate',
    note: 'The five-variant contract, in full.',
    expect: 200,
  },
  {
    key: 'next',
    method: 'POST',
    path: '/prescriptions/next',
    label: 'The core call — next best movement',
    note: 'Returns a movement with its dose, its reason and the context decision that authorised it.',
    expect: 201,
    body: {
      userId: 'u_demo',
      mode: 'momentum',
      availableSeconds: 900,
      capabilityNormaliser: 1,
      permittedVariants: ['seated', 'standing'],
      signals: SIGNALS,
    },
  },
  {
    key: 'hold',
    method: 'POST',
    path: '/prescriptions/next',
    label: 'The same call, while driving',
    note: 'Must return an explicit hold rather than a movement — and it is still a success, not an error.',
    expect: 201,
    body: {
      userId: 'u_demo',
      mode: 'momentum',
      availableSeconds: 900,
      capabilityNormaliser: 1,
      permittedVariants: ['seated'],
      signals: { ...SIGNALS, motionState: 'driving', locationClass: 'transit' },
    },
  },
  {
    key: 'adult',
    method: 'POST',
    path: '/body/assess',
    label: 'Body assessment — adult, opted in',
    note: 'Returns a pathway and, because this adult opted in, the metrics.',
    expect: 201,
    body: {
      userId: 'u_demo',
      age: 34,
      heightCm: 178,
      weightKg: 88,
      waistCm: 95,
      optedIntoBodyMetrics: true,
    },
  },
  {
    key: 'child',
    method: 'POST',
    path: '/body/assess',
    label: 'Body assessment — child, consent set to true',
    note: 'The consent flag is deliberately true. A correct deployment still returns CHILD_GROWTH with metrics null, because the switch is not consulted below 18.',
    expect: 201,
    body: {
      userId: 'u_child',
      age: 12,
      heightCm: 150,
      weightKg: 45,
      optedIntoBodyMetrics: true,
    },
  },
  {
    key: 'reject',
    method: 'POST',
    path: '/prescriptions/next',
    label: 'A malformed request',
    note: 'Must be a 400 that names the offending fields — never a 500.',
    expect: 400,
    body: { userId: 'u_demo' },
  },
  {
    key: 'quote',
    method: 'POST',
    path: '/acu/quote',
    label: 'Price an action before running it',
    note: 'The Cost Governor, quoting a cheap agent call.',
    expect: 201,
    body: { providerCostGbp: 0.004 },
  },
  {
    key: 'gaps',
    method: 'GET',
    path: '/blog/agent/gaps',
    label: 'Editorial — which topic cluster is thinnest',
    note: 'What the SEO agent gets commissioned against next. Emptiest cluster first.',
    expect: 200,
  },
  {
    key: 'view',
    method: 'POST',
    path: '/blog/views',
    label: 'Record a blog view',
    note: 'No cookie and no identifier in the payload. The address is hashed server-side with a salt that rotates daily.',
    expect: 201,
    body: {
      slug: 'the-nudge-we-did-not-send',
      dwellSeconds: 90,
      scrollPercent: 80,
      device: 'desktop',
    },
  },
  {
    key: 'publish',
    method: 'POST',
    path: '/blog/posts/rules-in-postgresql/status',
    label: 'Publish an agent draft with no reviewer',
    note: 'Must be refused. An agent cannot put words on a health site without a named person having read them.',
    expect: 400,
    body: { to: 'published' },
  },
];

type Result = { status: number; ms: number; ok: boolean; text: string } | { error: string };

import { apiBase } from '../api-base';

export function ApiConsole() {
  const [base, setBase] = useState(() => apiBase());
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Remember the base URL, so testing a staging host survives a reload.
  useEffect(() => {
    const saved = window.localStorage.getItem('jm-api-base');
    if (saved) setBase(saved);
    setReady(true);
  }, []);

  const run = useCallback(
    async (probe: Probe) => {
      setBusy(probe.key);
      const started = performance.now();
      try {
        const res = await fetch(base.replace(/\/$/, '') + probe.path, {
          method: probe.method,
          headers: probe.body ? { 'content-type': 'application/json' } : undefined,
          body: probe.body ? JSON.stringify(probe.body) : undefined,
        });
        const text = await res.text();
        let pretty = text;
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          /* not JSON — show it raw */
        }
        setResults((r) => ({
          ...r,
          [probe.key]: {
            status: res.status,
            ms: Math.round(performance.now() - started),
            ok: res.status === probe.expect,
            text: pretty,
          },
        }));
      } catch (e) {
        setResults((r) => ({
          ...r,
          [probe.key]: {
            error:
              (e as Error).message +
              ' — is the API running, and is this origin in CORS_ORIGINS?',
          },
        }));
      } finally {
        setBusy(null);
      }
    },
    [base],
  );

  const runAll = useCallback(async () => {
    for (const p of PROBES) await run(p);
  }, [run]);

  const passed = PROBES.filter((p) => {
    const r = results[p.key];
    return r && 'ok' in r && r.ok;
  }).length;
  const attempted = Object.keys(results).length;

  return (
    <div>
      <article className="card card--light" style={{ marginBottom: 22 }}>
        <div className="card__head">
          <h3 className="card__t">API base URL</h3>
          {attempted > 0 && (
            <span
              className="card__tag"
              style={{
                color: passed === PROBES.length ? 'var(--jm-excellent)' : 'var(--jm-monitor)',
              }}
            >
              {passed} / {PROBES.length} as expected
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="base">Point this at any deployment</label>
          <input
            id="base"
            type="url"
            value={ready ? base : apiBase()}
            onChange={(e) => {
              setBase(e.target.value);
              window.localStorage.setItem('jm-api-base', e.target.value);
            }}
            spellCheck={false}
          />
          <span className="field__hint">
            The API must list this page’s origin in <code>CORS_ORIGINS</code>, or the browser
            will block the request before it leaves.
          </span>
        </div>
        <button className="btn btn--primary" type="button" onClick={runAll} disabled={!!busy}>
          {busy ? 'Running…' : `Run all ${PROBES.length} checks`}
        </button>
      </article>

      <div className="probes">
        {PROBES.map((p) => {
          const r = results[p.key];
          return (
            <article className="card card--light probe" key={p.key}>
              <div className="card__head">
                <h3 className="card__t">{p.label}</h3>
                <span className={`verb${p.method === 'POST' ? ' verb--post' : ''}`}>
                  {p.method}
                </span>
              </div>
              <p className="card__note" style={{ marginTop: -4 }}>
                <code>{p.path}</code> · expects {p.expect}
              </p>
              <p className="card__note">{p.note}</p>

              <button
                className="btn btn--dark"
                type="button"
                onClick={() => run(p)}
                disabled={busy === p.key}
                style={{ alignSelf: 'flex-start' }}
              >
                {busy === p.key ? 'Sending…' : 'Send'}
              </button>

              {r && 'error' in r && (
                <p className="probe__err">{r.error}</p>
              )}
              {r && 'status' in r && (
                <>
                  <p className="probe__meta">
                    <strong style={{ color: r.ok ? 'var(--jm-excellent)' : 'var(--jm-critical)' }}>
                      {r.ok ? '✓' : '✗'} {r.status}
                    </strong>{' '}
                    · {r.ms}ms · expected {p.expect}
                  </p>
                  <pre className="probe__out">{r.text}</pre>
                </>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
