import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SNAP_DURATION_SECONDS, modeForAge } from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';
import { ActivityService } from '../activity/activity.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { PushService } from '../push/push.service';
import { localNow, openWindow, secondsLeftIn, type DeclaredWindow } from './nudge.logic';

export interface NudgeSummary {
  considered: number;
  offered: number;
  held: number;
  skipped: number;
  failed: number;
  detail: string[];
}

interface Candidate {
  userId: string;
  age: number;
  offsetMinutes: number;
  windows: DeclaredWindow[];
}

/**
 * The loop that lets this platform start a conversation.
 *
 * Everything it needs already existed and was never joined up: web push
 * with a real VAPID signature and an encrypted payload, a service worker
 * that renders the notification, a context engine that decides whether
 * somebody can move, a prescription engine that chooses what, and an
 * activity table that knows how many prompts have already gone out today.
 * The only scheduled job in the repository wrote the blog. So the product
 * could describe a moment perfectly and never arrive in one.
 *
 * What it deliberately is not: a timer. `ContextService` refuses to
 * deliver on no basis — "no positive availability signal and no declared
 * schedule: defer" — and an hourly push to everybody is exactly the
 * fixed-timer fallback that comment forbids. It is also the generic
 * reminder app the landing page criticises for converting at 11%.
 *
 * The basis here is `declared_schedule`: the member has said when they
 * are usually free. That needs no sensor, no calendar vendor and no
 * native application, it is a first-class SignalClass already, and it is
 * true — which is the whole difference between a schedule and a timer.
 *
 * Every gate the interactive path passes through is passed through here
 * as well, in the same services, because a rule that only applies when
 * somebody is watching is not a rule.
 */
@Injectable()
export class NudgeService implements OnModuleDestroy {
  private readonly logger = new Logger(NudgeService.name);
  private pool: PgPoolLike | null = null;

  constructor(
    private readonly prescriptions: PrescriptionsService,
    private readonly activity: ActivityService,
    private readonly push: PushService,
  ) {
    const url = process.env.DATABASE_URL;
    if (url) this.pool = makePool(url, 2);
  }

  async run(now: Date = new Date()): Promise<NudgeSummary> {
    const summary: NudgeSummary = {
      considered: 0,
      offered: 0,
      held: 0,
      skipped: 0,
      failed: 0,
      detail: [],
    };

    if (!this.pool) {
      summary.detail.push('no DATABASE_URL — declared windows are not stored, so nothing can be due');
      return summary;
    }
    /*
     * Any transport, not Web Push specifically. This asked
     * `push.configured()`, which names the VAPID keys alone — so a
     * deployment that had set up APNs and FCM but not VAPID would have
     * abandoned every run before looking at a single member, and said
     * "push is not configured" while two working transports sat idle.
     */
    if (!this.push.canReachAnybody()) {
      summary.detail.push(
        'no push transport is configured — set VAPID keys for browsers, APNs and FCM credentials for the app, or both',
      );
      return summary;
    }

    const candidates = await this.candidates();
    summary.considered = candidates.length;

    for (const candidate of candidates) {
      try {
        const at = localNow(now, candidate.offsetMinutes);
        const window = openWindow(candidate.windows, at);

        if (!window) {
          summary.skipped += 1;
          await this.record(candidate.userId, 'skipped', 'outside every declared window');
          continue;
        }

        /*
         * The time that is genuinely left, not the time that was
         * declared. A Snap offered at 11:58 in a window closing at 12:00
         * is a prompt that cannot be finished, and an unfinishable prompt
         * is the thing this product exists to stop sending.
         */
        const availableSeconds = secondsLeftIn(window, at);
        if (availableSeconds < SNAP_DURATION_SECONDS.min) {
          summary.skipped += 1;
          await this.record(candidate.userId, 'skipped', 'less than a Snap left in the window');
          continue;
        }

        const mode = modeForAge(candidate.age);
        const result = await this.prescriptions.next({
          userId: candidate.userId,
          mode,
          availableSeconds: Math.min(availableSeconds, SNAP_DURATION_SECONDS.max),
          /*
           * Seated and chair-supported only. This is the one path where
           * nobody is watching the screen when the decision is made, so it
           * takes the conservative half of the library; anything upright is
           * offered in the app, where the member is present and can decline
           * it knowingly. The engine narrows further by mode — it never
           * widens what it is given.
           */
          permittedVariants: ['seated', 'chair_supported'],
          capabilityNormaliser: 1,
          signals: {
            userId: candidate.userId,
            /*
             * Unknown, and said so. A server has no way to observe motion
             * or location, and asserting `still` and `home` — which the web
             * client used to do — hands the safety layer a fabrication.
             * `declared_schedule` is the only basis claimed because it is
             * the only one that is true.
             */
            motionState: 'unknown',
            locationClass: 'unknown',
            localHour: Math.floor(at.minuteOfDay / 60),
            consentedSignals: ['declared_schedule'],
          },
        });

        if ('held' in result) {
          summary.held += 1;
          await this.activity.record({
            userId: candidate.userId,
            kind: 'snap_held',
            detail: result.blocks.join(', ') || result.reason,
          });
          await this.record(candidate.userId, 'held', result.blocks.join(', ') || result.reason);
          continue;
        }

        const snap = result;
        const sent = await this.push.send(
          {
            title: snap.movement.name,
            body: `${Math.round(snap.dose.durationSeconds / 60)} minutes, ${snap.movement.variant.replace(/_/g, ' ')}. ${snap.why}`,
            url: `${(process.env.SITE_PUBLIC_URL ?? 'https://www.jessmove.com').replace(/\/$/, '')}/account`,
          },
          candidate.userId,
        );

        /*
         * Recorded only when a push actually left. `snap_offered` is what
         * the daily cap counts, so writing it for a delivery that failed
         * would spend the member's ceiling on a notification they never
         * received.
         */
        if (Number(sent.sent ?? 0) > 0) {
          summary.offered += 1;
          await this.activity.record({
            userId: candidate.userId,
            kind: 'snap_offered',
            category: snap.movement.category,
          });
          await this.record(candidate.userId, 'offered', snap.movement.name);
        } else {
          summary.failed += 1;
          await this.record(candidate.userId, 'failed', String(sent.note ?? 'push delivered to nobody'));
        }
      } catch (error) {
        summary.failed += 1;
        const why = error instanceof Error ? error.message : String(error);
        this.logger.warn(`nudge failed for ${candidate.userId}: ${why}`);
        await this.record(candidate.userId, 'failed', why);
      }
    }

    return summary;
  }

