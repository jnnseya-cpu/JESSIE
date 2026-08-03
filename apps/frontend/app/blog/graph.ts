import { buildLinkGraph, type LinkGraph } from '@jessmove/shared';
import { POSTS } from './posts';

/**
 * The site's link graph, built once at build time.
 *
 * Every page that needs to know what links to it reads from here rather
 * than working it out again, and because it is computed from the same
 * article data the pages render from, the graph cannot describe a site
 * that does not exist.
 *
 * The prose of each article is flattened into one string so the automatic
 * contextual linker sees the same text a reader does — a link that appears
 * in a sentence is an edge in this graph exactly like a link in the
 * "referenced here" list, because to a crawler they are the same thing.
 */

function prose(slug: string): string {
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return '';
  return [post.lede, ...post.sections.flatMap((s) => s.p)].join('\n\n');
}

export const SITE_GRAPH: LinkGraph = buildLinkGraph(
  POSTS.map((post) => ({
    slug: post.slug,
    title: post.title,
    clusterKey: post.clusterKey,
    links: post.links.map((l) => l.href),
    body: prose(post.slug),
  })),
);
