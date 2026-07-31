'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Register, sign in, see your session, sign out.
 *
 * The session is an httpOnly cookie set by the API — this page never sees
 * or stores the token itself, which is the point: a token JavaScript can
 * read is a token an injected script can read.
 */

import { apiBase } from '../api-base';

interface Me {
  userId: string;
  email: string;
  displayName: string;
  kind: string;
  age: number;
  guardianLinked: boolean;
  sessionExpires: string;
}

export function AccountPanel() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<{ configured: boolean; userStore: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');

  const api = useCallback(
    (path: string, body?: object) =>
      fetch(`${apiBase()}${path}`, {
        method: body ? 'POST' : 'GET',
        credentials: 'include', // the cookie travels; the page never holds the token
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const statusRes = await api('/auth/status');
      setStatus((await statusRes.json()).data ?? null);
      const meRes = await api('/auth/me');
      setMe(meRes.ok ? ((await meRes.json()).data as Me) : null);
    } catch {
      setStatus(null);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'register'
          ? {
              email,
              password,
              displayName,
              age: Number(age),
              ...(Number(age) < 18 && guardianEmail ? { guardianEmail } : {}),
            }
          : { email, password };
      const res = await api(`/auth/${mode}`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<void> => {
    await api('/auth/logout', {});
    await refresh();
  };

  const minor = Number(age) > 0 && Number(age) < 18;

  if (status && !status.configured) {
    return (
      <article className="card card--light">
        <div className="card__head">
          <h3 className="card__t">Accounts are not enabled on this deployment</h3>
          <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>not configured</span>
        </div>
        <p className="card__note">
          The API needs <code>AUTH_SECRET</code> set — 32 or more random characters — before
          anyone can register. Nothing else changes; the rest of the site works without it.
        </p>
      </article>
    );
  }

  if (me) {
    return (
      <article className="card card--light">
        <div className="card__head">
          <h3 className="card__t">Signed in</h3>
          <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>{me.kind}</span>
        </div>
        <div className="metric"><span className="metric__k">Name</span><span className="metric__v">{me.displayName}</span></div>
        <div className="metric"><span className="metric__k">Email</span><span className="metric__v">{me.email}</span></div>
        <div className="metric"><span className="metric__k">Age</span><span className="metric__v">{me.age}</span></div>
        {me.kind === 'minor' && (
          <div className="metric">
            <span className="metric__k">Guardian</span>
            <span className="metric__v" style={{ color: me.guardianLinked ? 'var(--jm-excellent)' : 'var(--jm-monitor)' }}>
              {me.guardianLinked ? 'linked' : 'awaiting confirmation'}
            </span>
          </div>
        )}
        <div className="metric"><span className="metric__k">Session ends</span><span className="metric__v">{new Date(me.sessionExpires).toLocaleDateString('en-GB')}</span></div>
        <button className="btn btn--dark" type="button" onClick={() => void logout()} style={{ alignSelf: 'flex-start', marginTop: 12 }}>
          Sign out
        </button>
      </article>
    );
  }

  return (
    <article className="card card--light">
      <div className="card__head">
        <h3 className="card__t">{mode === 'login' ? 'Sign in' : 'Create your account'}</h3>
        {status?.userStore === 'memory' && (
          <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>dev store</span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" required minLength={2} maxLength={40} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} />
          {mode === 'register' && <span className="field__hint">At least 10 characters. Length is the only rule.</span>}
        </div>
        {mode === 'register' && (
          <>
            <div className="field">
              <label htmlFor="age">Age</label>
              <input id="age" type="number" min={10} max={120} value={age} onChange={(e) => setAge(e.target.value)} required />
            </div>
            {minor && (
              <div className="field">
                <label htmlFor="guardian">A parent or guardian’s email</label>
                <input id="guardian" type="email" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} required />
                <span className="field__hint">
                  Under 18, the account starts dark and activates when they confirm. That is a
                  rule the server enforces, not a checkbox.
                </span>
              </div>
            )}
          </>
        )}

        {error && <p className="probe__err">{error}</p>}

        <div className="pwa__row" style={{ marginTop: 8 }}>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'I need an account' : 'I already have one'}
          </button>
        </div>
      </form>
    </article>
  );
}
