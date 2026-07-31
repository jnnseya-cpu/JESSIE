import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEGRADATION,
  PROVIDERS,
  PROVIDER_DEFINITIONS,
  REVOCATION_GUARANTEES,
  disclosureFor,
  isStale,
  resolveConflict,
  shouldWidenForDisagreement,
  type DataScope,
  type Provider,
  type Reading,
} from '@jessmove/shared';
import { OAUTH, isOauthProvider, judgeSample, type Sample } from './wearables.logic';

interface Connection {
  state: 'connected' | 'revoked';
  grantedScopes: DataScope[];
  connectedAt: string;
  transport: 'on_device' | 'oauth_cloud';
  /** Present only for cloud providers after a token exchange. */
  accessToken?: string;
  refreshToken?: string;
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
}

/**
 * FUSE — wearable connections and ingestion.
 *
 * Cloud providers (Fitbit, Oura, Polar) connect over standard OAuth2 the
 * moment their CLIENT_ID/CLIENT_SECRET env pair exists — until then the
 * connect endpoint says exactly which variables are missing. On-device
 * providers (Apple Health, Health Connect, Samsung Health) push samples
 * from the phone app; their raw data never leaves the device except as
 * the normalised samples the user consented to.
 *
 * Ingestion enforces the shared promises sample-by-sample: nothing on
 * the never-ingested list, nothing a provider was never asked for,
 * nothing a revoked scope covers, and no body measurements under 18.
 * Storage here is instance memory — durable readings are the same next
 * repository slice as profiles and wallets.
 */
@Injectable()
export class WearablesService {
  private readonly logger = new Logger(WearablesService.name);
  private readonly connections = new Map<string, Connection>();
  private readonly readings = new Map<string, (Reading & { receivedAt: string })[]>();

  providers(): Record<string, unknown> {
    return {
      providers: PROVIDERS.map((p) => {
        const def = PROVIDER_DEFINITIONS[p];
        return {
          ...def,
          disclosure: disclosureFor(p),
          connection: this.connectionInfo(p),
        };
      }),
      revocationGuarantees: REVOCATION_GUARANTEES,
    };
  }

  private connectionInfo(p: Provider): Record<string, unknown> {
    if (PROVIDER_DEFINITIONS[p].transport === 'on_device') {
      return { method: 'on_device', ready: true, note: 'The phone app pushes consented samples to /wearables/ingest.' };
    }
    if (!isOauthProvider(p)) return { method: 'oauth_cloud', ready: false };
    const oauth = OAUTH[p];
    if (oauth.style === 'partner_programme') {
      return {
        method: 'partner_programme',
        ready: false,
        note: 'Garmin Health API access is granted through their partner programme; the connection activates once those credentials exist.',
      };
    }
    const configured =
      Boolean(process.env[`${oauth.envPrefix}_CLIENT_ID`]) &&
      Boolean(process.env[`${oauth.envPrefix}_CLIENT_SECRET`]);
    return {
      method: 'oauth_cloud',
      ready: configured,
      ...(configured
        ? {}
        : { needs: [`${oauth.envPrefix}_CLIENT_ID`, `${oauth.envPrefix}_CLIENT_SECRET`] }),
    };
  }

  connect(userId: string, provider: Provider, redirectUri: string): Record<string, unknown> {
    const def = PROVIDER_DEFINITIONS[provider];
    if (def.transport === 'on_device') {
      this.connections.set(this.key(userId, provider), {
        state: 'connected',
        grantedScopes: [...def.requests],
        connectedAt: new Date().toISOString(),
        transport: 'on_device',
      });
      return {
        mode: 'on_device',
        connected: true,
        note: `${def.label} syncs on the device. The app may now push the consented scopes to /wearables/ingest.`,
        scopes: def.requests,
      };
    }

    if (!isOauthProvider(provider) || OAUTH[provider].style === 'partner_programme') {
      throw new BadRequestException(
        `${def.label} connects through a provider partner programme, not self-service OAuth. It is listed so nothing pretends otherwise.`,
      );
    }
    const oauth = OAUTH[provider];
    const clientId = process.env[`${oauth.envPrefix}_CLIENT_ID`];
    if (!clientId || !process.env[`${oauth.envPrefix}_CLIENT_SECRET`]) {
      throw new BadRequestException(
        `${def.label} OAuth is not configured on this deployment. Set ${oauth.envPrefix}_CLIENT_ID and ${oauth.envPrefix}_CLIENT_SECRET.`,
      );
    }
    const url = new URL(oauth.authorize!);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', def.requests.join(' '));
    return {
      mode: 'oauth_cloud',
      authUrl: url.toString(),
      then: 'Send the returned code to POST /wearables/callback.',
      disclosure: disclosureFor(provider),
    };
  }

