'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNT_KIND_DEFINITIONS,
  EVENT_CATALOGUE,
  PROFILE_VISIBILITY,
  profilePolicy,
  resolveDelivery,
  type AccountKind,
  type ProfileVisibility,
  type VisibleProfile,
  type ViewerRelationship,
} from '@jessmove/shared';

/**
 * The role-switching harness.
 *
 * There is no authentication yet, so this is not a login and does not
 * pretend to be one. What it does is let you stand in each account's shoes
 * and see what the platform actually resolves for them — the profile
 * policy, what a given viewer can see, and which messages would reach them.
 *
 * Every number and verdict on this page comes from the same functions the
 * API uses. Nothing is illustrated.
 */

import { apiBase } from '../api-base';

interface Persona {
  userId: string;
  accountKind: AccountKind;
  age: number | null;
  guardianId: string | null;
  displayName: string;
  handle: string;
  visibility: ProfileVisibility;
  avatar: string;
  cover: string;
  version: number;
}

const VIEWERS: readonly ViewerRelationship[] = [
  'self',
  'guardian',
  'household',
  'crew',
  'organisation',
  'stranger',
];

/** A representative event per category, so the list stays readable. */
const PROBE_EVENTS = [
  'payment.successful',
  'body.assessment_ready',
  'snap.offered',
  'clinical.red_flag_detected',
  'security.alert',
  'insight.weekly_ready',
  'referral.converted',
  'privacy.breach_notification',
];

