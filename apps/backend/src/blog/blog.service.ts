import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SEED_POSTS,
  SEO_RULES,
  canTransition,
  seoAudit,
  type PostDraft,
  type PostStatus,
  type SeoAudit,
} from '@jessmove/shared';

/**
 * The post store and, more importantly, the publishing gate.
 *
 * The rule this class exists to enforce: an agent may not put words on a
 * public health site without a named person having read them. That is not
 * a policy in a document — `publish()` takes a reviewer, rejects an empty
 * one, and the status machine has no `draft -> published` transition, so
 * there is no path that skips review even by mistake.
 */

export interface StoredPost extends PostDraft {
  readonly id: string;
  status: PostStatus;
  /**
   * Null for the seeded corpus. Those articles are rendered by the site and
   * their prose is not in this process, so auditing them here would score an
   * empty string and report 40/100 for a page that is fine. A null score is
   * honest; a wrong one is worse than none.
   */
  audit: SeoAudit | null;
  readonly auditNote: string | null;
  readonly createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  readonly author: string;
  reviewedBy: string | null;
  readonly agentDrafted: boolean;
}

export class ReviewRequiredError extends BadRequestException {
  constructor() {
    super(
      'publishing requires a named reviewer — an agent draft cannot reach the public site unreviewed',
    );
  }
}

@Injectable()
export class BlogService {
  private readonly posts = new Map<string, StoredPost>();

  constructor() {
    // The live corpus. These are published and human-written; they exist
    // here so analytics, cluster gaps and the API agree with the site.
    for (const seed of SEED_POSTS) {
      const draft: PostDraft = {
        title: seed.title,
        slug: seed.slug,
        description: `${seed.title}.`,
        category: seed.category,
        keyword: seed.keyword,
        secondaryKeywords: [],
        body: '',
        clusterKey: seed.clusterKey ?? undefined,
        internalLinks: [],
      };
      this.posts.set(seed.slug, {
        ...draft,
        id: randomUUID(),
        status: 'published',
        audit: null,
        auditNote: 'body is rendered by the site; not audited in this process',
        createdAt: `${seed.publishedAt}T00:00:00.000Z`,
        updatedAt: `${seed.publishedAt}T00:00:00.000Z`,
        publishedAt: `${seed.publishedAt}T00:00:00.000Z`,
        author: 'JESS MOVE',
        reviewedBy: 'JESS MOVE editorial',
        agentDrafted: false,
      });
    }
  }

  list(status?: PostStatus): readonly StoredPost[] {
    const all = [...this.posts.values()];
    const filtered = status ? all.filter((p) => p.status === status) : all;
    return filtered.sort((a, b) => (a.publishedAt ?? a.createdAt) < (b.publishedAt ?? b.createdAt) ? 1 : -1);
  }

  get(slug: string): StoredPost {
    const post = this.posts.get(slug);
    if (!post) throw new NotFoundException(`no post with slug "${slug}"`);
    return post;
  }

  /** Stores an agent draft. Always lands in `draft`, never anywhere else. */
  saveDraft(draft: PostDraft, agentDrafted: boolean): StoredPost {
    if (this.posts.has(draft.slug)) {
      throw new BadRequestException(
        `slug "${draft.slug}" already exists — change the title or archive the existing post`,
      );
    }
    const now = new Date().toISOString();
    const stored: StoredPost = {
      ...draft,
      id: randomUUID(),
      status: 'draft',
      audit: seoAudit(draft),
      auditNote: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      author: agentDrafted ? 'SEO agent' : 'JESS MOVE',
      reviewedBy: null,
      agentDrafted,
    };
    this.posts.set(draft.slug, stored);
    return stored;
  }

  transition(slug: string, to: PostStatus, reviewer?: string): StoredPost {
    const post = this.get(slug);

    if (!canTransition(post.status, to)) {
      throw new BadRequestException(
        `cannot move a post from ${post.status} to ${to}` +
          (post.status === 'draft' && to === 'published'
            ? ' — a draft goes to in_review first, and review is a person, not a flag'
            : ''),
      );
    }

    if (to === 'published') {
      const named = reviewer?.trim();
      if (!named) throw new ReviewRequiredError();

      // Re-audit at the moment of publication rather than trusting the
      // score stored when the draft was written.
      const fresh = seoAudit(post);
      if (!fresh.passes) {
        throw new BadRequestException(
          `the editorial audit fails at ${fresh.score}/100 (pass is ${SEO_RULES.scorePass}): ` +
            fresh.findings
              .filter((f) => f.severity === 'blocker')
              .map((f) => `${f.rule} — ${f.detail}`)
              .join('; '),
        );
      }
      post.audit = fresh;
      post.reviewedBy = named;
      post.publishedAt = new Date().toISOString();
    }

    post.status = to;
    post.updatedAt = new Date().toISOString();
    return post;
  }

  /** Cluster keys of everything published — the SEO agent's gap input. */
  publishedClusterKeys(): readonly (string | null)[] {
    return this.list('published').map((p) => p.clusterKey ?? null);
  }
}
