import type { MetadataRoute } from 'next';
import { TOPIC_CLUSTERS, indexableTargets } from '@jessmove/shared';
import { POSTS } from './blog/posts';
import { publishedPosts } from './blog/published';

/*
 * Rebuilt periodically rather than frozen at deploy.
 *
 * Without this the page is prerendered once, with whatever the API
 * returned during the build — which for a blog is "the articles that
 * existed when somebody last deployed", and that is the state this site
 * was already in. Five minutes is the gap between publishing and being
 * readable.
 */
export const revalidate = 300;

/**
 * The sitemap, which this site did not have.
 *
 * Not a formality. Without one a crawler finds pages only by following
 * links, which means anything with a thin inbound graph is discovered late
 * or not at all — and the pages that matter commercially are usually the
 * ones nothing links to yet. A sitemap is the one place we get to say
 * "these exist, this is when they last changed" without waiting to be
 * found.
 *
 * `lastModified` is real. Making it today's date on every build, which is
 * the common shortcut, tells a crawler the whole site changes daily; it
 * learns that is untrue and stops believing the field. An article's date
 * is its publication date and stays there until the article is edited.
 *
 * Priority is relative and only meaningful within one site: pillars above
 * articles, articles above legal pages. Signed-in surfaces are absent
 * entirely — see `noIndex` in the registry.
 */

const SITE = 'https://jessmove.com';

const PRIORITY: Record<string, number> = {
  pillar: 0.9,
  product: 0.8,
  entry: 0.7,
  company: 0.5,
  legal: 0.3,
};

/** The most recent article date, used for pages that aggregate articles. */
function newestPost(): Date {
  const newest = POSTS.map((p) => p.publishedAt).sort().at(-1);
  return new Date(`${newest ?? '2026-01-01'}T00:00:00Z`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const clusterPillars = new Set(TOPIC_CLUSTERS.map((c) => c.pillarPath));

  const pages = indexableTargets().map((target) => ({
    url: `${SITE}${target.path === '/' ? '' : target.path}`,
    // A page that aggregates articles is as fresh as its newest one.
    lastModified: target.path === '/blog' || target.path === '/' ? newestPost() : undefined,
    changeFrequency: (clusterPillars.has(target.path) ? 'monthly' : 'yearly') as
      | 'monthly'
      | 'yearly',
    priority: target.path === '/' ? 1 : PRIORITY[target.kind] ?? 0.5,
  }));

  const articles = POSTS.map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: new Date(`${post.publishedAt}T00:00:00Z`),
    changeFrequency: 'yearly' as const,
    // An article in a cluster is part of an argument; a standalone one is not.
    priority: post.clusterKey ? 0.7 : 0.6,
  }));

  /*
   * Everything the editorial pipeline published. Absent from here an
   * article is discoverable only by a crawler following a link to it, and
   * a new page with a thin inbound graph is exactly the page that gets
   * found late or never.
   */
  const live = (await publishedPosts()).map((post) => ({
    url: `${SITE}/blog/${post.slug}`,
    lastModified: post.publishedAt ? new Date(`${post.publishedAt}T00:00:00Z`) : undefined,
    changeFrequency: 'yearly' as const,
    priority: post.clusterKey ? 0.7 : 0.6,
  }));

  return [...pages, ...articles, ...live];
}
