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
import { BlogService } from './blog.service';
import { DraftPostDto, TransitionDto, ViewDto } from './blog.dto';
import { SeoAgentService } from './seo-agent.service';
import { AdminOnly, SelfOnly } from '../auth/auth.guard';

@Controller('blog')
export class BlogController {
  constructor(
    private readonly posts: BlogService,
    private readonly agent: SeoAgentService,
    private readonly analytics: BlogAnalyticsService,
  ) {}

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
  list(@Query('status') status?: PostStatus) {
    return this.posts.list(status).map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      status: p.status,
      publishedAt: p.publishedAt,
      agentDrafted: p.agentDrafted,
      reviewedBy: p.reviewedBy,
      score: p.audit?.score ?? null,
      auditNote: p.auditNote,
      metrics: this.analytics.metrics(p.slug),
    }));
  }

  @Get('posts/:slug')
  one(@Param('slug') slug: string) {
    const post = this.posts.get(slug);
    return { ...post, metrics: this.analytics.metrics(slug) };
  }

  /** Commission a draft. Returns the draft and its audit — never a published page. */
  @AdminOnly()
  @Post('agent/draft')
  async draft(@Body() body: DraftPostDto) {
    const result = await this.agent.draft(body);
    const stored = this.posts.saveDraft(result.draft, true);
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
  gaps() {
    return this.agent.gaps(this.posts.publishedClusterKeys());
  }

  /** Audit an existing post without changing it. */
  @Get('posts/:slug/audit')
  audit(@Param('slug') slug: string) {
    const post = this.posts.get(slug);
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
  view(@Body() body: ViewDto, @Req() req: Request) {
    const digest = this.analytics.digest(
      req.ip ?? req.socket.remoteAddress ?? 'unknown',
      req.get('user-agent') ?? 'unknown',
    );

    const result = this.analytics.record({
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
  summary() {
    return {
      summary: this.analytics.summary(),
      posts: this.analytics.leaderboard(),
    };
  }
}
