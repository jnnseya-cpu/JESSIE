import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool, type PgPoolLike } from '../db/pg';
import { buildLinkGraph, type LinkGraph } from '@jessmove/shared';
import { BlogService } from './blog.service';
import { SeoAgentService } from './seo-agent.service';
import {
  AUTOPILOT_INTERVAL_HOURS,
  intervalHours,
  MAX_QUEUE_DEPTH,
  RUN_ACU_CEILING,
  decide,
  nextCommission,
  verdict,
  type Commission,
  type Decision,
  type RunRecord,
} from './seo-autopilot.logic';

/**
 * The autopilot.
 *
 * It decides what to write, commissions it, audits it and queues it. It
 * does not publish, cannot publish, and the absence of that capability is
 * structural rather than a decision this class makes: `BlogService.publish`
 * requires a named human reviewer and the status machine has no edge from
 * `draft` to `published`. Nothing here calls `transition` with anything but
 * `in_review`.
 *
 * It also audits the link graph on every run. That half needs no model at
 * all and is arguably worth more than the writing: a dead internal link, an
 * orphaned page or a pillar nothing points at costs ranking on pages that
 * already exist, and those faults appear silently as a site grows.
 */
@Injectable()
export class SeoAutopilotService implements OnModuleDestroy {
  private readonly logger = new Logger(SeoAutopilotService.name);
  private readonly pool: PgPoolLike | null = makePool(process.env.DATABASE_URL, 1);

  /**
   * Enabled by an environment variable rather than a database flag, so
   * turning it off is a deployment action an operator can take in seconds
   * without a migration or a console.
   */
  private readonly enabled = process.env.SEO_AUTOPILOT === 'on';

  /*
   * Both of these used to be fields on this instance, which on serverless
   * meant every cold start began with no history and `lastRunAt = null`.
   * The console could never show a run, so a week of rejected drafts
   * looked identical to a week of nothing happening — and the cadence
   * check, which reads `lastRunAt`, treated every cold start as "never
   * run". The interval was decorative for as long as that was true.
   *
   * They live in the database now. The in-memory copies remain only as a
   * fallback for a deployment with no database, where nothing survives a
   * restart anyway and saying so is more honest than pretending.
   */
  private lastRunAt: string | null = null;
  private readonly history: RunRecord[] = [];