export function TryConsole() {
  const [base, setBase] = useState(() => apiBase());
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The saved base URL can only be read after mount — the server has no
   * localStorage. Without this gate the first fetch fires against the
   * default and flashes a connection error before the saved value lands.
   */
  const [ready, setReady] = useState(false);
  const [viewer, setViewer] = useState<ViewerRelationship>('crew');

  const url = useCallback((path: string) => `${base.replace(/\/$/, '')}${path}`, [base]);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Staff only, deliberately. This console lists demo accounts and can
      // delete them, which is not a thing a public page may do — it used to
      // be open, and on a public launch that is somebody else's account.
      const res = await fetch(url('/accounts/profiles'), { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        setPersonas([]);
        setError(
          'This console is for platform staff. Sign in with a staff account on the account page and come back.',
        );
        return;
      }
      const json = await res.json();
      const list: Persona[] = json.data ?? [];
      setPersonas(list);
      setActive((current) => current ?? list[0]?.userId ?? null);
    } catch (e) {
      setError(`${(e as Error).message} — is the API running, and is this origin in CORS_ORIGINS?`);
    }
  }, [url]);

  useEffect(() => {
    const saved = window.localStorage.getItem('jm-api-base');
    if (saved) setBase(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const act = async (label: string, path: string, method: 'POST' | 'DELETE') => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url(path), { method, credentials: 'include' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? `${res.status}`);
      }
      if (method === 'DELETE') setActive(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /*
   * The autosave contract, demonstrated rather than described.
   *
   * `/accounts/autosave/policy` publishes which fields may save themselves
   * and which require a confirmed submit — "a consent toggle that saves
   * itself 800ms after a mis-tap is not consent". `splitPatch` enforces it
   * inside `POST /accounts/profiles/:userId/autosave`, and that route was
   * reachable by nothing, so the one rule most worth showing a buyer ran
   * nowhere.
   *
   * Two buttons: save a field that may autosave, and try one that may not.
   * The second is expected to be refused, and the refusal is the feature.
   */
  const [saveNote, setSaveNote] = useState<string | null>(null);

  /*
   * The upload rules, demonstrated on a generated image.
   *
   * A file picker would demonstrate the same route and make the
   * interesting case hard to reach: the rule worth seeing is that an
   * under-18 persona is refused photographic media outright, and that an
   * adult's picture arrives `moderation: 'pending'` rather than approved.
   * One click against a known 8x8 PNG shows both, and nothing here
   * depends on what happens to be in somebody's camera roll.
   */
  const uploadDemo = async () => {
    if (!active) return;
    setBusy('upload');
    setSaveNote(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('this browser would not give us a canvas');
      ctx.fillStyle = '#0f7d7d';
      ctx.fillRect(0, 0, 8, 8);
      const dataBase64 = canvas.toDataURL('image/png').split(',')[1] ?? '';

      const res = await fetch(url(`/accounts/profiles/${encodeURIComponent(active)}/media`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slot: 'avatar',
          age: current?.age ?? 30,
          mimeType: 'image/png',
          dataBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      const d = json.data as {
        media: { moderation: string };
        sniffed: { widthPx: number; heightPx: number; format: string };
      };
      setSaveNote(
        `accepted as ${d.sniffed.widthPx}x${d.sniffed.heightPx} ${d.sniffed.format}, ` +
          `stored ${d.media.moderation} — dimensions read from the bytes, not the request`,
      );
      await load();
    } catch (e) {
      // For an under-18 persona this is the expected answer, and it is the
      // rule the demonstration exists to show.
      setSaveNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const patch = async (label: string, body: Record<string, unknown>, commit = false) => {
    if (!active) return;
    setBusy(label);
    setSaveNote(null);
    try {
      const route = commit ? 'commit' : 'autosave';
      const res = await fetch(
        url(`/accounts/profiles/${encodeURIComponent(active)}/${route}`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            age: current?.age ?? 30,
            patch: body,
            basedOnVersion: current?.version ?? 0,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setSaveNote(
        commit
          ? `committed at version ${(json.data as { version?: number }).version ?? '?'}`
          : `autosaved at version ${(json.data as { version?: number }).version ?? '?'}`,
      );
      await load();
    } catch (e) {
      // A refusal is the expected outcome for an explicit field, so it is
      // reported as the result rather than as a fault.
      setSaveNote((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const current = personas.find((p) => p.userId === active) ?? null;
  const policy = current?.age != null ? profilePolicy(current.age) : null;
  const definition = current ? ACCOUNT_KIND_DEFINITIONS[current.accountKind] : null;

  /*
   * What a viewer sees, answered by the server.
   *
   * This used to call `visibleTo` here, against an `asProfile` object
   * rebuilt in the browser from partial persona data with empty strings
   * standing in for the fields the list endpoint does not return. So the
   * console showed an approximation of the visibility model and
   * `GET /accounts/profiles/:userId/as/:viewer` — which answers exactly
   * this question, authoritatively, from the stored profile — was
   * reachable by nothing.
   *
   * A demonstration of a privacy model has one job: to be the same answer
   * the product would give. Recomputing it client-side guarantees it
   * eventually is not.
   */
  const [seen, setSeen] = useState<VisibleProfile | null>(null);
  const [seenError, setSeenError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setSeen(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setSeenError(null);
      try {
        const res = await fetch(
          url(`/accounts/profiles/${encodeURIComponent(active)}/as/${viewer}`),
          { credentials: 'include' },
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.message ?? `${res.status}`);
        setSeen((json.data as { profile: VisibleProfile | null }).profile);
      } catch (e) {
        if (!cancelled) {
          setSeen(null);
          setSeenError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, viewer, url]);

  return (
    <div>
      {/* ---------- connection ---------- */}
      <article className="card card--light" style={{ marginBottom: 22 }}>
        <div className="card__head">
          <h3 className="card__t">API</h3>
          <span className="card__tag" style={{ color: error ? 'var(--i-critical)' : 'var(--i-excellent)' }}>
            {error ? 'unreachable' : `${personas.length} accounts`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="base">Base URL</label>
          <input
            id="base"
            type="url"
            value={base}
            spellCheck={false}
            onChange={(e) => {
              setBase(e.target.value);
              window.localStorage.setItem('jm-api-base', e.target.value);
            }}
          />
        </div>
        <div className="pwa__row" style={{ marginTop: 6 }}>
          <button
            className="btn btn--primary"
            type="button"
            disabled={!!busy}
            onClick={() => void act('seed', '/accounts/seed', 'POST')}
          >
            {busy === 'seed' ? 'Creating…' : 'Create the demo cast'}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            disabled={!!busy}
            onClick={() => void act('reset', '/accounts/reset', 'POST')}
          >
            {busy === 'reset' ? 'Removing…' : 'Remove all accounts'}
          </button>
          <button className="btn btn--dark" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {error && <p className="probe__err">{error}</p>}
      </article>

      {personas.length === 0 && !error && (
        <p className="lede">
          No accounts yet. Press <strong>Create the demo cast</strong> — it makes one account
          of every kind, from an eleven-year-old to a platform administrator.
        </p>
      )}

      {/* ---------- who am I ---------- */}
      {personas.length > 0 && (
        <>
          <h3 className="card__t" style={{ margin: '0 0 12px' }}>
            Act as
          </h3>
          <div className="pills" style={{ marginBottom: 26 }}>
            {personas.map((p) => (
              <li key={p.userId} style={{ listStyle: 'none' }}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => setActive(p.userId)}
                  style={{
                    cursor: 'pointer',
                    borderColor: p.userId === active ? 'var(--jm-teal)' : undefined,
                    color: p.userId === active ? 'var(--i-teal)' : undefined,
                    fontWeight: p.userId === active ? 650 : undefined,
                  }}
                >
                  {p.displayName}
                  {p.age != null && <span style={{ color: 'var(--ink-3)' }}> · {p.age}</span>}
                </button>
              </li>
            ))}
          </div>
        </>
      )}

      {current && definition && policy && (
        <div className="dash">
          {/* ---------- the account ---------- */}
          <article className="card card--6 card--light">
            <div className="card__head">
              <h3 className="card__t">{definition.label}</h3>
              <span className="card__tag">{current.userId}</span>
            </div>
            <p className="card__note">{definition.summary}</p>
            <div className="metric">
              <span className="metric__k">Can be charged</span>
              <span
                className="metric__v"
                style={{ color: definition.canTransact ? 'var(--i-excellent)' : 'var(--i-monitor)' }}
              >
                {definition.canTransact ? 'yes' : 'no'}
              </span>
            </div>
            <div className="metric">
              <span className="metric__k">Needs a guardian</span>
              <span className="metric__v">{definition.requiresGuardian ? 'yes' : 'no'}</span>
            </div>
            <div className="metric">
              <span className="metric__k">Sees cohort reporting</span>
              <span className="metric__v">{definition.seesCohortReporting ? 'yes' : 'no'}</span>
            </div>
            <p className="card__note" style={{ marginTop: 12 }}>
              <strong>Verified by:</strong> {definition.verification.join(' · ')}
            </p>
            <button
              className="btn btn--ghost"
              type="button"
              style={{ alignSelf: 'flex-start', marginTop: 10 }}
              disabled={!!busy}
              onClick={() => void act('delete', `/accounts/profiles/${current.userId}`, 'DELETE')}
            >
              {busy === 'delete' ? 'Removing…' : 'Remove this account'}
            </button>
          </article>

          {/* ---------- what their profile may contain ---------- */}
          <article className="card card--6 card--light">
            <div className="card__head">
              <h3 className="card__t">Profile policy</h3>
              <span
                className="card__tag"
                style={{
                  color:
                    current.age != null && current.age < 18
                      ? 'var(--jm-coral)'
                      : 'var(--jm-excellent)',
                }}
              >
                age {current.age ?? '—'}
              </span>
            </div>
            <p className="card__note">{policy.reason}</p>
            <ul className="pills">
              {policy.avatarKinds.map((k) => (
                <li key={k} style={{ borderColor: 'var(--jm-teal)' }}>
                  avatar: {k}
                </li>
              ))}
              {policy.coverKinds.map((k) => (
                <li key={k} style={{ borderColor: 'var(--jm-sky)' }}>
                  cover: {k}
                </li>
              ))}
            </ul>
            <div className="metric">
              <span className="metric__k">Visibility ceiling</span>
              <span className="metric__v">{policy.visibilityCeiling}</span>
            </div>
            <div className="metric">
              <span className="metric__k">Real name</span>
              <span className="metric__v">{policy.realNameAllowed ? 'allowed' : 'never'}</span>
            </div>
            <div className="metric">
              <span className="metric__k">Bio</span>
              <span className="metric__v">
                {policy.bioAllowed ? `${policy.bioMaxLength} chars` : 'none'}
              </span>
            </div>
            <div className="metric">
              <span className="metric__k">Guardian approves changes</span>
              <span className="metric__v">{policy.guardianApproval ? 'yes' : 'no'}</span>
            </div>
          </article>

          {/* ---------- the autosave contract, run for real ---------- */}
          <article className="card card--6 card--light">
            <div className="card__head">
              <h3 className="card__t">Autosave</h3>
              <span className="card__tag">version {current.version}</span>
            </div>
            <p className="card__note">
              Some fields save themselves. Some refuse to, and the refusal is the point: a
              consent toggle that saves itself 800ms after a mis-tap is not consent.
            </p>
            <div className="pwa__row" style={{ marginTop: 6 }}>
              <button
                className="btn btn--primary"
                type="button"
                disabled={!!busy}
                onClick={() => void patch('autosave', { pronouns: 'they/them' })}
              >
                {busy === 'autosave' ? 'Saving…' : 'Autosave a pronoun'}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={!!busy}
                onClick={() => void patch('refuse', { dateOfBirth: '1990-01-01' })}
              >
                {busy === 'refuse' ? 'Trying…' : 'Try to autosave a date of birth'}
              </button>
              <button
                className="btn btn--dark"
                type="button"
                disabled={!!busy}
                onClick={() => void patch('commit', { pronouns: 'she/her' }, true)}
              >
                {busy === 'commit' ? 'Committing…' : 'Commit instead'}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={!!busy}
                onClick={() => void uploadDemo()}
              >
                {busy === 'upload' ? 'Uploading…' : 'Try a picture'}
              </button>
            </div>
            {saveNote && (
              <p className="card__note" style={{ marginTop: 10 }}>
                {saveNote}
              </p>
            )}
          </article>

          {/* ---------- who can see them ---------- */}
          <article className="card card--6 card--light">
            <div className="card__head">
              <h3 className="card__t">Seen by</h3>
              <span className="card__tag">visibility: {current.visibility}</span>
            </div>
            <div className="pills" style={{ marginBottom: 14 }}>
              {VIEWERS.map((v) => (
                <li key={v} style={{ listStyle: 'none' }}>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setViewer(v)}
                    style={{
                      cursor: 'pointer',
                      borderColor: v === viewer ? 'var(--jm-teal)' : undefined,
                      color: v === viewer ? 'var(--i-teal)' : undefined,
                    }}
                  >
                    {v}
                  </button>
                </li>
              ))}
            </div>
            {seenError ? (
              /* A read that failed must not read as "a stranger sees nothing",
                 which is the same screen for an opposite reason. */
              <p className="probe__err" style={{ margin: 0 }}>
                Could not ask the API what a {viewer} sees: {seenError}
              </p>
            ) : seen === null ? (
              <p className="probe__err" style={{ margin: 0 }}>
                Nothing. A <strong>{viewer}</strong> cannot see this profile at all.
              </p>
            ) : (
              <>
                <div className="metric">
                  <span className="metric__k">Display name</span>
                  <span className="metric__v">{seen.displayName}</span>
                </div>
                <div className="metric">
                  <span className="metric__k">Real name</span>
                  <span
                    className="metric__v"
                    style={{ color: seen.realName ? undefined : 'var(--i-unavailable)' }}
                  >
                    {seen.realName ?? 'hidden'}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric__k">Avatar</span>
                  <span className="metric__v">{seen.avatar?.kind ?? 'hidden'}</span>
                </div>
                <div className="metric">
                  <span className="metric__k">Bio</span>
                  <span className="metric__v">{seen.bio ?? 'none'}</span>
                </div>
              </>
            )}
          </article>

          {/* ---------- what reaches them ---------- */}
          <article className="card card--6 card--light">
            <div className="card__head">
              <h3 className="card__t">Messages that reach them</h3>
              <span className="card__tag">resolved live</span>
            </div>
            <p className="card__note">
              Run against the real resolver, with the coach on, outside quiet hours, every
              channel consented.
            </p>
            {PROBE_EVENTS.map((key) => {
              const event = EVENT_CATALOGUE.find((e) => e.key === key);
              if (!event || current.age == null) return null;
              const plan = resolveDelivery(event, {
                userId: current.userId,
                age: current.age,
                presence: 'full',
                consentedChannels: ['email', 'in_app', 'sms', 'push'],
                inQuietHours: false,
                contextHeld: false,
                coachingSentToday: 0,
                dailyCap: 6,
                hasGuardian: current.guardianId !== null,
              });
              const delivered = plan.deliver.length > 0;
              return (
                <div className="metric" key={key}>
                  <span className="metric__k" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                    {key}
                  </span>
                  <span
                    className="metric__v"
                    style={{ color: delivered ? 'var(--i-excellent)' : 'var(--i-monitor)' }}
                  >
                    {delivered ? plan.deliver.join(', ') : plan.suppressed.join(', ')}
                    {plan.guardianCopy && ' + guardian'}
                  </span>
                </div>
              );
            })}
          </article>
        </div>
      )}
    </div>
  );
}
