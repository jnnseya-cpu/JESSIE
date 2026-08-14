import { withAutoLinks } from '@jessmove/shared';

/**
 * Articles the editorial pipeline published, read at render time.
 *
 * The site's original corpus lives in `posts.ts` and ships with the build.
 * These do not: they are written by the agent, reviewed and published by a
 * named person, and stored in the database — which is the whole point,
 * because publishing used to mean a code deploy and therefore never
 * happened.
 *
 * ── The dynamic linking ──
 *
 * Internal links are woven in *here*, at render, rather than stored in the
 * body. That is deliberate and it is the most valuable part of this file.
 * A link written into stored prose is correct on the day it is written and
 * decays from then on; links applied at render come from the site's own
 * path registry, so an article published last month starts pointing at a
 * page added yesterday without anybody editing it, and a path that changes
 * updates everywhere at once rather than becoming a hundred dead links.
 *
 * It also means the agent never has to be trusted to invent a URL. Asked
 * for internal links a model will cheerfully produce `/blog/movement-guide`
 * because it looks like the other URLs; here it writes prose and the
 * registry decides what becomes a link.
 */

export interface PublishedPost {
  slug: string;
  title: string;
  description: string;
  category: string;
  keyword: string;
  body: string;
  clusterKey: string | null;
  publishedAt: string;
  reviewedBy: string | null;
  agentDrafted: boolean;
}

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production'
    ? 'https://api.jessmove.com/api'
    : 'http://localhost:4000/api';
}

/**
 * Never throws and never fails a page.
 *
 * The blog has a corpus of its own that ships with the build, so an API
 * that is unreachable costs the newer articles and nothing else. A page
 * that 500s because a content service is down is a worse outcome than a
 * page with fewer articles on it.
 */
async function fetchPosts(): Promise<PublishedPost[]> {
  try {
    const res = await fetch(`${apiBase()}/blog/posts?status=published`, {
      // Re-fetched periodically rather than on every request: an article
      // appearing five minutes after it is published is fine, and a
      // database query per page view is not.
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    /*
     * The envelope is `{ data: [...] }` — an array, not an object with a
     * `posts` key. Getting that wrong cost an afternoon: every page
     * rendered perfectly with zero articles and nothing failed, which is
     * the same shape of bug as the funnel and the reason this is driven
     * end to end rather than reasoned about.
     */
    const json = (await res.json()) as { data?: unknown[] };
    const rows = (json.data ?? []) as Record<string, unknown>[];
    return rows
      .filter((r) => Number(r.words ?? 0) > 0)
      .map((r) => ({
        slug: String(r.slug),
        title: String(r.title),
        description: String(r.description ?? ''),
        category: String(r.category ?? 'platform'),
        keyword: String(r.keyword ?? ''),
        body: '',
        clusterKey: r.clusterKey ? String(r.clusterKey) : null,
        publishedAt: String(r.publishedAt ?? '').slice(0, 10),
        reviewedBy: r.reviewedBy ? String(r.reviewedBy) : null,
        agentDrafted: Boolean(r.agentDrafted),
      }));
  } catch {
    return [];
  }
}

export async function publishedPosts(): Promise<PublishedPost[]> {
  return fetchPosts();
}

/**
 * One article, with its body.
 *
 * The list deliberately does not carry bodies — an index of forty
 * articles should not ship forty full texts to render forty cards. The
 * body comes from the single-post endpoint, which is one request for the
 * one page that needs it.
 */
export async function publishedBySlug(slug: string): Promise<PublishedPost | null> {
  try {
    const res = await fetch(`${apiBase()}/blog/posts/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const r = ((await res.json()) as { data?: Record<string, unknown> }).data;
    if (!r || r.status !== 'published' || typeof r.body !== 'string' || !r.body) return null;
    return {
      slug: String(r.slug),
      title: String(r.title),
      description: String(r.description ?? ''),
      category: String(r.category ?? 'platform'),
      keyword: String(r.keyword ?? ''),
      body: String(r.body),
      clusterKey: r.clusterKey ? String(r.clusterKey) : null,
      publishedAt: String(r.publishedAt ?? '').slice(0, 10),
      reviewedBy: r.reviewedBy ? String(r.reviewedBy) : null,
      agentDrafted: Boolean(r.agentDrafted),
    };
  } catch {
    return null;
  }
}

export interface RenderedBlock {
  kind: 'heading' | 'paragraph';
  /** HTML — auto-linked, and built only from prose we stored. */
  html: string;
}

/**
 * Turn a stored body into blocks, with the links woven in.
 *
 * Three steps, in this order, and the order is the safety property:
 *
 *  1. Escape everything. After this there is no markup in the string at
 *     all, whatever the model wrote.
 *  2. Auto-link. `withAutoLinks` returns *markdown* — `[text](/path)` —
 *     not HTML, and only for paths that exist in the site's own registry.
 *  3. Turn those markdown links into anchors, matching a pattern that
 *     only accepts a site-relative path.
 *
 * Step 3 was missing on the first pass, so the page rendered
 * `[movement break](/micro-movement)` as literal text to the reader. It
 * survived a check that grepped the page for `href="/micro-movement"` —
 * which matched the navigation. Grepping a whole page for a link proves
 * nothing about where the link is.
 */
/**
 * Markdown links to anchors, and nothing else.
 *
 * The pattern accepts a site-relative path and no other shape: no scheme,
 * no host, no `javascript:`. The paths come from our own registry, so this
 * is belt and braces rather than the only defence — but the input to this
 * function passed through a model, and a rule that only lets through
 * `/something` costs nothing to keep.
 */
function anchors(text: string): string {
  return text.replace(
    /\[([^\]]+)\]\((\/[a-z0-9\-/#]*)\)/gi,
    (_m, label: string, path: string) => `<a href="${path}">${label}</a>`,
  );
}

export function renderBody(body: string, selfPath: string): RenderedBlock[] {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = /^#{2,3}\s+/.test(block);
      const text = heading ? block.replace(/^#{2,3}\s+/, '') : block;
      const safe = escape(text.replace(/\n/g, ' '));
      return {
        kind: heading ? ('heading' as const) : ('paragraph' as const),
        // Headings are left unlinked: a link inside a heading competes
        // with the heading's own job, and search engines read the two
        // differently.
        html: heading ? safe : anchors(withAutoLinks(safe, { selfPath, max: 6 })),
      };
    });
}