  async callback(
    userId: string,
    provider: Provider,
    code: string,
    redirectUri: string,
  ): Promise<Record<string, unknown>> {
    if (!isOauthProvider(provider) || OAUTH[provider].style === 'partner_programme') {
      throw new BadRequestException(`${provider} does not use the OAuth callback flow.`);
    }
    const oauth = OAUTH[provider];
    const clientId = process.env[`${oauth.envPrefix}_CLIENT_ID`];
    const clientSecret = process.env[`${oauth.envPrefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        `${provider} OAuth is not configured — set ${oauth.envPrefix}_CLIENT_ID and ${oauth.envPrefix}_CLIENT_SECRET.`,
      );
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      ...(oauth.style === 'body_secret' ? { client_id: clientId, client_secret: clientSecret } : {}),
    });

    const response = (await fetch(oauth.token!, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(oauth.style === 'basic_auth'
          ? { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}` }
          : {}),
      },
      body: body.toString(),
    })) as unknown as FetchResponse;

    if (!response.ok) {
      throw new BadRequestException(
        `${provider} token exchange failed: ${response.status} ${response.statusText}`,
      );
    }
    const tokens = (await response.json()) as { access_token?: string; refresh_token?: string };
    if (!tokens.access_token) {
      throw new BadRequestException(`${provider} returned no access token.`);
    }

    const def = PROVIDER_DEFINITIONS[provider];
    this.connections.set(this.key(userId, provider), {
      state: 'connected',
      grantedScopes: [...def.requests],
      connectedAt: new Date().toISOString(),
      transport: 'oauth_cloud',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
    this.logger.log(`wearable connected: ${provider} for ${userId}`);
    return { connected: true, provider, scopes: def.requests };
  }

  ingest(
    userId: string,
    provider: Provider,
    age: number,
    samples: Sample[],
  ): Record<string, unknown> {
    const def = PROVIDER_DEFINITIONS[provider];
    let connection = this.connections.get(this.key(userId, provider));

    // On-device providers may push without a prior connect call — the
    // connection *is* the app holding the user's on-device consent.
    if (!connection && def.transport === 'on_device') {
      connection = {
        state: 'connected',
        grantedScopes: [...def.requests],
        connectedAt: new Date().toISOString(),
        transport: 'on_device',
      };
      this.connections.set(this.key(userId, provider), connection);
    }
    if (!connection || connection.state !== 'connected') {
      throw new BadRequestException(`${def.label} is not connected for this user.`);
    }

    const accepted: { scope: DataScope; value: number }[] = [];
    const refused: { scope: string; why: string }[] = [];

    for (const sample of samples) {
      const verdict = judgeSample(sample, provider, age, connection.grantedScopes);
      if (!verdict.ok || !verdict.scope) {
        refused.push({ scope: sample.scope, why: verdict.why ?? 'refused' });
        continue;
      }
      const list = this.readings.get(userId) ?? [];
      list.push({
        provider,
        scope: verdict.scope,
        value: sample.value,
        ageMinutes: sample.ageMinutes,
        receivedAt: new Date().toISOString(),
      });
      this.readings.set(userId, list);
      accepted.push({ scope: verdict.scope, value: sample.value });
    }

    if (accepted.length === 0 && refused.length > 0) {
      // Nothing usable — make the refusal loud rather than a quiet 201.
      throw new BadRequestException({ message: 'Every sample was refused.', refused });
    }
    return { accepted, refused };
  }

  narrowScopes(userId: string, provider: Provider, scopes: DataScope[]): Record<string, unknown> {
    const connection = this.connections.get(this.key(userId, provider));
    if (!connection) throw new NotFoundException(`${provider} is not connected for this user.`);
    const def = PROVIDER_DEFINITIONS[provider];
    const kept = scopes.filter((s) => def.requests.includes(s));
    const removed = connection.grantedScopes.filter((s) => !kept.includes(s));
    connection.grantedScopes = kept;

    // Revoking a scope deletes what that scope already ingested.
    const list = this.readings.get(userId) ?? [];
    this.readings.set(
      userId,
      list.filter((r) => !(r.provider === provider && removed.includes(r.scope))),
    );

    return {
      granted: kept,
      removed: removed.map((s) => ({ scope: s, ...DEGRADATION[s] })),
    };
  }

  revoke(userId: string, provider: Provider): Record<string, unknown> {
    const key = this.key(userId, provider);
    const existed = this.connections.delete(key);
    const before = this.readings.get(userId) ?? [];
    const kept = before.filter((r) => r.provider !== provider);
    this.readings.set(userId, kept);
    return {
      revoked: existed,
      readingsDeleted: before.length - kept.length,
      guarantees: REVOCATION_GUARANTEES,
    };
  }

  status(userId: string): Record<string, unknown> {
    const connections = PROVIDERS.filter((p) => this.connections.has(this.key(userId, p))).map(
      (p) => {
        const c = this.connections.get(this.key(userId, p))!;
        return { provider: p, state: c.state, grantedScopes: c.grantedScopes, connectedAt: c.connectedAt };
      },
    );
    const list = this.readings.get(userId) ?? [];
    const byScope = new Map<DataScope, Reading[]>();
    for (const r of list) {
      byScope.set(r.scope, [...(byScope.get(r.scope) ?? []), r]);
    }
    const latest = [...byScope.entries()].map(([scope, readings]) => {
      const resolved = resolveConflict(readings);
      return {
        scope,
        value: resolved.chosen.value,
        provider: resolved.chosen.provider,
        because: resolved.because,
        stale: isStale(resolved.chosen),
        disagreementPct: resolved.disagreementPct,
        widened: shouldWidenForDisagreement(resolved.disagreementPct),
      };
    });
    return { connections, latest };
  }

  private key(userId: string, provider: Provider): string {
    return `${userId}:${provider}`;
  }
}
