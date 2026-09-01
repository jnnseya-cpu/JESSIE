'use client';

import { useEffect, useState } from 'react';
import { apiBase } from '../../api-base';

/**
 * The second half of "forgot password": the emailed link lands here with
 * a 30-minute token, the person chooses a new password, and the reset
 * signs them straight in.
 */
export function ResetPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  const submit = async () => {
    if (password !== repeat) {
      setError('those two passwords are not the same');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/auth/reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (token === null) {
    return <article className="acct-auth"><p className="acct__note" style={{ margin: 0 }}>…</p></article>;
  }

  if (!token) {
    return (
      <article className="acct-auth">
        <div className="acct-auth__head"><h3>This link is incomplete</h3></div>
        <p className="acct__note" style={{ margin: 0 }}>
          Open the reset link from your email again, or ask for a fresh one from the{' '}
          <a href="/account" style={{ color: 'var(--i-teal)' }}>sign-in page</a>.
        </p>
      </article>
    );
  }

  if (done) {
    return (
      <article className="acct-auth">
        <div className="acct-auth__head"><h3>Password changed</h3></div>
        <p className="acct__note" style={{ margin: '0 0 16px' }}>
          You are signed in with your new password on this device.
        </p>
        <a className="btn btn--primary" href="/account">Go to your account</a>
      </article>
    );
  }

  return (
    <article className="acct-auth">
      <div className="acct-auth__head"><h3>Choose a new password</h3></div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label htmlFor="pw1">New password</label>
          <span className="pwfield">
            <input id="pw1" type={shown ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={10} />
            <button type="button" className="pwfield__eye" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'}>
              {shown ? '🙈' : '👁'}
            </button>
          </span>
          <span className="field__hint">At least 10 characters. Length is the only rule.</span>
        </div>
        <div className="field">
          <label htmlFor="pw2">Repeat it</label>
          <span className="pwfield">
            <input id="pw2" type={shown ? 'text' : 'password'} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required minLength={10} />
          </span>
        </div>
        {error && <p className="probe__err">{error}</p>}
        <div className="pwa__row" style={{ marginTop: 8 }}>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : 'Set new password'}
          </button>
        </div>
      </form>
    </article>
  );
}
