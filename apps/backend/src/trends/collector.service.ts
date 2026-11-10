import { Injectable, Logger } from '@nestjs/common';
import { TOPIC_CLUSTERS, type Observation } from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';
import { TrendsService } from './trends.service';

/**
 * Turning what the platform already records into observations.
 *
 * This is the part that makes the engine invisible. Nothing asks an
 * operator to import a CSV, paste a trend or call an endpoint: the
 * collector reads the two tables the platform has been writing all along
 * — `funnel_events` and `blog_views` — and files them as observations
 * against the topic clusters the blog already organises itself by.
 *
 * It runs inside the existing autopilot tick rather than on a schedule of
 * its own. A second cron would be a second thing to forget, and there is
 * already a daily tick whose whole job is to decide what to write next;
 * reading the evidence first is the natural beginning of that job.
 *
 * Three decisions worth knowing about.
 *
 * **Weekly windows, complete ones only.** The current partial week is
 * excluded. Comparing a Tuesday against eight full weeks manufactures a
 * decline every time it is read, and a decline is the one signal nobody
 * double-checks.
 *
 * **A path is attributed to a cluster, or to nothing.** There is no
 * "other" bucket. A funnel step on a page that belongs to no topic is not
 * weak evidence about some topic, it is evidence about none, and an
 * `other` bucket would quietly become the biggest number on the board.
 *
 * **Aggregates only, and no identifiers.** A count per topic per week.
 * The engine is making a statement about demand, never about a person,
 * and it is deliberately incapable of saying whose read or whose funnel
 * step contributed.
 */
@Injectable()
export class CollectorService {
  private readonly logger = new Logger(CollectorService.name);
  private readonly pool: PgPoolLike | null;

  /** How many complete weeks of history to keep filed. */
  static readonly WEEKS = 9;

