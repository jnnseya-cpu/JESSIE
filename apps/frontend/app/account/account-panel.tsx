'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Register, sign in, see your session, sign out.
 *
 * The session is an httpOnly cookie set by the API — this page never sees
 * or stores the token itself, which is the point: a token JavaScript can
 * read is a token an injected script can read.
 */

import { apiBase, mediaUrl } from '../api-base';
import { FoodLensModule, SnapModule } from './test-drive';
import { DashboardModule, useDashboard, type Dashboard } from './dashboard';
import { ScannerModule } from './scanner';
import { LedgerModule } from './ledger';
import { GrowthEngineModule } from './growth-engine';
import { InsightModule } from './insight';
import { StrengthModule } from './strength';
import {
  BodyCommandModule,
  ChallengesModule,
  GroupsModule,
  MovaModule,
  WearablesModule,
} from './products';
import { shrinkImage } from './image-shrink';
import { useAutosave, useSavedState } from './autosave';
import { FunnelBeacon } from '../funnel-beacon';
import { FunnelModule } from './funnel';
import { EditorialModule } from './editorial';

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

/** A password field with a show/hide eye. The value never leaves the input. */
function PasswordInput(props: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pwfield">
      <input
        id={props.id}
        type={shown ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        minLength={props.minLength}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
      />
      <button
        type="button"
        className="pwfield__eye"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}

export function AccountPanel() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [notice, setNotice] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<{ configured: boolean; userStore: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState('');
  const [honeypot, setHoneypot] = useState('');

  /*
   * The organisation whose link brought them, carried from /join/:code in
   * sessionStorage — which lasts exactly as long as the tab and needs no
   * banner. It is sent with registration so a route can be credited with
   * an account, and it is never stored against the account: which falls
   * group somebody came through is not a fact about them we should keep.
   */
  const [referrerCode, setReferrerCode] = useState('');
  useEffect(() => {
    try {
      setReferrerCode(sessionStorage.getItem('jm_referrer_code') ?? '');
    } catch {
      /* private browsing loses the attribution, never the signup */
    }
  }, []);

  useEffect(() => {
    void fetch(`${apiBase()}/auth/challenge`)
      .then((r) => r.json())
      .then((j) => setChallenge((j.data?.token as string) ?? ''))
      .catch(() => {});
  }, []);

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

  type Section = 'today' | 'food' | 'body' | 'grow' | 'team' | 'you';
  const [section, setSection] = useState<Section>('today');

  /*
   * Who sees the growth engine.
   *
   * Partners and staff. It is a set of marketing tools, and putting them
   * in front of somebody who joined to move more raises a reasonable
   * question about what they signed up to. The guard is on the server as
   * well — this only decides whether a tab is drawn.
   */
  const canGrow =
    me?.kind === 'growth_partner' ||
    me?.kind === 'platform_staff' ||
    me?.kind === 'organisation_admin';
  const { loaded: stateLoaded, state: savedState, restored } = useSavedState();
  useEffect(() => {
    if (!stateLoaded) return;
    const prefs = savedState['ui.preferences'] as { section?: Section } | undefined;
    if (prefs?.section) setSection(prefs.section);
  }, [stateLoaded, savedState]);
  useAutosave('ui.preferences', { section }, restored);

  // BodyCommand keeps a member's own figures in their drafts rather than on
  // a server, so the health picture is handed them from here.
  const bodyInputs = savedState['body.inputs'] as
    | { heightCm?: string; weightKg?: string; readings?: { day: string; kg: number }[] }
    | undefined;
  const heightCm = Number(bodyInputs?.heightCm) || null;
  const weightKg = Number(bodyInputs?.weightKg) || null;

  const { data: dash, refresh: refreshDash } = useDashboard();
  const onActivity = (fresh: Dashboard | null) => {
    if (fresh) refreshDash();
  };

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
      setUploading(slot);
      setProfileNote(null);
      try {
        // Shrunk in the browser: a camera photo would blow the request
        // pipeline's body limit; a cover needs at most 1600px anyway.
        const photo = await shrinkImage(file, slot === 'cover' ? 1600 : 640, 0.85);
        const res = await api('/auth/me/media', {
          slot,
          mimeType: photo.mimeType,
          dataBase64: photo.dataBase64,
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
      /*
       * The referral code is deliberately NOT in here. `human` is shared
       * with sign-in and password reset, whose shapes do not carry it, and
       * the API rejects unknown properties outright — so attaching it to
       * all three meant somebody who followed a falls group's link and
       * then signed in, because they already had an account, got a flat
       * 400 and could not get in. It belongs on registration alone, which
       * is the only place it means anything.
       */
      const human = {
        challenge,
        ...(honeypot ? { website: honeypot } : {}),
      };
      if (mode === 'forgot') {
        const res = await api('/auth/forgot', { ...human, email });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? `${res.status}`);
        setNotice(json.data.note ?? 'If that address has an account, a reset link is on its way.');
        return;
      }
      const body =
        mode === 'register'
          ? {
              ...human,
              email,
              password,
              displayName,
              age: Number(age),
              ...(Number(age) < 18 && guardianEmail ? { guardianEmail } : {}),
              ...(referrerCode ? { referrerCode } : {}),
            }
          : { ...human, email, password };
      const res = await api(`/auth/${mode}`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      // A stale or too-fresh challenge is cured by a new one + retry.
      void fetch(`${apiBase()}/auth/challenge`)
        .then((r) => r.json())
        .then((j) => setChallenge((j.data?.token as string) ?? ''))
        .catch(() => {});
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
            style={me.coverUrl ? { backgroundImage: `url(${mediaUrl(me.coverUrl)})` } : undefined}
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
                <img className="acct__avatar" src={mediaUrl(me.avatarUrl)} alt="" />
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

        {/* ---- One console, five places to stand ---- */}
        <nav className="acct__tabs" aria-label="Sections">
          {(
            [
              ['today', 'Today'],
              ['food', 'Food'],
              ['body', 'Body'],
              ['team', 'Team'],
              /*
                The engine is a partner's tool, so it is a partner's tab.
                Showing it to everybody would put a set of marketing
                controls in front of people who came here to move more, and
                every one of them would wonder what they had signed up to.
              */
              ...(canGrow ? ([['grow', 'Grow']] as const) : []),
              ['you', 'You'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={section === key ? 'acct__tab acct__tab--on' : 'acct__tab'}
              aria-current={section === key ? 'page' : undefined}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="acct__grid">
          {section === 'today' && (
            <>
              <DashboardModule data={dash} onActivity={onActivity} />
              <SnapModule me={me} onActivity={onActivity} />
              <MovaModule me={me} />
            </>
          )}

          {section === 'food' && (
            <>
              <FoodLensModule me={me} onActivity={onActivity} />
              <ScannerModule />
              <LedgerModule />
            </>
          )}

          {section === 'body' && (
            <>
              <BodyCommandModule me={me} dashboard={dash} />
              <InsightModule heightCm={heightCm} weightKg={weightKg} />
              <StrengthModule />
              <WearablesModule />
            </>
          )}

          {section === 'grow' && canGrow && <GrowthEngineModule />}

          {section === 'team' && (
            <>
              <ChallengesModule me={me} />
              <GroupsModule me={me} />
            </>
          )}

          {section === 'you' && me.kind === 'platform_staff' && (
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
          )}

          {section === 'you' && me.kind === 'platform_staff' && <FunnelModule />}
          {section === 'you' && me.kind === 'platform_staff' && <EditorialModule />}

          {section === 'you' && me.kind === 'platform_staff' && (
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

        {/* ---- Danger zone: under You, where a member expects it ---- */}
        {section === 'you' && (
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
                <PasswordInput
                  value={deletePassword}
                  onChange={setDeletePassword}
                  ariaLabel="Password"
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
        )}
      </div>
    );
  }

  return (
    <article className="acct-auth">
      {/*
        The two steps that matter most, because the gap between them is
        where the site was losing everybody: reaching this screen at all,
        and choosing to create an account rather than sign in. Somebody
        who opens this and never switches to register either already has
        an account or did not understand that they could make one here.
      */}
      <FunnelBeacon step="opened" />
      {mode === 'register' && <FunnelBeacon step="started" />}
      <div className="acct-auth__head">
        <h3>{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create your account' : 'Reset your password'}</h3>
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
        {mode !== 'forgot' && (
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'register' ? 10 : 1}
          />
          {mode === 'register' && <span className="field__hint">At least 10 characters. Length is the only rule.</span>}
        </div>
        )}
        {/* Honeypot: off-screen for people, irresistible to scripts. */}
        <div className="hpfield" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
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

        {mode === 'forgot' && (
          <span className="field__hint">
            We’ll email you a link that works for 30 minutes. The answer is the same whether or
            not an account exists — this form never confirms email addresses.
          </span>
        )}

        {error && <p className="probe__err">{error}</p>}
        {notice && <p className="acct-auth__notice">{notice}</p>}

        <div className="pwa__row" style={{ marginTop: 8 }}>
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Email me a reset link'}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'login' ? 'I need an account' : 'I already have one'}
          </button>
        </div>
        {mode === 'login' && (
          <button
            className="acct-auth__forgot"
            type="button"
            onClick={() => {
              setMode('forgot');
              setError(null);
              setNotice(null);
            }}
          >
            Forgot your password?
          </button>
        )}
      </form>
    </article>
  );
}
