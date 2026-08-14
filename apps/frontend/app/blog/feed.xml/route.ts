import { POSTS } from '../posts';
import { publishedPosts } from '../published';

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
 * The feed.
 *
 * External backlinks are earned, and the honest way to earn them is to be
 * easy to follow and easy to quote. A feed is the oldest form of that: it
 * puts new articles in front of the aggregators, newsletters and readers
 * who cite things, without anybody having to check the site.
 *
 * Full descriptions rather than full bodies. A feed that carries the whole
 * article gets republished in place of the original, and the link that
 * would have pointed here points at the copy instead.
 */

const SITE = 'https://jessmove.com';

const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function GET(): Promise<Response> {
  // Both corpora, newest first. A feed that omits the newer half is a
  // feed that trains its subscribers to stop opening it.
  const live = (await publishedPosts()).map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    category: p.category,
    publishedAt: p.publishedAt,
  }));
  const sorted = [...POSTS, ...live].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const updated = sorted[0]?.publishedAt ?? '2026-01-01';

  const items = sorted
    .map((post) => {
      const url = `${SITE}/blog/${post.slug}`;
      return [
        '    <item>',
        `      <title>${escape(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(`${post.publishedAt}T09:00:00Z`).toUTCString()}</pubDate>`,
        `      <category>${escape(post.category)}</category>`,
        `      <description>${escape(post.description)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>JESS MOVE — the blog</title>',
    `    <link>${SITE}/blog</link>`,
    '    <description>Everything written down, including the decisions that went badly.</description>',
    '    <language>en-GB</language>',
    `    <lastBuildDate>${new Date(`${updated}T09:00:00Z`).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
