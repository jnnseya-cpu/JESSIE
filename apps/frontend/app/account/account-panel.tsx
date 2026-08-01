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
  guardianConfirmed: boolean;
  avatarUrl: string | null;
  coverUrl: string | null;
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

  const [push, setPush] = useState<
    'checking' | 'unsupported' | 'off' | 'busy' | 'on' | 'denied' | 'unconfigured'
  >('checking');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPush('unsupported');
      return;
    }
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPush(sub ? 'on' : 'off'))
      .catch(() => setPush('off'));
  }, []);

  /** The applicationServerKey format PushManager wants. */
  const keyBytes = (b64u: string) => {
    const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
    const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  const enablePush = async (userId: string) => {
    setPush('busy');
    try {
      const status = (await (await fetch(`${apiBase()}/push/status`)).json()) as {
        data: { configured: boolean; publicKey: string | null };
      };
      if (!status.data.configured || !status.data.publicKey) {
        setPush('unconfigured');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(status.data.publicKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api('/push/subscribe', {
        userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      });
      setPush('on');
    } catch {
      setPush(Notification.permission === 'denied' ? 'denied' : 'off');
    }
  };

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

  const [wallet, setWallet] = useState<{ balance: number } | null>(null);
  const [grantTarget, setGrantTarget] = useState('');
  const [grantAmount, setGrantAmount] = useState('500');
  const [adminResult, setAdminResult] = useState<string | null>(null);

  const loadWallet = useCallback(
    async (userId: string) => {
      try {
        const res = await api(`/acu/balance/${userId}`);
        if (res.ok) setWallet(((await res.json()).data as { balance: number }) ?? null);
      } catch {
        setWallet(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const grantAcu = async () => {
    setAdminResult('granting…');
    try {
      const res = await api('/acu/grant', {
        userId: grantTarget.trim(),
        acus: Number(grantAmount),
        note: 'admin grant from /account',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setAdminResult(`done — ${grantTarget.trim()} now holds ${json.data.balance} ACU`);
      if (me && grantTarget.trim() === me.userId) void loadWallet(me.userId);
    } catch (e) {
      setAdminResult(`failed: ${(e as Error).message}`);
    }
  };

  const testPush = async () => {
    if (!me) return;
    setAdminResult('sending…');
    try {
      const res = await api('/push/test', { userId: me.userId });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setAdminResult(
        json.data.sent > 0
          ? `sent to ${json.data.sent} device${json.data.sent === 1 ? '' : 's'} — close the app and watch the phone`
          : `nothing sent — ${json.data.note ?? 'enable notifications on a device first'}`,
      );
    } catch (e) {
      setAdminResult(`failed: ${(e as Error).message}`);
    }
  };

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState<'avatar' | 'cover' | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteNote, setDeleteNote] = useState<string | null>(null);

  const patchName = async () => {
    setProfileNote('saving…');
    try {
      const res = await fetch(`${apiBase()}/auth/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setEditingName(false);
      setProfileNote(null);
      await refresh();
    } catch (e) {
      setProfileNote(`could not save: ${(e as Error).message}`);
    }
  };

  const uploadMedia = (slot: 'avatar' | 'cover') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 10_000_000) {
        setProfileNote('That photo is over 10MB — choose a smaller one.');
        return;
      }
      setUploading(slot);
      setProfileNote(null);
      try {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const res = await api('/auth/me/media', {
          slot,
          mimeType: file.type,
          dataBase64: btoa(binary),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? `${res.status}`);
        setProfileNote(
          json.data.bytesRemoved > 0
            ? `saved — ${json.data.bytesRemoved} bytes of hidden metadata (EXIF/GPS) were stripped first`
            : 'saved',
        );
        await refresh();
      } catch (e) {
        setProfileNote(`upload failed: ${(e as Error).message}`);
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const deleteAccount = async () => {
    setDeleteNote('deleting…');
    try {
      const res = await api('/auth/me/delete', { password: deletePassword });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setDeleteNote(null);
      setDeleteArmed(false);
      await refresh();
    } catch (e) {
      setDeleteNote(`failed: ${(e as Error).message}`);
    }
  };

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

  useEffect(() => {
    if (me) {
      void loadWallet(me.userId);
      if (!grantTarget) setGrantTarget(me.userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.userId]);

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
    const initials = me.displayName
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const canPhoto = me.age >= 18;

    return (
      <>
      {/* ---- Profile header: cover, avatar, name ---- */}
      <article className="profilehead">
        <div
          className="profilehead__cover"
          style={me.coverUrl ? { backgroundImage: `url(${me.coverUrl})` } : undefined}
        >
          {canPhoto && (
            <button
              type="button"
              className="profilehead__coverbtn"
              onClick={() => uploadMedia('cover')}
              disabled={uploading !== null}
            >
              {uploading === 'cover' ? 'Uploading…' : me.coverUrl ? 'Change cover' : 'Add cover'}
            </button>
          )}
        </div>
        <div className="profilehead__row">
          <div className="profilehead__avatarwrap">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="profilehead__avatar" src={me.avatarUrl} alt="" />
            ) : (
              <div className="profilehead__avatar profilehead__avatar--initials">{initials}</div>
            )}
            {canPhoto && (
              <button
                type="button"
                className="profilehead__avatarbtn"
                onClick={() => uploadMedia('avatar')}
                disabled={uploading !== null}
                aria-label={me.avatarUrl ? 'Change profile picture' : 'Add profile picture'}
              >
                {uploading === 'avatar' ? '…' : '📷'}
              </button>
            )}
          </div>
          <div className="profilehead__id">
            {editingName ? (
              <span className="profilehead__editrow">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={40}
                  aria-label="Display name"
                />
                <button className="btn btn--dark" type="button" onClick={() => void patchName()}>
                  Save
                </button>
                <button className="btn btn--ghost" type="button" onClick={() => setEditingName(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <h2>
                {me.displayName}{' '}
                <button
                  type="button"
                  className="profilehead__editbtn"
                  onClick={() => {
                    setNewName(me.displayName);
                    setEditingName(true);
                  }}
                >
                  edit
                </button>
              </h2>
            )}
            <p>
              <span className="profilehead__kind">{me.kind.replace('_', ' ')}</span> · {me.email} ·
              age {me.age}
            </p>
          </div>
        </div>
        {!canPhoto && (
          <p className="card__note" style={{ margin: '10px 20px 0' }}>
            Profile photographs are not available under 18 — in any mode, under any consent
            setting. Your initials stand for you instead.
          </p>
        )}
        {profileNote && <p className="card__note" style={{ margin: '10px 20px 0' }}>{profileNote}</p>}
      </article>

      {/* ---- Account facts ---- */}
      <article className="card card--light">
        <div className="card__head">
          <h3 className="card__t">Account</h3>
          <span className="card__tag" style={{ color: 'var(--jm-excellent)' }}>{me.kind}</span>
        </div>
        {me.kind === 'minor' && (
          <div className="metric">
            <span className="metric__k">Guardian</span>
            <span className="metric__v" style={{ color: me.guardianConfirmed ? 'var(--jm-excellent)' : 'var(--jm-monitor)' }}>
              {me.guardianConfirmed
                ? 'confirmed'
                : me.guardianLinked
                  ? 'linked — confirmation email sent, awaiting their click'
                  : 'awaiting guardian — a confirmation email has been sent'}
            </span>
          </div>
        )}
        <div className="metric"><span className="metric__k">User ID</span><span className="metric__v"><code>{me.userId}</code></span></div>
        <div className="metric"><span className="metric__k">Session ends</span><span className="metric__v">{new Date(me.sessionExpires).toLocaleDateString('en-GB')}</span></div>
        <div className="metric">
          <span className="metric__k">Movement alerts</span>
          <span className="metric__v">
            {push === 'on' && 'on — arrives even when the app is closed'}
            {push === 'off' && (
              <button className="btn btn--dark" type="button" onClick={() => void enablePush(me.userId)}>
                Enable notifications
              </button>
            )}
            {push === 'busy' && 'asking your browser…'}
            {push === 'denied' && 'blocked in browser settings — allow notifications for jessmove.com to turn on'}
            {push === 'unsupported' && 'this browser cannot receive them — on iPhone, install the app to your home screen first'}
            {push === 'unconfigured' && 'not switched on for this deployment yet'}
            {push === 'checking' && '…'}
          </span>
        </div>
        <button className="btn btn--dark" type="button" onClick={() => void logout()} style={{ alignSelf: 'flex-start', marginTop: 12 }}>
          Sign out
        </button>
      </article>

      <article className="card card--light">
        <div className="card__head">
          <h3 className="card__t">Your AI allowance</h3>
          <span className="card__tag">ACU</span>
        </div>
        <div className="metric">
          <span className="metric__k">Balance</span>
          <span className="metric__v">{wallet ? `${wallet.balance} ACU` : '…'}</span>
        </div>
        <p className="card__note">
          Every AI action is priced before it runs and paid from this balance — there is no
          surprise bill, and at zero the AI features pause while everything else continues.
        </p>
      </article>

      <article className="card card--light">
        <div className="card__head">
          <h3 className="card__t">Quick links</h3>
        </div>
        <p className="card__note">
          <a href="/try">Try it as…</a> · <a href="/console">API console</a> ·{' '}
          <a href="/status">Platform status</a>
        </p>
      </article>

      {me.kind === 'platform_staff' && (
        <article className="card card--light">
          <div className="card__head">
            <h3 className="card__t">Admin</h3>
            <span className="card__tag" style={{ color: 'var(--jm-monitor)' }}>platform staff only</span>
          </div>

          <label>
            Grant ACU to user ID
            <input value={grantTarget} onChange={(e) => setGrantTarget(e.target.value)} placeholder="u_…" />
          </label>
          <label>
            Amount
            <input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} inputMode="numeric" />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn btn--dark" type="button" onClick={() => void grantAcu()}>
              Grant ACU
            </button>
            <button className="btn btn--dark" type="button" onClick={() => void testPush()}>
              Send me a test notification
            </button>
          </div>
          {adminResult && <p className="card__note" style={{ marginTop: 10 }}>{adminResult}</p>}
          <p className="card__note" style={{ marginTop: 10 }}>
            Live checks:{' '}
            <a href="https://api.jessmove.com/api/health" target="_blank" rel="noreferrer">health</a> ·{' '}
            <a href="https://api.jessmove.com/api/db/verify" target="_blank" rel="noreferrer">database rules</a> ·{' '}
            <a href="https://api.jessmove.com/api/stripe/status" target="_blank" rel="noreferrer">Stripe</a> ·{' '}
            <a href="https://api.jessmove.com/api/push/status" target="_blank" rel="noreferrer">push</a>
          </p>
        </article>
      )}

      {/* ---- Danger zone ---- */}
      <article className="card card--light dangerzone">
        <div className="card__head">
          <h3 className="card__t">Danger zone</h3>
          <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>permanent</span>
        </div>
        {!deleteArmed ? (
          <>
            <p className="card__note">
              Deleting your account removes your sign-in, your profile media, your notification
              devices and your session — permanently. Your name disappears; nothing keeps
              working in the background.
            </p>
            <button
              className="btn dangerzone__btn"
              type="button"
              onClick={() => setDeleteArmed(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              Delete this account…
            </button>
          </>
        ) : (
          <>
            <p className="card__note">
              <strong>This cannot be undone.</strong> Type your password to confirm.
            </p>
            <label>
              Password
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn dangerzone__btn" type="button" onClick={() => void deleteAccount()}>
                Permanently delete
              </button>
              <button className="btn btn--ghost" type="button" onClick={() => { setDeleteArmed(false); setDeletePassword(''); setDeleteNote(null); }}>
                Keep my account
              </button>
            </div>
            {deleteNote && <p className="card__note" style={{ marginTop: 10 }}>{deleteNote}</p>}
          </>
        )}
      </article>
    </>
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
