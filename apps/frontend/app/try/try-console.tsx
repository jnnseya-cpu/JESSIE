'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNT_KIND_DEFINITIONS,
  EVENT_CATALOGUE,
  PROFILE_VISIBILITY,
  profilePolicy,
  resolveDelivery,
  visibleTo,
  type AccountKind,
  type Profile,
  type ProfileVisibility,
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
      const res = await fetch(url('/accounts/profiles'));
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
      const res = await fetch(url(path), { method });
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

  const current = personas.find((p) => p.userId === active) ?? null;
  const policy = current?.age != null ? profilePolicy(current.age) : null;
  const definition = current ? ACCOUNT_KIND_DEFINITIONS[current.accountKind] : null;

  /* A profile shaped from the persona, so `visibleTo` can be run for real. */
  const asProfile: Profile | null = current
    ? {
        userId: current.userId,
        accountKind: current.accountKind,
        displayName: current.displayName,
        handle: current.handle,
        pronouns: 'they/them',
        realName: policy?.realNameAllowed ? 'A Real Name' : null,
        bio: policy?.bioAllowed ? 'A short bio.' : null,
        locale: 'en-GB',
        timezone: 'Europe/London',
        avatar: {
          kind: current.avatar as never,
          assetId: null,
          preset: 'heron',
          moderation: 'approved',
          updatedAt: '',
        },
        cover: {
          kind: current.cover as never,
          assetId: null,
          preset: 'tide',
          moderation: 'approved',
          updatedAt: '',
        },
        visibility: current.visibility,
        updatedAt: '',
        version: current.version,
      }
    : null;

  const seen = asProfile ? visibleTo(asProfile, viewer) : null;

  return (
    <div>
      {/* ---------- connection ---------- */}
      <article className="card card--light" style={{ marginBottom: 22 }}>
        <div className="card__head">
          <h3 className="card__t">API</h3>
          <span className="card__tag" style={{ color: error ? 'var(--jm-critical)' : 'var(--jm-excellent)' }}>
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
                    color: p.userId === active ? 'var(--jm-teal)' : undefined,
                    fontWeight: p.userId === active ? 650 : undefined,
                  }}
                >
                  {p.displayName}
                  {p.age != null && <span style={{ opacity: 0.6 }}> · {p.age}</span>}
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
                style={{ color: definition.canTransact ? 'var(--jm-excellent)' : 'var(--jm-monitor)' }}
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
                      color: v === viewer ? 'var(--jm-teal)' : undefined,
                    }}
                  >
                    {v}
                  </button>
                </li>
              ))}
            </div>
            {seen === null ? (
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
                    style={{ color: seen.realName ? undefined : 'var(--jm-unavailable)' }}
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
                    style={{ color: delivered ? 'var(--jm-excellent)' : 'var(--jm-monitor)' }}
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
