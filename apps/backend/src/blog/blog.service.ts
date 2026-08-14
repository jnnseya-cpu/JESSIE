import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { makePool, type PgPoolLike } from '../db/pg';
import {
  SEED_POSTS,
  SEO_RULES,
  autoLinksFor,
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
 *
 * ── Why this is now a database rather than a Map ──
 *
 * It was a `new Map()`. Every guarantee above worked perfectly inside one
 * process and then evaporated: a published article did not survive a
 * restart, was per-instance on serverless, and never reached a reader
 * under any circumstances, because the public blog rendered from a
 * TypeScript file this process cannot write to. Publishing meant a code
 * deploy, which meant a developer, which meant it never happened.
 *
 * The editorial control is unchanged and now has a second enforcer: the
 * table carries a CHECK constraint refusing any published row without a
 * named reviewer, so the rule survives a future refactor of this class.
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
export class BlogService implements OnModuleDestroy {
  private readonly logger = new Logger(BlogService.name);
  private pool: PgPoolLike | null = null;

  /**
   * The hand-written corpus, which lives in the site's own source and is
   * rendered by Next rather than stored here. Held in memory because it
   * genuinely is static — it ships with the build — and merged with the
   * database rows so analytics, cluster gaps and the site agree.
   */
  private readonly seeded = new Map<string, StoredPost>();

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('blog: no database — drafts will not survive a restart');
    }
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
      this.seeded.set(seed.slug, {
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

  /* ---------------- reading ---------------- */

  private rowToPost(row: Record<string, unknown>): StoredPost {
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
    return {
      id: String(row.slug),
      title: String(row.title),
      slug: String(row.slug),
      description: String(row.description),
      category: row.category as StoredPost['category'],
      keyword: String(row.keyword ?? ''),
      secondaryKeywords: (row.secondary as string[]) ?? [],
      body: String(row.body ?? ''),
      clusterKey: row.cluster_key ? String(row.cluster_key) : undefined,
      internalLinks: autoLinksFor(String(row.body ?? ''), {
        selfPath: `/blog/${String(row.slug)}`,
      }).map((l) => l.path),
      status: row.status as PostStatus,
      audit: (row.audit as SeoAudit | null) ?? null,
      auditNote: null,
      createdAt: iso(row.created_at) ?? new Date().toISOString(),
      updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
      publishedAt: iso(row.published_at),
      author: String(row.author ?? 'JESS MOVE'),
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      agentDrafted: Boolean(row.agent_drafted),
    };
  }

  async list(status?: PostStatus): Promise<readonly StoredPost[]> {
    const stored: StoredPost[] = [];
    if (this.pool) {
      try {
        const { rows } = status
          ? await this.pool.query(`SELECT * FROM posts WHERE status = $1`, [status])
          : await this.pool.query(`SELECT * FROM posts`);
        stored.push(...rows.map((r) => this.rowToPost(r)));
      } catch (error) {
        this.logger.warn(`blog list: ${(error as Error).message}`);
      }
    }

    // The seeded corpus is published by definition, so it only appears
    // when published rows were asked for, or when everything was.
    const seeds = !status || status === 'published' ? [...this.seeded.values()] : [];

    return [...stored, ...seeds].sort((a, b) =>
      (a.publishedAt ?? a.createdAt) < (b.publishedAt ?? b.createdAt) ? 1 : -1,
    );
  }

  async get(slug: string): Promise<StoredPost> {
    if (this.pool) {
      try {
        const { rows } = await this.pool.query(`SELECT * FROM posts WHERE slug = $1`, [slug]);
        if (rows[0]) return this.rowToPost(rows[0]);
      } catch {
        /* fall through to the seeded corpus */
      }
    }
    const seed = this.seeded.get(slug);
    if (!seed) throw new NotFoundException(`no post with slug "${slug}"`);
    return seed;
  }

  /* ---------------- writing ---------------- */

  /** Stores an agent draft. Always lands in `draft`, never anywhere else. */
  async saveDraft(draft: PostDraft, agentDrafted: boolean): Promise<StoredPost> {
    if (this.seeded.has(draft.slug)) {
      throw new BadRequestException(
        `slug "${draft.slug}" already exists — change the title or archive the existing post`,
      );
    }
    if (!this.pool) {
      throw new BadRequestException(
        'no database is configured, so a draft would be lost on the next restart',
      );
    }

    /*
     * The links the page will actually carry, computed now.
     *
     * Links are woven in at render from the path registry, which keeps
     * them fresh — but the audit scores `internalLinks` on the stored
     * draft, so an article that will render with six links was scoring
     * zero and could never pass. The pipeline would have been rebuilt and
     * still unable to publish anything, which is the exact failure this
     * work exists to end.
     *
     * So the draft carries what the auto-linker finds. Render still
     * applies them dynamically; this is the audit's view of the same
     * decision, not a second source of truth.
     */
    const withLinks: PostDraft = {
      ...draft,
      internalLinks: autoLinksFor(draft.body, { selfPath: `/blog/${draft.slug}` }).map(
        (l) => l.path,
      ),
    };
    const audit = seoAudit(withLinks);
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO posts (slug, title, description, category, keyword, secondary, body,
                            cluster_key, status, agent_drafted, author, audit)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'draft',$9,$10,$11::jsonb)
         RETURNING *`,
        [
          draft.slug,
          draft.title,
          draft.description,
          draft.category,
          draft.keyword,
          JSON.stringify(draft.secondaryKeywords ?? []),
          draft.body,
          draft.clusterKey ?? null,
          agentDrafted,
          agentDrafted ? 'SEO agent' : 'JESS MOVE',
          JSON.stringify(audit),
        ],
      );
      return this.rowToPost(rows[0]!);
    } catch (error) {
      const message = (error as Error).message;
      if (/duplicate key/i.test(message)) {
        throw new BadRequestException(
          `slug "${draft.slug}" already exists — change the title or archive the existing post`,
        );
      }
      throw new BadRequestException(`the draft could not be stored: ${message}`);
    }
  }

  async transition(slug: string, to: PostStatus, reviewer?: string): Promise<StoredPost> {
    const post = await this.get(slug);

    if (!canTransition(post.status, to)) {
      throw new BadRequestException(
        `cannot move a post from ${post.status} to ${to}` +
          (post.status === 'draft' && to === 'published'
            ? ' — a draft goes to in_review first, and review is a person, not a flag'
            : ''),
      );
    }
    if (!this.pool) throw new BadRequestException('no database is configured');

    let audit = post.audit;
    let reviewedBy = post.reviewedBy;
    let publishedAt = post.publishedAt;

    if (to === 'published') {
      const named = reviewer?.trim();
      if (!named) throw new ReviewRequiredError();

      // Re-audit at the moment of publication rather than trusting the
      // score stored when the draft was written.
      const fresh = seoAudit({
        ...post,
        internalLinks: autoLinksFor(post.body, { selfPath: `/blog/${post.slug}` }).map(
          (l) => l.path,
        ),
      });
      if (!fresh.passes) {
        throw new BadRequestException(
          `the editorial audit fails at ${fresh.score}/100 (pass is ${SEO_RULES.scorePass}): ` +
            fresh.findings
              .filter((f) => f.severity === 'blocker')
              .map((f) => `${f.rule} — ${f.detail}`)
              .join('; '),
        );
      }
      audit = fresh;
      reviewedBy = named;
      publishedAt = new Date().toISOString();
    }

    const { rows } = await this.pool.query(
      `UPDATE posts
          SET status = $2, audit = $3::jsonb, reviewed_by = $4, published_at = $5,
              updated_at = now()
        WHERE slug = $1
        RETURNING *`,
      [slug, to, JSON.stringify(audit), reviewedBy, publishedAt],
    );
    if (!rows[0]) throw new NotFoundException(`no post with slug "${slug}"`);
    return this.rowToPost(rows[0]);
  }

  /** Cluster keys of everything published — the SEO agent's gap input. */
  async publishedClusterKeys(): Promise<readonly (string | null)[]> {
    return (await this.list('published')).map((p) => p.clusterKey ?? null);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }
}