  private async remember(record: RunRecord): Promise<void> {
    // The in-memory copy first, so a deployment with no database still
    // shows something in the console within one warm instance.
    this.history.push(record);
    if (this.history.length > 50) this.history.shift();
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO autopilot_runs (at, outcome, says, keyword, cluster_key, slug, score, blockers, acu_spent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          record.at,
          record.outcome,
          record.says,
          record.commission?.keyword ?? null,
          record.commission?.clusterKey ?? null,
          record.slug,
          record.score,
          JSON.stringify(record.blockers ?? []),
          record.acuSpent ?? 0,
        ],
      );
    } catch (error) {
      // A run that happened and was not recorded is a visibility problem,
      // never a reason to fail the run itself.
      this.logger.warn(`autopilot run not recorded: ${(error as Error).message}`);
    }
  }

  /** When it last ran, from the database rather than from this instance. */
  private async lastRun(): Promise<string | null> {
    if (!this.pool) return this.lastRunAt;
    try {
      const { rows } = await this.pool.query(
        `SELECT at FROM autopilot_runs WHERE outcome <> 'skipped' ORDER BY at DESC LIMIT 1`,
      );
      const at = rows[0]?.at;
      return at instanceof Date ? at.toISOString() : at ? String(at) : null;
    } catch {
      return this.lastRunAt;
    }
  }

  /** The last few runs, for the console. */
  async recentRuns(limit = 10): Promise<Record<string, unknown>[]> {
    if (!this.pool) return this.history.slice(-limit).reverse() as unknown as Record<string, unknown>[];
    try {
      const { rows } = await this.pool.query(
        `SELECT at, outcome, says, keyword, cluster_key, slug, score, blockers, acu_spent
           FROM autopilot_runs ORDER BY at DESC LIMIT $1`,
        [limit],
      );
      return rows;
    } catch {
      return [];
    }
  }

  constructor(
    private readonly blog: BlogService,
    private readonly agent: SeoAgentService,
  ) {}

  /** The site's link graph, from whatever is published right now. */
  async graph(): Promise<LinkGraph> {
    const published = await this.blog.list('published');
    return buildLinkGraph(
      published.map((post) => ({
        slug: post.slug,
        title: post.title,
        clusterKey: post.clusterKey ?? null,
        links: [...post.internalLinks],
        body: post.body || undefined,
      })),
    );
  }

  /**
   * The link audit. No model, no spend, and the findings are the kind that
   * quietly cost ranking on pages nobody is thinking about any more.
   */
  async linkAudit(): Promise<{
    orphans: readonly string[];
    dead: readonly { from: string; to: string }[];
    weakPillars: readonly { path: string; inbound: number; expected: number }[];
    mostLinked: readonly { path: string; inbound: number }[];
    totalEdges: number;
    says: string;
  }> {
    const graph = await this.graph();
    const mostLinked = graph.nodes
      .slice(0, 8)
      .map((n) => ({ path: n.path, inbound: n.inbound.length }));

    const problems: string[] = [];
    if (graph.dead.length > 0) {
      problems.push(
        `${graph.dead.length} link${graph.dead.length === 1 ? '' : 's'} point at a page that does not exist`,
      );
    }
    if (graph.orphans.length > 0) {
      problems.push(
        `${graph.orphans.length} page${graph.orphans.length === 1 ? '' : 's'} have nothing linking to them`,
      );
    }
    if (graph.weakPillars.length > 0) {
      problems.push(`${graph.weakPillars.length} pillars are linked less than their cluster warrants`);
    }

    return {
      orphans: graph.orphans,
      dead: graph.dead,
      weakPillars: graph.weakPillars,
      mostLinked,
      totalEdges: graph.totalEdges,
      says:
        problems.length === 0
          ? `${graph.totalEdges} internal links, nothing broken, nothing orphaned.`
          : `${graph.totalEdges} internal links. ${problems.join('; ')}.`,
    };
  }

  private async decision(): Promise<Decision> {
    const queueDepth =
      (await this.blog.list('draft')).length + (await this.blog.list('in_review')).length;
    const commission = await this.commission();
    return decide(
      { enabled: this.enabled, lastRunAt: await this.lastRun(), queueDepth },
      new Date(),
      commission ? 1 : 0,
      intervalHours(process.env),
    );
  }

  private async commission(): Promise<Commission | null> {
    const published = await this.blog.list('published');
    return nextCommission(
      published.map((p) => p.clusterKey ?? null),
      // A subject already written about, whatever its status, is not a gap.
      [
        ...(await this.blog.list('draft')),
        ...(await this.blog.list('in_review')),
        ...published,
      ].map(
        (p) => p.keyword,
      ),
    );
  }

  /** What autopilot would do, without doing it. Safe to call from anywhere. */
  async status() {
    const decision = await this.decision();
    const commission = await this.commission();
    return {
      enabled: this.enabled,
      intervalHours: intervalHours(process.env),
      maxQueueDepth: MAX_QUEUE_DEPTH,
      runAcuCeiling: RUN_ACU_CEILING,
      lastRunAt: await this.lastRun(),
      nextDueAt: decision.nextDueAt,
      wouldRun: decision.run,
      says: decision.says,
      nextUp: commission,
      recentRuns: await this.recentRuns(10),
      links: await this.linkAudit(),
      neverDoes: [
        'publish anything — the status machine has no draft-to-published edge and publishing takes a named reviewer',
        'buy, exchange or generate external backlinks',
        'write about a subject the site already covers',
        'run more than once a week, however much budget is left',
      ],
    };
  }

  /**
   * One cycle. `force` skips the cadence check but nothing else — an
   * operator asking for a draft now still gets the queue limit, the gap
   * check and the audit.
   */
  async run(force = false): Promise<RunRecord> {
    const decision = await this.decision();
    const at = new Date().toISOString();

    if (!decision.run && !(force && decision.reason === 'too_soon')) {
      const record: RunRecord = {
        at,
        outcome: 'skipped',
        says: decision.says,
        commission: null,
        slug: null,
        score: null,
        blockers: [],
        acuSpent: 0,
      };
      await this.remember(record);
      return record;
    }

    const commission = await this.commission();
    if (!commission) {
      const record: RunRecord = {
        at,
        outcome: 'skipped',
        says: 'Nothing left uncovered.',
        commission: null,
        slug: null,
        score: null,
        blockers: [],
        acuSpent: 0,
      };
      await this.remember(record);
      return record;
    }

    // From here the run has happened, whatever the outcome. Stamping the
    // time before the model call means a provider that hangs cannot be
    // retried in a loop by whatever calls this next.
    this.lastRunAt = at;

    let record: RunRecord;
    try {
      const result = await this.agent.draft({
        topic: commission.topic,
        category: commission.category as Parameters<SeoAgentService['draft']>[0]['category'],
        keyword: commission.keyword,
        clusterKey: commission.clusterKey,
        strict: commission.strict,
      });

      const call = verdict(result.audit);
      const blockers = result.audit.findings
        .filter((f) => f.severity === 'blocker')
        .map((f) => `${f.rule}: ${f.detail}`);

      if (!call.queue) {
        record = {
          at,
          outcome: 'rejected',
          says: `${commission.because} ${call.says}`,
          commission,
          slug: null,
          score: result.audit.score,
          blockers,
          acuSpent: result.acuCeiling,
        };
      } else {
        const stored = await this.blog.saveDraft(result.draft, true);
        // Straight to review. This is the furthest an agent goes.
        await this.blog.transition(stored.slug, 'in_review');
        record = {
          at,
          outcome: 'queued',
          says: `${commission.because} ${call.says}`,
          commission,
          slug: stored.slug,
          score: result.audit.score,
          blockers: [],
          acuSpent: result.acuCeiling,
        };
      }
    } catch (error) {
      // A provider outage, a duplicate slug, anything. A failed run is
      // recorded and the schedule carries on; it is not an exception that
      // takes down whatever asked.
      this.logger.warn(`autopilot run failed: ${(error as Error).message}`);
      record = {
        at,
        outcome: 'failed',
        says: `The run did not complete: ${(error as Error).message}`,
        commission,
        slug: null,
        score: null,
        blockers: [],
        acuSpent: 0,
      };
    }

    await this.remember(record);
    if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
    return record;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}