  /** Members who have both declared a window and allowed a notification. */
  private async candidates(): Promise<Candidate[]> {
    if (!this.pool) return [];
    /*
     * A device is a browser subscription or an app registration, and the
     * union is what makes the installed app reachable at all. Joining
     * `push_subscriptions` alone meant a member whose only device was the
     * app had no offset, so the join dropped them and the scheduler never
     * considered them — native delivery would have been built and then
     * addressed nobody.
     *
     * `max(utc_offset_minutes)` rather than any: a member with two devices
     * in two time zones has no single local hour, and picking one
     * deterministically is better than picking whichever row the planner
     * returned first. Devices with no recorded offset are excluded by the
     * WHERE — an unknown offset would mean guessing at their midnight.
     */
    const result = await this.pool.query(
      /*
       * The offset is reduced to one row per member *before* the join,
       * not during it. Joining devices to windows multiplies them —
       * three devices and four windows produced twelve rows and an
       * aggregate containing each window three times. Harmless to
       * `openWindow`, which stops at the first match, and about to stop
       * being harmless now that the device list spans two tables.
       */
      `WITH offsets AS (
              SELECT user_id, max(utc_offset_minutes) AS offset_minutes
                FROM (
                      SELECT user_id, utc_offset_minutes
                        FROM push_subscriptions
                       WHERE utc_offset_minutes IS NOT NULL
                       UNION ALL
                      SELECT user_id, utc_offset_minutes
                        FROM device_push_tokens
                       WHERE utc_offset_minutes IS NOT NULL
                     ) d
               GROUP BY user_id
            )
       SELECT w.user_id,
              u.age,
              o.offset_minutes,
              json_agg(json_build_object(
                'weekday', w.weekday,
                'startMinute', w.start_minute,
                'endMinute', w.end_minute
              )) AS windows
         FROM member_windows w
         JOIN app_users u ON u.user_id = w.user_id
         JOIN offsets o ON o.user_id = w.user_id
        GROUP BY w.user_id, u.age, o.offset_minutes`,
      [],
    );

    return result.rows.map((row) => ({
      userId: String(row.user_id),
      age: Number(row.age),
      offsetMinutes: Number(row.offset_minutes ?? 0),
      windows: (row.windows as DeclaredWindow[]) ?? [],
    }));
  }

  private async record(userId: string, outcome: string, reason: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO nudge_runs (user_id, outcome, reason) VALUES ($1, $2, $3)`,
        [userId, outcome, reason.slice(0, 300)],
      );
    } catch (error) {
      this.logger.warn(`nudge run not recorded: ${(error as Error).message}`);
    }
  }

  /* ---------------- the member's own windows ---------------- */

  async windowsFor(userId: string): Promise<DeclaredWindow[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT weekday, start_minute, end_minute FROM member_windows
        WHERE user_id = $1 ORDER BY weekday, start_minute`,
      [userId],
    );
    return result.rows.map((r) => ({
      weekday: Number(r.weekday),
      startMinute: Number(r.start_minute),
      endMinute: Number(r.end_minute),
    }));
  }

  /**
   * Replaces the member's whole schedule.
   *
   * Whole rather than incremental, because a schedule is read as one
   * thing — "these are the times I am free" — and a partial update leaves
   * a window nobody meant to keep. Deleting and inserting inside one
   * statement pair means a failure leaves the old schedule, not half a
   * new one.
   */
  async setWindows(userId: string, windows: readonly DeclaredWindow[]): Promise<DeclaredWindow[]> {
    if (!this.pool) return [];
    await this.pool.query('DELETE FROM member_windows WHERE user_id = $1', [userId]);
    for (const w of windows) {
      await this.pool.query(
        `INSERT INTO member_windows (user_id, weekday, start_minute, end_minute)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, weekday, start_minute) DO NOTHING`,
        [userId, w.weekday, w.startMinute, w.endMinute],
      );
    }
    return this.windowsFor(userId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
