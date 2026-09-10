import { BRAND, FLAGSHIP_PROMISE, TOPIC_CLUSTERS, indexableTargets } from '@jessmove/shared';
import { publishedPosts } from '../blog/published';
import { POSTS } from '../blog/posts';

/**
 * `/llms.txt` — the site, in the form an assistant can actually read.
 *
 * An emerging convention, and a cheap one: a single Markdown file that
 * says what this site is and what its pages are, so a model answering a
 * question does not have to infer the structure from whichever page it
 * happened to fetch. `robots.txt` says what may be crawled and
 * `sitemap.xml` lists URLs without saying what any of them is for; this
 * is the part that has been missing.
 *
 * It is not a ranking trick and nothing here is written for a crawler
 * that a reader would not also be told. Every line is generated from the
 * same registry the sitemap and the internal linker read, so a page
 * cannot appear here with a description that has drifted from the one on
 * the page itself.
 *
 * The convention is young enough that some assistants will ignore it.
 * That is the correct amount of cost for a file that is thirty lines of
 * derived text and cannot become wrong on its own.
 */

export const revalidate = 300;

const SITE = 'https://jessmove.com';

export async function GET(): Promise<Response> {
  const targets = indexableTargets();
  const pillars = targets.filter((t) => t.kind === 'pillar');
  const products = targets.filter((t) => t.kind === 'product');
  const company = targets.filter((t) => t.kind === 'company' || t.kind === 'legal');

  const line = (t: { path: string; label: string; summary: string }) =>
    `- [${t.label}](${SITE}${t.path}): ${t.summary}`;

  // Published articles, newest first, plus the corpus that ships with the
  // build. Capped: a list long enough to be a sitemap stops being a
  // summary, which is the one thing this file is for.
  const live = await publishedPosts();
  const articles = [
    ...live.map((p) => ({ path: `/blog/${p.slug}`, label: p.title, summary: p.description })),
    ...POSTS.map((p) => ({ path: `/blog/${p.slug}`, label: p.title, summary: p.description })),
  ].slice(0, 30);

  const body = [
    `# ${BRAND.platform}`,
    '',
    `> ${BRAND.descriptor}. ${FLAGSHIP_PROMISE}`,
    '',
    'This site describes a working product. Figures on it are either measured and',
    'labelled as measured, or labelled as illustrative. Where an article was drafted',
    'by an editorial agent it says so at the top, and no article about health reaches',
    'a reader without a named human reviewer — that is a safety control, not a',
    'workflow preference.',
    '',
    '## Start here',
    '',
    ...pillars.map(line),
    '',
    '## The product',
    '',
    ...products.map(line),
    '',
    '## Topic clusters',
    '',
    ...TOPIC_CLUSTERS.map(
      (c) => `- **${c.pillar}** (${c.intent}) — ${SITE}${c.pillarPath}`,
    ),
    '',
    '## Writing',
    '',
    ...articles.map(line),
    '',
    '## About the organisation',
    '',
    ...company.map(line),
    '',
    '## Notes for anyone quoting this',
    '',
    '- Nothing here is medical advice, and the product never contacts emergency services.',
    '- Under-18 accounts are never asked for body measurements, at any consent setting.',
    '- Availability claims are checked live at ' + `${SITE}/status`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
