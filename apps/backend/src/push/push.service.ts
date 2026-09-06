import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { NativePushService } from './native-push.service';
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
  /**
   * Minutes east of UTC, as the browser reported at subscribe time.
   *
   * The scheduler runs in UTC and has to know whether it is eleven in the
   * morning where the member is; nothing else on the platform records a
   * time zone, and the browser is the only thing that knows. Null when an
   * older client did not send one — the scheduler skips those rather than
   * guessing at somebody's midnight.
   */
  readonly utcOffsetMinutes?: number | null;
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

  constructor(private readonly native: NativePushService) {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
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

  /**
   * Whether a browser can be subscribed. Web Push only, by name.
   *
   * Kept narrow deliberately: `account-panel.tsx` reads this to decide
   * whether to hand a VAPID public key to `pushManager.subscribe`, and an
   * answer that also counted APNs would have it try with no key at all.
   * The scheduler asks `canReachAnybody()` instead.
   */
  configured(): boolean {
    return this.vapid() !== null;
  }

  /**
   * Whether any transport can reach any device.
   *
   * The scheduler used to abort its entire run on `configured()`, which
   * was right when Web Push was the only way out and wrong the moment it
   * was not: a deployment with APNs and FCM set up but no VAPID keys
   * would have skipped every member on every run, and reported it as
   * "push is not configured".
   */
  canReachAnybody(): boolean {
    return this.configured() || this.native.configured();
  }

  status(): Record<string, unknown> {
    return {
      configured: this.configured(),
      publicKey: this.vapid()?.publicKey ?? null,
      store: this.pool ? 'postgres' : 'memory',
      native: this.native.status(),
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
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, utc_offset_minutes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE
           SET user_id = $2, p256dh = $3, auth = $4, utc_offset_minutes = $5`,
        [sub.endpoint, sub.userId, sub.p256dh, sub.auth, sub.utcOffsetMinutes ?? null],
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
      // The offset is selected because `StoredSubscription` declares it.
      // It was documented, stored on subscribe, and then never read back —
      // so every subscription this method returned looked offset-less to
      // anything that asked. The scheduler queries the column itself and
      // was unaffected; the next caller would not have been.
      const columns = 'endpoint, user_id, p256dh, auth, utc_offset_minutes';
      const result = userId
        ? await this.pool.query(
            `SELECT ${columns} FROM push_subscriptions WHERE user_id = $1`,
            [userId],
          )
        : await this.pool.query(`SELECT ${columns} FROM push_subscriptions`);
      return result.rows.map((r) => ({
        endpoint: String(r.endpoint),
        userId: r.user_id == null ? null : String(r.user_id),
        p256dh: String(r.p256dh),
        auth: String(r.auth),
        utcOffsetMinutes: r.utc_offset_minutes == null ? null : Number(r.utc_offset_minutes),
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
    if (!this.canReachAnybody()) {
      throw new BadRequestException(
        'Push is not configured — set VAPID keys for the browser, APNs and FCM credentials for the app, or both.',
      );
    }

    /*
     * Native devices first, and unconditionally.
     *
     * Not because they matter more, but because the Web Push half returns
     * early when it has no subscriptions and used to throw when VAPID was
     * unset — either of which would have silently skipped a member whose
     * only device is the installed app. Both halves now report into one
     * total, and a member with a browser and a phone is woken on both,
     * which is what every other product does and what people expect.
     */
    const native = await this.native.send(payload, userId);

    const vapid = this.vapid();
    const subs = vapid ? await this.subscriptionsFor(userId) : [];
    if (!vapid || subs.length === 0) {
      return {
        sent: native.sent,
        expired: native.expired,
        failures: native.failures,
        /*
         * The note is what lands in `nudge_runs` and is the whole answer a
         * member gets to "why did nothing happen at eleven?". A registered
         * app reported as "no subscriptions for this user" would send
         * whoever reads it looking at the member's device instead of at
         * the deployment's missing APNs key.
         */
        note:
          native.sent > 0
            ? undefined
            : native.attempted > 0
              ? `${native.attempted} app device(s) registered and none could be reached: ${
                  native.failures.join('; ') || 'no reason reported'
                }`
              : userId
                ? 'no subscriptions for this user'
                : 'no subscriptions at all',
      };
    }

    let sent = native.sent;
    let expired = native.expired;
    const failures: string[] = [...native.failures];
    for (const sub of subs) {
      const request = buildPushRequest(
        sub.endpoint,
        payload,
        { p256dh: sub.p256dh, auth: sub.auth },
        vapid,
        this.subject(),
      );
      try {
        // The body is raw encrypted bytes. Which BodyInit type the compiler
        // resolves varies by toolchain, so the cast stays deliberately wide.
        const response = (await fetch(sub.endpoint, {
          method: 'POST',
          headers: request.headers,
          body: new Uint8Array(request.body) as unknown as string,
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

  /**
   * Account deletion's sweep: every device this user registered.
   *
   * Both stores, in one call, because `auth.service.ts` calls this one
   * method and a native token left behind would keep a deleted member's
   * phone reachable — and the row would still carry their user id.
   */
  async deleteForUser(userId: string): Promise<number> {
    const native = await this.native.deleteForUser(userId);

    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM push_subscriptions WHERE user_id = $1 RETURNING endpoint',
        [userId],
      );
      return result.rows.length + native;
    }
    let removed = 0;
    for (const [endpoint, sub] of this.memory) {
      if (sub.userId === userId) {
        this.memory.delete(endpoint);
        removed += 1;
      }
    }
    return removed + native;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
