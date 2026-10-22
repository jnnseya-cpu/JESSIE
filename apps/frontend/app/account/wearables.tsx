'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api-base';
import { isNative, nativeCapabilities, requestHealthAccess, syncHealth } from '../native';

/**
 * Device connections, as far as they actually go.
 *
 * Named `DeviceConnections` rather than `Wearables` because
 * `products.tsx` already exports a `WearablesModule` and it is about
 * something else entirely — the four delivery tiers. One name for two
 * features is how somebody later edits the wrong file.
 *
 * Three of the seven providers are declared `on_device`: Apple Health,
 * Health Connect and Samsung Health. Those need no client credentials and
 * no partner agreement — `connect` marks them connected and the app pushes
 * samples to `/wearables/ingest`. The whole chain was written: the route,
 * the scope judge, the native bridge, `readHealth`, `syncHealth`.
 *
 * And nothing called any of it. `syncHealth` had no caller, so
 * `/wearables/connect`, `/wearables/status/:userId` and
 * `/wearables/revoke` were unreachable and the public page said, truly,
 * that not one of the seven could be connected. It was true because of a
 * missing button rather than because of a missing integration.
 *
 * The four cloud providers still cannot be connected here: Fitbit,
 * Garmin, Oura and Polar need registered client credentials, and two of
 * them are partner programmes rather than self-service. This component
 * says so rather than showing a button that fails.
 */

interface Connection {
  provider: string;
  label: string;
  state: string;
  transport: string;
  grantedScopes?: string[];
  waitingFor?: string | null;
}

interface StatusResponse {
  connections: Connection[];
  providers?: Connection[];
}

export function DeviceConnectionsModule({ me }: { me: { userId: string; age: number } }) {
  const [rows, setRows] = useState<Connection[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/wearables/status/${encodeURIComponent(me.userId)}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data: StatusResponse };
      setRows(json.data.connections ?? []);
    } catch {
      /* a status that cannot be read leaves the list as it was */
    }
  }, [me.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** On-device only. A cloud provider has nothing to offer without credentials. */
  const connect = async (provider: string) => {
    setBusy(provider);
    setNote(null);
    try {
      if (!isNative() || nativeCapabilities()?.health !== true) {
        setNote(
          'Apple Health and Health Connect can only be read by the installed app. On the web ' +
            'there is no store to read, so this stays unavailable rather than pretending.',
        );
        return;
      }

      const granted = await requestHealthAccess();
      if (!granted) {
        setNote('The device did not grant read access, so nothing was connected.');
        return;
      }

      const res = await fetch(`${apiBase()}/wearables/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: me.userId, provider, redirectUri: 'app://wearables' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);

      // Connecting is only half of it. A connection that has never synced
      // is indistinguishable from one that does not work.
      const accepted = await syncHealth(me.userId, me.age);
      setNote(
        accepted > 0
          ? `Connected, and ${accepted} reading${accepted === 1 ? '' : 's'} accepted.`
          : 'Connected. Nothing to read yet — it syncs as the device records.',
      );
      await load();
    } catch (e) {
      setNote(`could not connect: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  /*
   * Narrowing what a connected device shares.
   *
   * `narrowScopes` does more than stop future collection: it deletes what
   * the removed scope has already ingested. That is the strongest promise
   * in the wearables module and it was reachable by nothing, so a member
   * could neither narrow a connection nor cause that deletion.
   *
   * The remaining scopes are sent, not the removed one, because the
   * endpoint takes the set to keep — sending the removal would invert the
   * meaning on a request that deletes data.
   */
  const dropScope = async (provider: string, scope: string, granted: string[]) => {
    setBusy(`${provider}:${scope}`);
    setNote(null);
    try {
      const res = await fetch(`${apiBase()}/wearables/scopes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: me.userId,
          provider,
          scopes: granted.filter((s) => s !== scope),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      const removed = (json.data as { removed?: { scope: string; says?: string }[] }).removed ?? [];
      setNote(
        removed.length > 0
          ? `Stopped sharing ${removed.map((r) => r.scope).join(', ')}. What it had already sent has been deleted.`
          : 'Nothing changed.',
      );
      await load();
    } catch (e) {
      setNote(`could not change what is shared: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (provider: string) => {
    setBusy(provider);
    setNote(null);
    try {
      const res = await fetch(`${apiBase()}/wearables/revoke`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: me.userId, provider }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? `${res.status}`);
      setNote('Disconnected. Collection stops now rather than being paused.');
      await load();
    } catch (e) {
      setNote(`could not disconnect: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="acct__module">
      <h3>Wearables</h3>
      <p className="tdv__what">
        A connection improves the estimate and never gates anything. Without one, readiness comes
        from your declared windows, device inactivity and your own check-in.
      </p>

      {rows.length === 0 ? (
        <p className="fl__note">
          Nothing connected. Three of the seven devices read on the device itself and need the
          installed app; the other four need credentials we do not yet hold, and the{' '}
          <a href="/wearables">wearables page</a> says which is which.
        </p>
      ) : (
        <ul className="fl__ladder">
          {rows.map((r) => (
            <li key={r.provider}>
              <strong>
                {r.label ?? r.provider} — {r.state}
              </strong>
              <em>
                {r.transport === 'on_device'
                  ? 'Read on the device. Nothing leaves it unless you sync.'
                  : 'Reads through the provider cloud.'}
              </em>
              {r.grantedScopes && r.grantedScopes.length > 0 && (
                <span>
                  Sharing:{' '}
                  {r.grantedScopes.map((scope) => (
                    <button
                      key={scope}
                      className="chip"
                      type="button"
                      style={{ cursor: 'pointer', marginRight: 6 }}
                      disabled={busy === `${r.provider}:${scope}`}
                      onClick={() => void dropScope(r.provider, scope, r.grantedScopes ?? [])}
                      aria-label={`Stop sharing ${scope}`}
                    >
                      {busy === `${r.provider}:${scope}` ? 'removing…' : `${scope} ×`}
                    </button>
                  ))}
                </span>
              )}
              {r.state === 'connected' && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={busy === r.provider}
                  onClick={() => void revoke(r.provider)}
                >
                  {busy === r.provider ? 'Disconnecting…' : 'Disconnect'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="pwa__row" style={{ marginTop: 10 }}>
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy !== null}
          onClick={() => void connect('apple_health')}
        >
          {busy === 'apple_health' ? 'Connecting…' : 'Connect Apple Health'}
        </button>
        <button
          className="btn btn--primary"
          type="button"
          disabled={busy !== null}
          onClick={() => void connect('health_connect')}
        >
          {busy === 'health_connect' ? 'Connecting…' : 'Connect Health Connect'}
        </button>
      </div>

      {note && <p className="fl__note">{note}</p>}
    </section>
  );
}
