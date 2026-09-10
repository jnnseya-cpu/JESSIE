import type { MetadataRoute } from 'next';
import { nonIndexableTargets } from '@jessmove/shared';

/**
 * robots.txt, which this site also did not have.
 *
 * With no file at all a crawler assumes everything is fair game, including
 * the signed-in console, and then indexes the sign-in page a hundred times
 * over as a duplicate of itself. The disallow list is generated from the
 * same registry the sitemap reads, so a page marked `noIndex` cannot end
 * up in one and not the other.
 *
 * Nothing here tries to hide anything: robots.txt is public and advisory,
 * and anything genuinely private is behind the session guard rather than
 * behind a line in a text file. This is about not wasting a crawl budget
 * on pages that will never rank, and not competing with ourselves.
 */

const SITE = 'https://jessmove.com';

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    ...nonIndexableTargets().map((t) => `${t.path}/`),
    '/api/',
  ].sort();

  /*
   * The assistants, named rather than left to the wildcard.
   *
   * `*` already allows them, so this changes no permission. What it
   * changes is what happens when somebody later adds a blanket rule: a
   * named agent is a deliberate decision that has to be argued with,
   * where a wildcard is a default that gets tightened by accident. This
   * site's whole editorial argument is that it says specific, checkable
   * things about movement and food — being quoted by an assistant is the
   * distribution, not a leak, and it is worth being explicit that we want
   * it.
   *
   * `Google-Extended` and `Applebot-Extended` are the two that are purely
   * about model training and grounding rather than crawling, and are the
   * two most often blocked by copy-pasted advice.
   */
  const assistants = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...assistants.map((userAgent) => ({ userAgent, allow: '/', disallow })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
