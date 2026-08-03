import { Injectable, Logger } from '@nestjs/common';
import { buildLinkGraph, type LinkGraph } from '@jessmove/shared';
import { BlogService } from './blog.service';
import { SeoAgentService } from './seo-agent.service';
import {
  AUTOPILOT_INTERVAL_HOURS,
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
export class SeoAutopilotService {
  private readonly logger = new Logger(SeoAutopilotService.name);

  /**
   * Enabled by an environment variable rather than a database flag, so
   * turning it off is a deployment action an operator can take in seconds
   * without a migration or a console.
   */
  private readonly enabled = process.env.SEO_AUTOPILOT === 'on';

  private lastRunAt: string | null = null;
  private readonly history: RunRecord[] = [];

  constructor(
    private readonly blog: BlogService,
    private readonly agent: SeoAgentService,
  ) {}

  /** The site's link graph, from whatever is published right now. */
  graph(): LinkGraph {
    const published = this.blog.list('published');
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
  linkAudit(): {
    orphans: readonly string[];
    dead: readonly { from: string; to: string }[];
    weakPillars: readonly { path: string; inbound: number; expected: number }[];
    mostLinked: readonly { path: string; inbound: number }[];
    totalEdges: number;
    says: string;
  } {
    const graph = this.graph();
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

  private decision(): Decision {
    const queueDepth = this.blog.list('draft').length + this.blog.list('in_review').length;
    const commission = this.commission();
    return decide(
      { enabled: this.enabled, lastRunAt: this.lastRunAt, queueDepth },
      new Date(),
      commission ? 1 : 0,
    );
  }

  private commission(): Commission | null {
    const published = this.blog.list('published');
    return nextCommission(
      published.map((p) => p.clusterKey ?? null),
      // A subject already written about, whatever its status, is not a gap.
      [...this.blog.list('draft'), ...this.blog.list('in_review'), ...published].map(
        (p) => p.keyword,
      ),
    );
  }

  /** What autopilot would do, without doing it. Safe to call from anywhere. */
  status() {
    const decision = this.decision();
    const commission = this.commission();
    return {
      enabled: this.enabled,
      intervalHours: AUTOPILOT_INTERVAL_HOURS,
      maxQueueDepth: MAX_QUEUE_DEPTH,
      runAcuCeiling: RUN_ACU_CEILING,
      lastRunAt: this.lastRunAt,
      nextDueAt: decision.nextDueAt,
      wouldRun: decision.run,
      says: decision.says,
      nextUp: commission,
      recentRuns: this.history.slice(-10).reverse(),
      links: this.linkAudit(),
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
    const decision = this.decision();
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
      this.history.push(record);
      return record;
    }

    const commission = this.commission();
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
      this.history.push(record);
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
        const stored = this.blog.saveDraft(result.draft, true);
        // Straight to review. This is the furthest an agent goes.
        this.blog.transition(stored.slug, 'in_review');
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

    this.history.push(record);
    if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
    return record;
  }
}
