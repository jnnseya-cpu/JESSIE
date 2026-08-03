import type { MetadataRoute } from 'next';
import { LINK_TARGETS } from '@jessmove/shared';

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
    ...LINK_TARGETS.filter((t) => t.noIndex).map((t) => `${t.path}/`),
    '/api/',
  ].sort();

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
