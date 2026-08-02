import { HttpException, Injectable, Logger } from '@nestjs/common';

/**
 * What a stranger is allowed to spend of the platform's money.
 *
 * The public pages let anybody try FoodLens and the coach without an
 * account, which is the right product decision and was, until this file, an
 * open tap: every one of those calls goes to a paid provider, `billTo` is
 * undefined for somebody with no session, and nothing counted them. One
 * script could run the provider bill up all night.
 *
 * Closing it by demanding an account would be the easy fix and the wrong
 * one — the demo is how people decide to sign up. So a stranger gets a
 * genuine, small allowance per address per day, and is then asked to
 * register. A member with a session is unaffected: their allowance is
 * their own ACU balance, which is metered properly.
 *
 * The window is in memory. On serverless that means the limit is per
 * instance rather than global, which makes it leakier than it looks — it
 * is a brake, not a lock, and the real ceiling is the provider spend cap.
 * Both are stated in `status()` rather than implied.
 */

export const ANONYMOUS_DAILY_LIMIT = Number(process.env.ANONYMOUS_AI_DAILY_LIMIT ?? 5);
const WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AbuseService {
  private readonly logger = new Logger(AbuseService.name);
  private readonly seen = new Map<string, number[]>();

  /**
   * Counts one anonymous use of a paid action, and refuses past the
   * allowance. A signed-in member never reaches here.
   */
  assertAnonymousAllowance(ip: string, action: string): void {
    const key = `${action}:${ip}`;
    const now = Date.now();
    const recent = (this.seen.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    this.seen.set(key, recent);

    // Keep the map from growing without bound on a long-lived instance.
    if (this.seen.size > 5000) {
      for (const [k, times] of this.seen) {
        if (times.every((t) => now - t >= WINDOW_MS)) this.seen.delete(k);
      }
    }

    if (recent.length > ANONYMOUS_DAILY_LIMIT) {
      this.logger.warn(`anonymous allowance exhausted for ${action}`);
      throw new HttpException(
        {
          message:
            `That is ${ANONYMOUS_DAILY_LIMIT} free analyses today — the limit without an account. ` +
            'Create one and you get your own allowance, your history and the totals that come with it.',
          error: 'Too Many Requests',
          statusCode: 429,
        },
        429,
      );
    }
  }

  status(): Record<string, unknown> {
    return {
      anonymousDailyLimit: ANONYMOUS_DAILY_LIMIT,
      window: '24 hours, per address, per action',
      note:
        'Held in memory, so on a serverless deployment it applies per instance. It is a brake on casual abuse, not a lock — the provider spend cap is the real ceiling.',
    };
  }
}
