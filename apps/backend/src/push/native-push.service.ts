import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { connect, type ClientHttp2Session } from 'node:http2';
import { makePool, type PgPoolLike } from '../db/pg';
import {
  JWT_REFRESH_SECONDS,
  apnsHost,
  apnsJwt,
  apnsRequest,
  classifyApns,
  type ApnsCredentials,
  type DeliveryVerdict,
  type PushContent,
} from './apns.logic';
import {
  TOKEN_ENDPOINT,
  classifyFcm,
  fcmMessage,
  fcmSendUrl,
  serviceAccountJwt,
  type FcmCredentials,
} from './fcm.logic';

/**
 * Notifications for the installed app.
 *
 * Web Push reaches a browser and cannot reach either shell: a Capacitor
 * webview has no `PushManager`, on iOS because Safari's push is a Home
 * Screen web app feature the shell is not, and on Android because the
 * System WebView has no push at all. So `account-panel.tsx` checked for
 * it, found nothing, and told members that notifications were unsupported
 * — inside the application that exists to deliver them.
 *
 * This is the other half. `PushService` stays the single door every
 * caller already uses; it fans out to here for native devices, so the
 * scheduler did not have to learn about transports.
 *
 * ## What is different about a native notification, and said plainly
 *
 * Web Push encrypts the payload to the device's own keys, so the push
 * service relays bytes it cannot read. APNs and FCM do not work that way:
 * the transport is encrypted, the vendor can read the alert text.
 *
 * That is why the notification body is a movement name and a duration and
 * stays that way. Nothing about a health reading, a symptom, a body
 * measurement, a wallet balance or a FoodLens result goes through a
 * vendor's push infrastructure, and the deep link carries a path rather
 * than anything about the person it will show.
 */

export type PushTransport = 'apns' | 'fcm';

export interface DeviceToken {
  readonly token: string;
  readonly userId: string | null;
  readonly transport: PushTransport;
  readonly utcOffsetMinutes?: number | null;
}

interface CachedJwt {
  readonly value: string;
  readonly expiresAtSeconds: number;
}

