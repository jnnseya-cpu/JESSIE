import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { buildPushRequest, type VapidKeys } from './webpush.logic';

/**
 * Push subscriptions and delivery.
 *
 * This is what lets Jess Move reach a person whose app is closed: the
 * browser hands over a push endpoint once, it is stored durably in
 * Postgres, and from then on the server can wake the device through the
 * push service — the same mechanism messengers use. The payload is
 * encrypted to the subscription's own keys (RFC 8291, proven against
 * the spec's test vector), so the push service in the middle relays
 * bytes it cannot read.
 *
 * Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT. With
 * none set, /push/status says so and nothing else changes.
 */

export interface StoredSubscription {
  readonly endpoint: string;
  readonly userId: string | null;
  readonly p256dh: string;
  readonly auth: string;
}

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
}

@Injectable()
export class PushService implements OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly memory = new Map<string, StoredSubscription>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => PgPoolLike };
      this.pool = new Pool({
        connectionString: url,
        max: 2,
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
    }
  }

  private vapid(): VapidKeys | null {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  }

  private subject(): string {
    return process.env.VAPID_SUBJECT ?? 'mailto:jess@jessmove.com';
  }

  configured(): boolean {
    return this.vapid() !== null;
  }

  status(): Record<string, unknown> {
    return {
      configured: this.configured(),
      publicKey: this.vapid()?.publicKey ?? null,
      store: this.pool ? 'postgres' : 'memory',
      note: this.configured()
        ? 'Ready. The page subscribes with this public key; the private key never leaves the server.'
        : 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to enable background notifications.',
    };
  }

  async subscribe(sub: StoredSubscription): Promise<{ stored: true }> {
    if (!sub.endpoint.startsWith('https://')) {
      throw new BadRequestException('a push endpoint is always an https URL');
    }
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4`,
        [sub.endpoint, sub.userId, sub.p256dh, sub.auth],
      );
    } else {
      this.memory.set(sub.endpoint, sub);
    }
    return { stored: true };
  }

  async unsubscribe(endpoint: string): Promise<{ removed: boolean }> {
    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING endpoint',
        [endpoint],
      );
      return { removed: result.rows.length > 0 };
    }
    return { removed: this.memory.delete(endpoint) };
  }

  private async subscriptionsFor(userId?: string): Promise<StoredSubscription[]> {
    if (this.pool) {
      const result = userId
        ? await this.pool.query(
            'SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
            [userId],
          )
        : await this.pool.query('SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions');
      return result.rows.map((r) => ({
        endpoint: String(r.endpoint),
        userId: r.user_id == null ? null : String(r.user_id),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
      }));
    }
    const all = [...this.memory.values()];
    return userId ? all.filter((s) => s.userId === userId) : all;
  }

  /**
   * Delivers a notification. A 404/410 from the push service means the
   * subscription is dead (app uninstalled, permission revoked) — it is
   * deleted rather than retried forever.
   */
  async send(
    payload: { title: string; body: string; url?: string },
    userId?: string,
  ): Promise<Record<string, unknown>> {
    const vapid = this.vapid();
    if (!vapid) {
      throw new BadRequestException(
        'Push is not configured — set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.',
      );
    }
    const subs = await this.subscriptionsFor(userId);
    if (subs.length === 0) {
      return { sent: 0, note: userId ? 'no subscriptions for this user' : 'no subscriptions at all' };
    }

    let sent = 0;
    let expired = 0;
    const failures: string[] = [];
    for (const sub of subs) {
      const request = buildPushRequest(
        sub.endpoint,
        payload,
        { p256dh: sub.p256dh, auth: sub.auth },
        vapid,
        this.subject(),
      );
      try {
        const response = (await fetch(sub.endpoint, {
          method: 'POST',
          headers: request.headers,
          body: new Uint8Array(request.body),
        })) as unknown as FetchResponse;
        if (response.ok) {
          sent += 1;
        } else if (response.status === 404 || response.status === 410) {
          await this.unsubscribe(sub.endpoint);
          expired += 1;
        } else {
          failures.push(`${response.status} ${response.statusText}`);
        }
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    this.logger.log(`push: sent=${sent} expired=${expired} failed=${failures.length}`);
    return { sent, expired, failures };
  }

  /** Account deletion's sweep: every device this user registered. */
  async deleteForUser(userId: string): Promise<number> {
    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 RETURNING endpoint',
        [userId],
      );
      return result.rows.length;
    }
    let removed = 0;
    for (const [endpoint, sub] of this.memory) {
      if (sub.userId === userId) {
        this.memory.delete(endpoint);
        removed += 1;
      }
    }
    return removed;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
