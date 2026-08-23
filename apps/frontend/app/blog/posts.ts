import {
  ARTICLES,
  SEED_POSTS,
  type Article,
  type PostCategory,
  type Section,
} from '@jessmove/shared';

export type { Article, Section };

/**
 * The blog's rendered posts.
 *
 * Slugs, titles, categories, dates and target phrases live in
 * `@jessmove/shared` (`SEED_POSTS`), and so does the prose (`ARTICLES`).
 * The prose used to live here on the reasoning that the API had no need of
 * it — which stopped being true the moment the SEO audit tried to score an
 * article and found an empty body. This module now assembles the two into
 * what the site renders, and holds no content of its own.
 */

export interface FullPost extends Article {
  readonly title: string;
  readonly category: PostCategory;
  readonly publishedAt: string;
  readonly keyword: string;
  readonly clusterKey: string | null;
  readonly words: number;
  readonly readMinutes: number;
  readonly displayDate: string;
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function assemble(): readonly FullPost[] {
  return SEED_POSTS.map((seed) => {
    const article = ARTICLES.find((a) => a.slug === seed.slug);
    if (!article) {
      // A seed without a body is a build-time error, not a blank page.
      throw new Error(`no article body for seed post "${seed.slug}"`);
    }
    const words =
      article.lede.split(/\s+/).length +
      article.sections.reduce(
        (n, s) => n + s.h.split(/\s+/).length + s.p.join(' ').split(/\s+/).length,
        0,
      );
    return {
      ...article,
      title: seed.title,
      category: seed.category,
      publishedAt: seed.publishedAt,
      keyword: seed.keyword,
      clusterKey: seed.clusterKey,
      words,
      readMinutes: Math.max(1, Math.round(words / 220)),
      displayDate: DATE.format(new Date(`${seed.publishedAt}T00:00:00Z`)),
    };
  });
}

export const POSTS: readonly FullPost[] = assemble();

export function postBySlug(slug: string): FullPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
