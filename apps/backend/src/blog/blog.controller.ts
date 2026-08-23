import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  ENGAGED_READ_SECONDS,
  ENGAGED_SCROLL_PERCENT,
  POST_CATEGORIES,
  SEO_RULES,
  STATUS_TRANSITIONS,
  TOPIC_CLUSTERS,
  type PostStatus,
} from '@jessmove/shared';
import { BlogAnalyticsService } from './analytics.service';
import { assertScheduler } from './cron.guard';
import { BlogService } from './blog.service';
import { DraftPostDto, TransitionDto, ViewDto } from './blog.dto';
import { SeoAgentService } from './seo-agent.service';
import { SeoAutopilotService } from './seo-autopilot.service';
import { AdminOnly } from '../auth/auth.guard';

@Controller('blog')
export class BlogController {
  constructor(
    private readonly posts: BlogService,
    private readonly agent: SeoAgentService,
    private readonly analytics: BlogAnalyticsService,
    private readonly autopilot: SeoAutopilotService,
  ) {}

  /**
   * The link graph, open.
   *
   * Published rather than kept behind the admin guard because it contains
   * nothing private — it is the shape of a public website — and because a
   * site that shows its own orphans and dead links is one somebody can
   * check rather than take on trust.
   */
  @Get('links')
  async links() {
    return {
      // Awaited rather than spread directly: spreading a Promise is legal
      // TypeScript and produces an empty object, so this endpoint would
      // have quietly returned nothing but the two prose fields.
      ...(await this.autopilot.linkAudit()),
      internal:
        'These are internal links: pages here pointing at other pages here. That is the part ' +
        'of link authority a site controls, and it is the part this platform works on.',
      external:
        'Nothing on this platform buys, exchanges or generates links from other sites. Those are ' +
        'earned by being worth citing, and the machinery for that is a sitemap, a feed, canonical ' +
        'URLs and structured data — all of which are live.',
    };
  }

  /** What autopilot is doing, and the list of what it will never do. */
  @AdminOnly()
  @Get('agent/autopilot')
  async autopilotStatus() {
    return this.autopilot.status();
  }

  /**
   * Runs a cycle now. Admin-only, and `force` skips only the weekly
   * cadence — the queue limit, the coverage check and the audit all still
   * apply, and the result still lands in review rather than on the site.
   */
  @AdminOnly()
  @Post('agent/autopilot/run')
  runAutopilot(@Query('force') force?: string) {
    return this.autopilot.run(force === 'true');
  }

  /**
   * The scheduler's door, and the reason anything happens at all.
   *
   * Everything else in this pipeline was complete and had nothing to
   * start it: the autopilot's only trigger was an admin pressing a button,
   * on a serverless deployment with no scheduler, which meant that setting
   * the API keys and switching autopilot on produced exactly nothing. The
   * comment in the autopilot warning that "a cron nobody runs is a promise
   * nobody keeps" was written before this existed, which is its own small
   * lesson.
   *
   * A GET because that is what Vercel's scheduler issues. It is not
   * idempotent in the strict sense — it may commission an article — but
   * the cadence check, the queue ceiling and the coverage check mean a
   * second call within the interval does nothing, which is the property
   * that actually matters when a scheduler retries.
   *
   * `force` is deliberately absent. An operator who wants to skip the
   * cadence can use the admin route and be a person doing it on purpose.
   */
  @Get('agent/autopilot/cron')
  async cron(@Req() req: Request) {
    assertScheduler(req);
    const record = await this.autopilot.run(false);
    return {
      ...record,
      /*
       * Said on every run, because this is the endpoint most likely to be
       * read by somebody wondering why the site has not changed.
       */
      reachedThePublic: false,
      note:
        'A run drafts and queues. Nothing here can publish — the status machine has no ' +
        'draft-to-published edge and publishing takes a named reviewer in the console.',
    };
  }

