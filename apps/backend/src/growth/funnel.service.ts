import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool, type PgPoolLike } from '../db/pg';

export const FUNNEL_STEPS = ['landed', 'viewed_ask', 'opened', 'started', 'registered'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const STEP_MEANING: Readonly<Record<FunnelStep, string>> = {
  landed: 'Arrived on any public page.',
  viewed_ask: 'Actually saw a join call to action, rather than leaving above it.',
  opened: 'Opened the account page.',
  started: 'Opened the registration form rather than the sign-in form.',
  registered: 'Finished. Counted on the server, never taken from the browser.',
};

/**
 * The funnel.
 *
 * Built after the site had run with no customers and no way to tell
 * whether that was nobody visiting, everybody bouncing, or everybody
 * reaching a screen that did not work. Those want three different
 * responses and guessing between them is how a year goes by.
 *
 * Deliberately not a general analytics system. Five steps, no identifiers,
 * no cookies, no session stitching beyond a day, and a shape that answers
 * one question: which screen loses people. Anything richer than that is a
 * profile of a stranger, which is not something this platform builds.
 */
@Injectable()
export class FunnelService implements OnModuleDestroy {
  private readonly logger = new Logger(FunnelService.name);
  private pool: PgPoolLike | null = null;

  private salt = randomBytes(16).toString('hex');
  private saltDay = new Date().toISOString().slice(0, 10);
  private lastSweep = 0;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  private fingerprint(source: string): string {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.saltDay) {
      this.salt = randomBytes(16).toString('hex');
      this.saltDay = today;
    }
    return createHash('sha256').update(`${this.salt}:${source}`).digest('hex').slice(0, 24);
  }

  /**
   * Record a step. Never throws, never awaited on a hot path.
   *
   * A funnel that can fail a request is a funnel that will eventually take
   * the signup page down, which would be a rich irony and a real outage.
   */
  record(input: {
    step: FunnelStep;
    source: string;
    path?: string;
    referrer?: string | null;
    device?: string | null;
  }): void {
    if (!this.pool) return;

    // The query string is dropped before anything is stored: campaign tags
    // live there and so, occasionally, do email addresses.
    const path = (input.path ?? '').split('?')[0]!.slice(0, 200);
    const device = ['mobile', 'tablet', 'desktop'].includes(input.device ?? '')
      ? input.device
      : 'unknown';

    void this.pool
      .query(
        `INSERT INTO funnel_events (step, source, path, referrer, device)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.step, this.fingerprint(input.source), path, hostOf(input.referrer), device],
      )
      .then(() => this.sweep())
      .catch((error) => this.logger.debug(`funnel: ${(error as Error).message}`));
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < 3_600_000) return;
    this.lastSweep = now;
    void this.pool
      ?.query(`DELETE FROM funnel_events WHERE at < now() - interval '180 days'`)
      .catch(() => undefined);
  }

  /**
   * The funnel over a window, as counts of distinct sources per step.
   *
   * Distinct rather than total, because one person reloading a page eleven
   * times is not eleven arrivals, and a funnel built on raw events reports
   * a conversion rate that falls as engagement rises.
   */
  async summary(days = 30): Promise<Record<string, unknown>> {
    if (!this.pool) {
      return {
        available: false,
        why: 'No database is configured on this deployment, so nothing is being counted.',
      };
    }

    try {
      const { rows } = await this.pool.query(
        `SELECT step, count(DISTINCT source)::int AS people, count(*)::int AS events
           FROM funnel_events
          WHERE at > now() - ($1 || ' days')::interval
          GROUP BY step`,
        [String(days)],
      );

      const byStep = new Map(rows.map((r) => [String(r.step), r]));
      const landed = Number(byStep.get('landed')?.people ?? 0);

      const steps = FUNNEL_STEPS.map((step) => {
        const people = Number(byStep.get(step)?.people ?? 0);
        return {
          step,
          means: STEP_MEANING[step],
          people,
          events: Number(byStep.get(step)?.events ?? 0),
          /* Against the top of the funnel, not against the step before —
           * a stage-to-stage rate looks healthy right up until the total
           * is four people. */
          pctOfLanded: landed > 0 ? Math.round((people / landed) * 100) : null,
        };
      });

      const { rows: sources } = await this.pool.query(
        `SELECT coalesce(referrer, 'direct or unknown') AS referrer,
                count(DISTINCT source)::int AS people
           FROM funnel_events
          WHERE at > now() - ($1 || ' days')::interval AND step = 'landed'
          GROUP BY 1 ORDER BY people DESC LIMIT 12`,
        [String(days)],
      );

      const { rows: pages } = await this.pool.query(
        `SELECT path, count(DISTINCT source)::int AS people
           FROM funnel_events
          WHERE at > now() - ($1 || ' days')::interval AND step = 'landed' AND path <> ''
          GROUP BY 1 ORDER BY people DESC LIMIT 12`,
        [String(days)],
      );

      const registered = steps.find((s) => s.step === 'registered')?.people ?? 0;

      return {
        available: true,
        windowDays: days,
        steps,
        entryPages: pages,
        sources,
        /*
         * Said in words, because a table of counts does not tell somebody
         * what to do and a founder reading this at eleven at night should
         * not have to work it out.
         */
        reading: reading(landed, steps, registered),
        privacy:
          'No cookies, no identifiers, no full referring URLs. The connecting address is hashed ' +
          'with a salt that changes daily, so a visit correlates within one day and deliberately ' +
          'not across weeks. Nothing here links to an account.',
      };
    } catch (error) {
      this.logger.debug(`funnel summary: ${(error as Error).message}`);
      return { available: false, why: 'The funnel could not be read.' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}

/** The referring host, never the URL. */
function hostOf(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').slice(0, 100);
  } catch {
    return null;
  }
}

/**
 * What the numbers mean, in a sentence.
 *
 * The distinction that matters most is between "nobody came" and "people
 * came and left", because the first is a distribution problem and the
 * second is a product problem, and working on the wrong one costs months.
 */
function reading(
  landed: number,
  steps: { step: string; people: number }[],
  registered: number,
): string {
  const at = (s: string) => steps.find((x) => x.step === s)?.people ?? 0;

  if (landed === 0) {
    return 'Nobody has landed on the site in this window. Nothing about the product explains that — it is a distribution problem, and no change to the pages will move it.';
  }
  if (landed < 30) {
    return `Only ${landed} people have landed in this window. That is too few to read anything into the rest of the funnel: a conversion rate over a handful of visits is noise. The problem to solve first is getting people here at all.`;
  }
  if (at('opened') === 0) {
    return `${landed} people landed and none opened the account page. That is a funnel problem rather than a product one — they are leaving before they are asked, or the ask is below where they stop reading.`;
  }
  if (registered === 0) {
    return `${at('opened')} people opened the account page and none finished. Something on that screen is stopping them — the form, the price, the guardian rule, or a failure they hit and did not report. This is the most fixable number on the page.`;
  }
  return `${registered} of ${landed} people who landed have registered. The largest drop is between ${largestDrop(steps)} — that is the screen worth working on next.`;
}

function largestDrop(steps: { step: string; people: number }[]): string {
  let worst = { from: steps[0]?.step ?? 'landed', to: steps[1]?.step ?? 'opened', lost: -1 };
  for (let i = 0; i < steps.length - 1; i += 1) {
    const lost = (steps[i]?.people ?? 0) - (steps[i + 1]?.people ?? 0);
    if (lost > worst.lost) worst = { from: steps[i]!.step, to: steps[i + 1]!.step, lost };
  }
  return `${worst.from} and ${worst.to} (${worst.lost} people)`;
}