  constructor(private readonly trends: TrendsService) {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  /**
   * File everything the platform knows, for every topic it writes about.
   *
   * Idempotent by construction: the source record id is the family, the
   * topic and the window, so re-running a day later refiles the same
   * weeks as duplicates and adds only whatever week has since closed.
   * That matters because this runs on a cron that can fire twice.
   */
  async collect(now = new Date()): Promise<{
    filed: number;
    duplicate: number;
    rejected: number;
    topics: number;
    note: string;
  }> {
    if (!this.pool) {
      return {
        filed: 0,
        duplicate: 0,
        rejected: 0,
        topics: 0,
        note: 'no database configured, so there was nothing to read',
      };
    }

    const observations: Observation[] = [];
    const clusters = TOPIC_CLUSTERS.map((c) => c.key);

    for (const [family, rows] of [
      ['funnel', await this.funnelByTopicWeek(now)],
      ['conversion', await this.conversionsByTopicWeek(now)],
      ['blog_engagement', await this.engagedReadsByTopicWeek(now)],
    ] as const) {
      for (const row of rows) {
        if (!clusters.includes(row.topicId)) continue;
        observations.push({
          sourceId: `firstparty_${family}`,
          sourceFamily: family,
          // The window is in the key, so a replay is a replay and a newly
          // closed week is new.
          sourceRecordId: `${family}:${row.topicId}:${row.windowEnd}`,
          topicId: row.topicId,
          metric: family === 'conversion' ? 'registrations' : 'events',
          value: row.value,
          unit: 'count',
          observedAt: row.windowEnd,
          windowStart: row.windowStart,
          windowEnd: row.windowEnd,
          /*
           * One, and honestly so. These are the platform's own tables:
           * every event in the window is present, because the window is
           * defined by the rows that are there. Coverage is a proxy for
           * an external feed's completeness and there is no external feed
           * here — claiming less would be as wrong as claiming more.
           */
          coverage: 1,
        });
      }
    }

    const result = await this.trends.ingest(observations);
    const topics = new Set(observations.map((o) => o.topicId)).size;

    if (result.rejected.length > 0) {
      this.logger.warn(
        `${result.rejected.length} observations refused: ` +
          result.rejected
            .slice(0, 3)
            .map((r) => r.why)
            .join('; '),
      );
    }

    return {
      filed: result.accepted,
      duplicate: result.duplicate,
      rejected: result.rejected.length,
      topics,
      note:
        observations.length === 0
          ? 'Nothing to file. No funnel steps or reads fell inside a topic ' +
            'cluster in any complete week — unknown, not zero interest.'
          : `${result.accepted} new, ${result.duplicate} already filed, ` +
            `across ${topics} topics.`,
    };
  }

  /**
   * Funnel steps, attributed to a topic by the page they happened on.
   *
   * `registered` is excluded here and counted as its own family, because
   * a conversion is the outcome rather than a step towards it and
   * counting it twice would let one event corroborate itself.
   */
  private async funnelByTopicWeek(now: Date): Promise<WeekRow[]> {
    return this.weeks(
      `SELECT p.cluster_key AS topic_id,
              date_trunc('week', f.at) AS week_start,
              count(*) AS value
         FROM funnel_events f
         JOIN posts p ON f.path = '/blog/' || p.slug
        WHERE f.step <> 'registered'
          AND p.cluster_key IS NOT NULL
          AND f.at >= $1 AND f.at < $2
        GROUP BY p.cluster_key, date_trunc('week', f.at)`,
      now,
    );
  }

  /** Accounts created, attributed by the page the visitor arrived through. */
  private async conversionsByTopicWeek(now: Date): Promise<WeekRow[]> {
    return this.weeks(
      `SELECT p.cluster_key AS topic_id,
              date_trunc('week', f.at) AS week_start,
              count(*) AS value
         FROM funnel_events f
         JOIN posts p ON f.path = '/blog/' || p.slug
        WHERE f.step = 'registered'
          AND p.cluster_key IS NOT NULL
          AND f.at >= $1 AND f.at < $2
        GROUP BY p.cluster_key, date_trunc('week', f.at)`,
      now,
    );
  }

  /**
   * Reads that passed the engagement floor, by topic.
   *
   * The floor is the platform's own published definition of an engaged
   * read, reused rather than restated — a second definition of the same
   * thing is a second number that disagrees with the first.
   */
  private async engagedReadsByTopicWeek(now: Date): Promise<WeekRow[]> {
    return this.weeks(
      `SELECT p.cluster_key AS topic_id,
              date_trunc('week', v.at) AS week_start,
              count(*) AS value
         FROM blog_views v
         JOIN posts p ON p.slug = v.slug
        WHERE p.cluster_key IS NOT NULL
          AND v.dwell_seconds >= $3 AND v.scroll_percent >= $4
          AND v.at >= $1 AND v.at < $2
        GROUP BY p.cluster_key, date_trunc('week', v.at)`,
      now,
      true,
    );
  }

  /**
   * Run a weekly aggregation over complete weeks only.
   *
   * The upper bound is the start of the current week, so the partial week
   * in progress is never compared against complete ones.
   */
  private async weeks(
    sql: string,
    now: Date,
    withEngagementFloor = false,
  ): Promise<WeekRow[]> {
    if (!this.pool) return [];
    const thisWeekStart = startOfWeek(now);
    const from = new Date(
      thisWeekStart.getTime() - CollectorService.WEEKS * 7 * 86_400_000,
    );

    const { ENGAGED_READ_SECONDS, ENGAGED_SCROLL_PERCENT } = await import(
      '@jessmove/shared'
    );
    const values: unknown[] = [from.toISOString(), thisWeekStart.toISOString()];
    if (withEngagementFloor) {
      values.push(ENGAGED_READ_SECONDS, ENGAGED_SCROLL_PERCENT);
    }

    const { rows } = await this.pool.query(sql, values);
    return rows.map((r) => {
      const start = new Date(String(r.week_start));
      return {
        topicId: String(r.topic_id),
        windowStart: start.toISOString(),
        windowEnd: new Date(start.getTime() + 7 * 86_400_000).toISOString(),
        value: Number(r.value),
      };
    });
  }
}

interface WeekRow {
  topicId: string;
  windowStart: string;
  windowEnd: string;
  value: number;
}

/** Monday, UTC, to match `date_trunc('week', …)` in Postgres. */
function startOfWeek(at: Date): Date {
  const d = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  // Postgres weeks start on Monday; JavaScript's day 0 is Sunday.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d;
}