  /** The editorial contract, machine-readable. Nothing here is secret. */
  @Get('policy')
  policy() {
    return {
      categories: POST_CATEGORIES,
      clusters: TOPIC_CLUSTERS,
      rules: SEO_RULES,
      statusTransitions: STATUS_TRANSITIONS,
      engagedRead: {
        seconds: ENGAGED_READ_SECONDS,
        scrollPercent: ENGAGED_SCROLL_PERCENT,
        note: 'A view is a request. A read is a person. Both are reported, separately.',
      },
      publishing:
        'The SEO agent writes drafts only. Publishing requires a named reviewer and a ' +
        'passing audit, re-run at the moment of publication.',
      tracking:
        'No cookie, no login, no stored IP address. The visitor digest is salted with a ' +
        'key that is regenerated daily, so uniqueness holds within a day and deliberately ' +
        'does not hold across days.',
    };
  }

  @Get('posts')
  async list(@Query('status') status?: PostStatus) {
    return (await this.posts.list(status)).map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      status: p.status,
      publishedAt: p.publishedAt,
      agentDrafted: p.agentDrafted,
      reviewedBy: p.reviewedBy,
      score: p.audit?.score ?? null,
      auditNote: p.auditNote,
      // The site needs these to render an index card and a page; without
      // them the list is only useful to the console.
      description: p.description,
      keyword: p.keyword,
      clusterKey: p.clusterKey ?? null,
      words: p.body ? p.body.split(/\s+/).filter(Boolean).length : 0,
      metrics: this.analytics.metrics(p.slug),
    }));
  }

  @Get('posts/:slug')
  async one(@Param('slug') slug: string) {
    const post = await this.posts.get(slug);
    return { ...post, metrics: this.analytics.metrics(slug) };
  }

  /** Commission a draft. Returns the draft and its audit — never a published page. */
  @AdminOnly()
  @Post('agent/draft')
  async draft(@Body() body: DraftPostDto) {
    const result = await this.agent.draft(body);
    const stored = await this.posts.saveDraft(result.draft, true);
    return {
      post: stored,
      audit: result.audit,
      source: result.source,
      provider: result.provider,
      repairAttempted: result.repairAttempted,
      acuCeiling: result.acuCeiling,
      next:
        result.audit.passes
          ? 'Move to in_review, then publish with a named reviewer.'
          : 'The audit fails. Fix the blockers before review.',
    };
  }

  /** Where the next article should come from. */
  @AdminOnly()
  @Get('agent/gaps')
  async gaps() {
    return this.agent.gaps(await this.posts.publishedClusterKeys());
  }

  /** Audit an existing post without changing it. */
  @Get('posts/:slug/audit')
  async audit(@Param('slug') slug: string) {
    const post = await this.posts.get(slug);
    return post.audit ?? { audited: false, reason: post.auditNote };
  }

  @AdminOnly()
  @Post('posts/:slug/status')
  transition(@Param('slug') slug: string, @Body() body: TransitionDto) {
    return this.posts.transition(slug, body.to, body.reviewer);
  }

  /**
   * Record a view. The address and user agent are hashed inside the call
   * that reads them and are not held in any variable that outlives it.
   */
  @Post('views')
  async view(@Body() body: ViewDto, @Req() req: Request) {
    // The digest now comes from the shared daily salt rather than one this
    // container invented, so two instances hash the same reader the same
    // way and the unique count means something.
    const digest = await this.analytics.digestFor(
      req.ip ?? req.socket.remoteAddress ?? 'unknown',
      req.get('user-agent') ?? 'unknown',
    );

    const result = await this.analytics.record({
      slug: body.slug,
      visitorDigest: digest,
      at: body.at ?? new Date().toISOString(),
      dwellSeconds: body.dwellSeconds,
      scrollPercent: body.scrollPercent,
      referrerHost: body.referrerHost ?? null,
      device: body.device ?? 'unknown',
    });

    return { ...result, slug: body.slug };
  }

  @Get('analytics')
  async summary() {
    const [summary, posts] = await Promise.all([
      this.analytics.summary(),
      this.analytics.leaderboard(),
    ]);
    return { summary, posts };
  }
}
