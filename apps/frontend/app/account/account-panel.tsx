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

  interface FoundUser {
    userId: string;
    displayName: string;
    email: string;
    kind: string;
    age: number;
  }
  const [userQuery, setUserQuery] = useState('');
  const [results, setResults] = useState<FoundUser[] | null>(null);
  const [selected, setSelected] = useState<FoundUser | null>(null);

  const searchUsers = async () => {
    setAdminResult(null);
    setSelected(null);
    try {
      const res = await api(`/auth/admin/users?q=${encodeURIComponent(userQuery.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setResults(json.data.users as FoundUser[]);
    } catch (e) {
      setAdminResult(`search failed: ${(e as Error).message}`);
    }
  };

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
    const target = selected?.userId ?? (userQuery.trim().startsWith('u_') ? userQuery.trim() : grantTarget.trim());
    if (!target) {
      setAdminResult('find a person first — search by name or email, then click them');
      return;
    }
    setAdminResult('granting…');
    try {
      const res = await api('/acu/grant', {
        userId: target,
        acus: Number(grantAmount),
        note: 'admin grant from /account',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setAdminResult(`done — ${selected ? selected.displayName : target} now holds ${json.data.balance} ACU`);
      if (me && target === me.userId) void loadWallet(me.userId);
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
      <article className="acct-auth">
        <div className="acct-auth__head">
          <h3>Accounts are not enabled on this deployment</h3>
          <span className="acct-auth__tag">not configured</span>
        </div>
        <p className="acct__note" style={{ margin: 0 }}>
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
    const kindLabel = me.kind.replace(/_/g, ' ');

    return (
      <div className="acct">
        {/* ---- Identity ---- */}
        <section className="acct__hero">
          <div
            className="acct__cover"
            style={me.coverUrl ? { backgroundImage: `url(${me.coverUrl})` } : undefined}
          >
            {canPhoto && (
              <button
                type="button"
                className="acct__coverbtn"
                onClick={() => uploadMedia('cover')}
                disabled={uploading !== null}
              >
                {uploading === 'cover' ? 'Uploading…' : me.coverUrl ? 'Change cover' : 'Add cover'}
              </button>
            )}
          </div>
          <div className="acct__idrow">
            <div className="acct__avatarwrap">
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="acct__avatar" src={me.avatarUrl} alt="" />
              ) : (
                <div className="acct__avatar acct__avatar--initials">{initials}</div>
              )}
              {canPhoto && (
                <button
                  type="button"
                  className="acct__avatarbtn"
                  onClick={() => uploadMedia('avatar')}
                  disabled={uploading !== null}
                  aria-label={me.avatarUrl ? 'Change profile picture' : 'Add profile picture'}
                  title={me.avatarUrl ? 'Change profile picture' : 'Add profile picture'}
                >
                  {uploading === 'avatar' ? '…' : '＋'}
                </button>
              )}
            </div>
            <div className="acct__who">
              {editingName ? (
                <span className="acct__editrow">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={40}
                    aria-label="Display name"
                  />
                  <button className="btn btn--primary" type="button" onClick={() => void patchName()}>
                    Save
                  </button>
                  <button className="btn acct__ghostbtn" type="button" onClick={() => setEditingName(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <h2>
                  {me.displayName}
                  <button
                    type="button"
                    className="acct__editbtn"
                    onClick={() => {
                      setNewName(me.displayName);
                      setEditingName(true);
                    }}
                  >
                    edit
                  </button>
                </h2>
              )}
              <p className="acct__meta">
                <span className="acct__kind">{kindLabel}</span>
                <span>{me.email}</span>
                <span>age {me.age}</span>
              </p>
            </div>
            <div className="acct__heroactions">
              <button className="btn acct__ghostbtn" type="button" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          </div>
          {!canPhoto && (
            <p className="acct__note">
              Profile photographs are not available under 18 — in any mode, under any consent
              setting. Your initials stand for you instead.
            </p>
          )}
          {profileNote && <p className="acct__note">{profileNote}</p>}
        </section>

        {/* ---- The numbers that matter ---- */}
        <section className="acct__stats" aria-label="Account overview">
          <div className="acct__stat">
            <span className="acct__statk">AI allowance</span>
            <span className="acct__statv">
              {wallet ? wallet.balance.toLocaleString('en-GB') : '—'}
              <small> ACU</small>
            </span>
            <span className="acct__stats2">Priced before it runs. Never a surprise bill.</span>
          </div>

          <div className="acct__stat">
            <span className="acct__statk">Movement alerts</span>
            {push === 'on' && <span className="acct__statv acct__statv--ok">On</span>}
            {push === 'off' && (
              <button
                className="btn btn--primary acct__statbtn"
                type="button"
                onClick={() => void enablePush(me.userId)}
              >
                Turn on
              </button>
            )}
            {push === 'busy' && <span className="acct__statv">…</span>}
            {(push === 'denied' || push === 'unsupported' || push === 'unconfigured' || push === 'checking') && (
              <span className="acct__statv acct__statv--dim">Off</span>
            )}
            <span className="acct__stats2">
              {push === 'on' && 'Arrives even when the app is closed.'}
              {push === 'off' && 'One tap. Works with the app closed.'}
              {push === 'busy' && 'Asking your browser…'}
              {push === 'denied' && 'Blocked in browser settings for jessmove.com.'}
              {push === 'unsupported' && 'On iPhone, install the app to your home screen first.'}
              {push === 'unconfigured' && 'Not switched on for this deployment yet.'}
              {push === 'checking' && 'Checking this device…'}
            </span>
          </div>

          {me.kind === 'minor' ? (
            <div className="acct__stat">
              <span className="acct__statk">Guardian</span>
              <span className={me.guardianConfirmed ? 'acct__statv acct__statv--ok' : 'acct__statv acct__statv--warn'}>
                {me.guardianConfirmed ? 'Confirmed' : 'Pending'}
              </span>
              <span className="acct__stats2">
                {me.guardianConfirmed
                  ? 'Your guardian has confirmed this account.'
                  : 'A confirmation email has been sent to your guardian.'}
              </span>
            </div>
          ) : (
            <div className="acct__stat">
              <span className="acct__statk">Session</span>
              <span className="acct__statv">
                {new Date(me.sessionExpires).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              <span className="acct__stats2">Signed in on this device until then.</span>
            </div>
          )}

          <div className="acct__stat">
            <span className="acct__statk">User ID</span>
            <span className="acct__statv acct__statv--code">{me.userId}</span>
            <span className="acct__stats2">For allowance grants and support.</span>
          </div>
        </section>

        {/* ---- Modules ---- */}
        <div className="acct__grid">
          <section className="acct__module">
            <h3>Explore</h3>
            <nav className="acct__links" aria-label="Account shortcuts">
              <a href="/try">
                <span>Try it as…</span>
                <em>Every age mode, side by side</em>
              </a>
              <a href="/console">
                <span>API console</span>
                <em>The engine, hands on</em>
              </a>
              <a href="/status">
                <span>Platform status</span>
                <em>Live, from the API itself</em>
              </a>
            </nav>
          </section>

          {me.kind === 'platform_staff' && (
            <section className="acct__module acct__module--admin">
              <h3>
                Admin <span className="acct__adminchip">platform staff</span>
              </h3>
              <div className="acct__adminform">
                <label>
                  <span>Find a person — name, email or user ID</span>
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void searchUsers();
                      }
                    }}
                    placeholder="e.g. Kim, or kim@example.com"
                  />
                </label>
                <label>
                  <span>Amount</span>
                  <input value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} inputMode="numeric" />
                </label>
              </div>
              <div className="acct__adminrow" style={{ marginTop: 10 }}>
                <button className="btn acct__ghostbtn" type="button" onClick={() => void searchUsers()}>
                  Search
                </button>
                {selected && (
                  <span className="acct__selecteduser">
                    {selected.displayName} · {selected.email} · {selected.kind.replace(/_/g, ' ')}, {selected.age}
                  </span>
                )}
              </div>
              {results && !selected && (
                <ul className="acct__results">
                  {results.length === 0 && <li className="acct__results-empty">Nobody matches that.</li>}
                  {results.map((u) => (
                    <li key={u.userId}>
                      <button type="button" onClick={() => { setSelected(u); setResults(null); }}>
                        <span>{u.displayName}</span>
                        <em>{u.email} · {u.kind.replace(/_/g, ' ')}, {u.age}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="acct__adminrow">
                <button className="btn btn--primary" type="button" onClick={() => void grantAcu()}>
                  Grant ACU
                </button>
                <button className="btn acct__ghostbtn" type="button" onClick={() => void testPush()}>
                  Send me a test notification
                </button>
              </div>
              {adminResult && <p className="acct__note">{adminResult}</p>}
              <p className="acct__livechecks">
                Live checks:{' '}
                <a href="https://api.jessmove.com/api/health" target="_blank" rel="noreferrer">health</a>
                <a href="https://api.jessmove.com/api/db/verify" target="_blank" rel="noreferrer">database rules</a>
                <a href="https://api.jessmove.com/api/stripe/status" target="_blank" rel="noreferrer">Stripe</a>
                <a href="https://api.jessmove.com/api/push/status" target="_blank" rel="noreferrer">push</a>
              </p>
            </section>
          )}
        </div>

        {/* ---- Danger zone ---- */}
        <section className="acct__danger">
          <div className="acct__dangerhead">
            <h3>Danger zone</h3>
            <span>permanent</span>
          </div>
          {!deleteArmed ? (
            <div className="acct__dangerrow">
              <p>
                Deleting your account removes your sign-in, profile media, notification devices
                and session — permanently.
              </p>
              <button className="btn acct__dangerbtn" type="button" onClick={() => setDeleteArmed(true)}>
                Delete this account…
              </button>
            </div>
          ) : (
            <div className="acct__dangerconfirm">
              <p>
                <strong>This cannot be undone.</strong> Type your password to confirm.
              </p>
              <div className="acct__dangerrow">
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  aria-label="Password"
                  placeholder="Your password"
                />
                <button className="btn acct__dangerbtn" type="button" onClick={() => void deleteAccount()}>
                  Permanently delete
                </button>
                <button
                  className="btn acct__ghostbtn"
                  type="button"
                  onClick={() => {
                    setDeleteArmed(false);
                    setDeletePassword('');
                    setDeleteNote(null);
                  }}
                >
                  Keep my account
                </button>
              </div>
              {deleteNote && <p className="acct__note">{deleteNote}</p>}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <article className="acct-auth">
      <div className="acct-auth__head">
        <h3>{mode === 'login' ? 'Sign in' : 'Create your account'}</h3>
        {status?.userStore === 'memory' && <span className="acct-auth__tag">dev store</span>}
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