/** How long a delivery attempt gets before it is treated as a failure. */
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class NativePushService implements OnModuleDestroy {
  private readonly logger = new Logger(NativePushService.name);
  private readonly memory = new Map<string, DeviceToken>();
  private pool: PgPoolLike | null = null;

  private apnsToken: CachedJwt | null = null;
  private googleToken: CachedJwt | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) this.pool = makePool(url, 2);
  }

  /* ---------------- credentials ---------------- */

  private apns(): ApnsCredentials | null {
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const topic = process.env.APNS_TOPIC;
    // Newlines survive a Vercel environment variable as the two
    // characters `\` and `n`; a PEM with those in it fails to parse with
    // an error that says nothing useful about why.
    const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!keyId || !teamId || !topic || !privateKey) return null;
    return {
      keyId,
      teamId,
      topic,
      privateKey,
      // Defaults to production, because a deployment that forgot the
      // variable is a deployment that is live. A sandbox default would
      // send every real notification to an endpoint that rejects it.
      production: process.env.APNS_ENVIRONMENT !== 'sandbox',
    };
  }

  private fcm(): FcmCredentials | null {
    const projectId = process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
  }

  configured(transport?: PushTransport): boolean {
    if (transport === 'apns') return this.apns() !== null;
    if (transport === 'fcm') return this.fcm() !== null;
    return this.apns() !== null || this.fcm() !== null;
  }

  status(): Record<string, unknown> {
    return {
      apns: this.apns() ? (this.apns()!.production ? 'production' : 'sandbox') : null,
      fcm: this.fcm() ? this.fcm()!.projectId : null,
      store: this.pool ? 'postgres' : 'memory',
    };
  }

  /* ---------------- registration ---------------- */

  async register(device: DeviceToken): Promise<{ stored: true }> {
    if (device.token.length < 16) {
      throw new BadRequestException('that is not a device token');
    }
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO device_push_tokens (token, user_id, transport, utc_offset_minutes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (token) DO UPDATE
           SET user_id = $2,
               transport = $3,
               utc_offset_minutes = $4,
               last_seen_at = now()`,
        [device.token, device.userId, device.transport, device.utcOffsetMinutes ?? null],
      );
    } else {
      this.memory.set(device.token, device);
    }
    return { stored: true };
  }

  async unregister(token: string): Promise<{ removed: boolean }> {
    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM device_push_tokens WHERE token = $1 RETURNING token',
        [token],
      );
      return { removed: result.rows.length > 0 };
    }
    return { removed: this.memory.delete(token) };
  }

  /** Account deletion's sweep. Every device this member registered. */
  async deleteForUser(userId: string): Promise<number> {
    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM device_push_tokens WHERE user_id = $1 RETURNING token',
        [userId],
      );
      return result.rows.length;
    }
    let removed = 0;
    for (const [token, device] of this.memory) {
      if (device.userId === userId) {
        this.memory.delete(token);
        removed += 1;
      }
    }
    return removed;
  }

  private async tokensFor(userId?: string): Promise<DeviceToken[]> {
    if (this.pool) {
      const result = userId
        ? await this.pool.query(
            'SELECT token, user_id, transport, utc_offset_minutes FROM device_push_tokens WHERE user_id = $1',
            [userId],
          )
        : await this.pool.query(
            'SELECT token, user_id, transport, utc_offset_minutes FROM device_push_tokens',
          );
      return result.rows.map((r) => ({
        token: String(r.token),
        userId: r.user_id == null ? null : String(r.user_id),
        transport: String(r.transport) as PushTransport,
        utcOffsetMinutes: r.utc_offset_minutes == null ? null : Number(r.utc_offset_minutes),
      }));
    }
    const all = [...this.memory.values()];
    return userId ? all.filter((d) => d.userId === userId) : all;
  }

  /* ---------------- delivery ---------------- */

  async send(
    content: PushContent,
    userId?: string,
  ): Promise<{ attempted: number; sent: number; expired: number; failures: string[] }> {
    const devices = await this.tokensFor(userId);
    const failures: string[] = [];
    let sent = 0;
    let expired = 0;

    const apple = devices.filter((d) => d.transport === 'apns');
    const google = devices.filter((d) => d.transport === 'fcm');

    /*
     * A registered device with no credentials to reach it is named, not
     * skipped. The difference matters to whoever reads `nudge_runs`:
     * "this member has no device" and "this deployment has no APNs key"
     * look identical from a count of zero and have nothing in common as
     * problems.
     */
    if (apple.length > 0 && !this.apns()) {
      failures.push(`apns not configured (${apple.length} device(s) waiting)`);
    }
    if (google.length > 0 && !this.fcm()) {
      failures.push(`fcm not configured (${google.length} device(s) waiting)`);
    }

    if (apple.length > 0 && this.apns()) {
      const result = await this.sendApns(apple, content);
      sent += result.sent;
      expired += result.expired;
      failures.push(...result.failures);
    }

    if (this.fcm()) {
      for (const device of google) {
        const verdict = await this.sendOneFcm(device, content);
        if (verdict === 'delivered') sent += 1;
        else if (verdict === 'expired') {
          await this.unregister(device.token);
          expired += 1;
        } else failures.push(`fcm ${verdict}`);
      }
    }

    return { attempted: devices.length, sent, expired, failures };
  }

  /**
   * APNs, over one HTTP/2 session for the whole batch.
   *
   * HTTP/2 is not an optimisation here, it is the only protocol APNs
   * speaks — `fetch` in Node is HTTP/1.1 and fails at connect with an
   * error that reads like a network fault. One session for the batch
   * because opening a TLS connection per device is what makes a hundred
   * notifications take a minute.
   */
  private async sendApns(
    devices: DeviceToken[],
    content: PushContent,
  ): Promise<{ sent: number; expired: number; failures: string[] }> {
    const credentials = this.apns();
    if (!credentials) return { sent: 0, expired: 0, failures: [] };

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!this.apnsToken || this.apnsToken.expiresAtSeconds <= nowSeconds) {
      // Apple rejects a JWT older than an hour and rate-limits one
      // regenerated too often, so it is cached rather than minted per
      // notification.
      this.apnsToken = {
        value: apnsJwt(credentials, nowSeconds),
        expiresAtSeconds: nowSeconds + JWT_REFRESH_SECONDS,
      };
    }

    let session: ClientHttp2Session;
    try {
      session = connect(apnsHost(credentials.production));
    } catch (error) {
      return { sent: 0, expired: 0, failures: [`apns connect: ${(error as Error).message}`] };
    }

    const failures: string[] = [];
    let sent = 0;
    let expired = 0;

    try {
      for (const device of devices) {
        const request = apnsRequest(device.token, content, this.apnsToken.value, credentials);
        const verdict = await this.oneApnsRequest(session, request);
        if (verdict === 'delivered') sent += 1;
        else if (verdict === 'expired') {
          await this.unregister(device.token);
          expired += 1;
        } else failures.push(`apns ${verdict}`);
      }
    } finally {
      session.close();
    }

    return { sent, expired, failures };
  }

  private oneApnsRequest(
    session: ClientHttp2Session,
    request: { headers: Record<string, string>; body: string },
  ): Promise<DeliveryVerdict> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (verdict: DeliveryVerdict) => {
        if (!settled) {
          settled = true;
          resolve(verdict);
        }
      };

      try {
        const stream = session.request(request.headers);
        stream.setTimeout(REQUEST_TIMEOUT_MS, () => {
          stream.close();
          finish('retry');
        });

        let status = 0;
        let body = '';
        stream.on('response', (headers) => {
          status = Number(headers[':status'] ?? 0);
        });
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => {
          body += chunk;
        });
        stream.on('end', () => {
          // A 200 has no body at all; a rejection has {"reason":"..."}.
          let reason: string | undefined;
          try {
            reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
          } catch {
            reason = undefined;
          }
          finish(classifyApns(status, reason));
        });
        stream.on('error', () => finish('retry'));

        stream.end(request.body);
      } catch {
        finish('failed');
      }
    });
  }

  /**
   * A Google access token, exchanged from a signed assertion.
   *
   * Cached for slightly less than the hour Google grants, because a token
   * that expires mid-batch fails every remaining device with an error
   * that looks like a credential problem rather than a clock one.
   */
  private async googleAccessToken(): Promise<string | null> {
    const credentials = this.fcm();
    if (!credentials) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.googleToken && this.googleToken.expiresAtSeconds > nowSeconds + 60) {
      return this.googleToken.value;
    }

    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: serviceAccountJwt(credentials, nowSeconds),
        }).toString(),
      });
      if (!response.ok) {
        this.logger.warn(`fcm token exchange: ${response.status}`);
        return null;
      }
      const json = (await response.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) return null;
      this.googleToken = {
        value: json.access_token,
        expiresAtSeconds: nowSeconds + (json.expires_in ?? 3600),
      };
      return this.googleToken.value;
    } catch (error) {
      this.logger.warn(`fcm token exchange failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async sendOneFcm(device: DeviceToken, content: PushContent): Promise<DeliveryVerdict> {
    const credentials = this.fcm();
    const accessToken = await this.googleAccessToken();
    if (!credentials || !accessToken) return 'retry';

    try {
      const response = await fetch(fcmSendUrl(credentials.projectId), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(fcmMessage(device.token, content)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return 'delivered';
      const json = (await response.json().catch(() => ({}))) as {
        error?: { status?: string };
      };
      return classifyFcm(response.status, json.error?.status);
    } catch {
      return 'retry';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
