import { TOPIC_CLUSTERS } from './blog';
import {
  LINK_TARGETS,
  isKnownPath,
  normalisePath,
  targetFor,
  type LinkTarget,
} from './site-paths';

/**
 * The internal link graph.
 *
 * Two things are usually meant by "backlinks", and they are not the same
 * thing, so this file is explicit about which one it does.
 *
 *  * **Internal backlinks** — the pages on this site that link *to* a given
 *    page. This is the part that is entirely within our control, and it is
 *    the strongest on-site signal there is: a page nothing links to is a
 *    page a crawler reaches late, ranks poorly, and sometimes never indexes
 *    at all. That is what this file builds, audits and enforces.
 *
 *  * **External backlinks** — other people's sites linking here. Those are
 *    earned, and nothing in this repository will ever manufacture them.
 *    Buying them, exchanging them, or generating them from a network is the
 *    one category of SEO work that gets a domain removed from an index
 *    rather than promoted in it, and a health platform has more to lose
 *    from that than anyone. What this codebase does instead is make the
 *    site *easy to cite*: a sitemap, a feed, canonical URLs, structured
 *    data, and pages that state a specific number somebody would want to
 *    quote.
 */

/* ------------------------------------------------------------------ *
 * Contextual auto-linking
 * ------------------------------------------------------------------ */

/**
 * How many automatic links one article may gain.
 *
 * Bounded on purpose. A paragraph where every third phrase is blue reads
 * as a link farm to a person and to a ranker, and the value of any one
 * link falls as the count rises. Five is enough to connect an article to
 * its cluster and still read as prose written by somebody.
 */
export const MAX_AUTO_LINKS = 5;

export interface AutoLink {
  readonly phrase: string;
  readonly path: string;
  readonly label: string;
  /** Character offset in the source text where the phrase begins. */
  readonly at: number;
}

/**
 * Finds where prose should link, without touching the prose.
 *
 * Returns positions rather than rewritten text so the caller decides how
 * to render them — Markdown, JSX, or not at all. Rules, all of which exist
 * because breaking one of them makes the page worse:
 *
 *  - one link per destination, so an article never points at the same page
 *    four times;
 *  - the first occurrence only, because a reader who did not click it at
 *    the top will not click it at the bottom;
 *  - longest phrase wins, so "movement snacks" beats "movement";
 *  - never inside an existing link, a heading, code, or a URL;
 *  - never a link to the page you are already on.
 */
export function autoLinksFor(
  text: string,
  options: { readonly selfPath?: string; readonly max?: number; readonly exclude?: readonly string[] } = {},
): readonly AutoLink[] {
  const max = options.max ?? MAX_AUTO_LINKS;
  const self = options.selfPath ? normalisePath(options.selfPath) : null;
  const excluded = new Set((options.exclude ?? []).map(normalisePath));

  // Regions the linker must not enter: existing markdown links, inline and
  // fenced code, headings, and bare URLs.
  const blocked: [number, number][] = [];
  const block = (pattern: RegExp): void => {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      blocked.push([match.index, match.index + match[0].length]);
    }
  };
  block(/\[[^\]]*\]\([^)]*\)/g);
  block(/```[\s\S]*?```/g);
  block(/`[^`]*`/g);
  block(/^#{1,6}[^\n]*$/gm);
  block(/https?:\/\/\S+/g);

  const inBlocked = (start: number, end: number): boolean =>
    blocked.some(([from, to]) => start < to && end > from);

  const candidates: AutoLink[] = [];
  const haystack = text.toLowerCase();

  for (const target of LINK_TARGETS) {
    const path = normalisePath(target.path);
    if (target.noIndex || path === self || excluded.has(path)) continue;

    // Longest phrase first, so the most specific wording wins the position.
    const phrases = [...target.phrases].sort((a, b) => b.length - a.length);
    for (const phrase of phrases) {
      const needle = phrase.toLowerCase();
      let from = 0;
      let found = -1;
      while (from <= haystack.length) {
        const at = haystack.indexOf(needle, from);
        if (at < 0) break;
        const before = at === 0 ? ' ' : text[at - 1] ?? ' ';
        const after = text[at + needle.length] ?? ' ';
        const wordBoundary = !/[a-z0-9]/i.test(before) && !/[a-z0-9-]/i.test(after);
        if (wordBoundary && !inBlocked(at, at + needle.length)) {
          found = at;
          break;
        }
        from = at + 1;
      }
      if (found >= 0) {
        candidates.push({ phrase: text.slice(found, found + phrase.length), path, label: target.label, at: found });
        break; // one phrase per destination
      }
    }
  }

  // Earliest in the article first: a link near the top is worth more than
  // one the reader never scrolls to.
  return candidates.sort((a, b) => a.at - b.at).slice(0, max);
}

/** The same thing, applied — Markdown in, Markdown with links out. */
export function withAutoLinks(
  text: string,
  options: Parameters<typeof autoLinksFor>[1] = {},
): string {
  const links = autoLinksFor(text, options);
  if (links.length === 0) return text;
  let out = text;
  // Right to left, so earlier offsets stay valid as the string grows.
  for (const link of [...links].sort((a, b) => b.at - a.at)) {
    out =
      out.slice(0, link.at) +
      `[${link.phrase}](${link.path})` +
      out.slice(link.at + link.phrase.length);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The graph
 * ------------------------------------------------------------------ */

export interface GraphNode {
  readonly path: string;
  readonly label: string;
  readonly kind: LinkTarget['kind'] | 'article';
  readonly cluster: string | null;
  /** Paths this page links out to. */
  readonly outbound: readonly string[];
  /** Paths that link to this page — the internal backlinks. */
  readonly inbound: readonly string[];
  readonly noIndex: boolean;
}

export interface GraphArticle {
  readonly slug: string;
  readonly title: string;
  readonly clusterKey: string | null;
  readonly links: readonly string[];
  readonly body?: string;
}

export interface LinkGraph {
  readonly nodes: readonly GraphNode[];
  /** Indexable pages with no inbound link at all. */
  readonly orphans: readonly string[];
  /** Links pointing at paths that do not exist. */
  readonly dead: readonly { from: string; to: string }[];
  /** Pillars with fewer inbound links than their cluster has articles. */
  readonly weakPillars: readonly { path: string; inbound: number; expected: number }[];
  readonly totalEdges: number;
}

/**
 * Builds the whole graph from the articles plus the static registry.
 *
 * Static pages are assumed to link to each other through the navigation
 * and footer, which every page carries — so the graph seeds those edges
 * rather than pretending the site is a set of islands. Everything else is
 * a real declared link.
 */
export function buildLinkGraph(articles: readonly GraphArticle[]): LinkGraph {
  const slugs = articles.map((a) => a.slug);
  const outbound = new Map<string, Set<string>>();
  const inbound = new Map<string, Set<string>>();
  const dead: { from: string; to: string }[] = [];

  const node = (path: string): void => {
    const p = normalisePath(path);
    if (!outbound.has(p)) outbound.set(p, new Set());
    if (!inbound.has(p)) inbound.set(p, new Set());
  };

  for (const target of LINK_TARGETS) node(target.path);
  for (const article of articles) node(`/blog/${article.slug}`);

  const edge = (from: string, to: string): void => {
    const f = normalisePath(from);
    const t = normalisePath(to);
    if (f === t) return;
    if (!isKnownPath(t, slugs)) {
      dead.push({ from: f, to: t });
      return;
    }
    node(f);
    node(t);
    outbound.get(f)!.add(t);
    inbound.get(t)!.add(f);
  };

  /*
   * The navigation and the footer are on every page, so the links in them
   * are real inbound links to every destination they list — a crawler
   * following them reaches those pages from anywhere on the site.
   *
   * Modelling this rather than assuming it is what makes the orphan report
   * mean something. Seed too few edges and every ordinary page looks
   * orphaned, which trains an operator to ignore the finding; seed them
   * from nothing and a genuinely unreachable page hides in the noise.
   */
  const chrome = LINK_TARGETS.filter((t) => t.inChrome && !t.noIndex).map((t) => t.path);
  for (const from of LINK_TARGETS.filter((t) => !t.noIndex).map((t) => t.path)) {
    for (const to of chrome) edge(from, to);
  }
  // Articles carry the same chrome.
  for (const article of articles) {
    for (const to of chrome) edge(`/blog/${article.slug}`, to);
  }

  for (const article of articles) {
    const from = `/blog/${article.slug}`;
    for (const to of article.links) edge(from, to);

    // Prose links count too — an article that mentions FoodLens in a
    // sentence and links it there is doing more than a list at the bottom.
    if (article.body) {
      for (const link of autoLinksFor(article.body, { selfPath: from })) edge(from, link.path);
    }

    // A cluster's articles link up to the pillar and across to siblings.
    const cluster = TOPIC_CLUSTERS.find((c) => c.key === article.clusterKey);
    if (cluster) {
      edge(from, cluster.pillarPath);
      for (const sibling of articles) {
        if (sibling.slug !== article.slug && sibling.clusterKey === article.clusterKey) {
          edge(from, `/blog/${sibling.slug}`);
        }
      }
    }
    // And the index links to every article.
    edge('/blog', from);
  }

  const nodes: GraphNode[] = [...outbound.keys()].map((path) => {
    const target = targetFor(path);
    const article = articles.find((a) => `/blog/${a.slug}` === path);
    return {
      path,
      label: target?.label ?? article?.title ?? path,
      kind: target?.kind ?? 'article',
      cluster: target?.cluster ?? article?.clusterKey ?? null,
      outbound: [...(outbound.get(path) ?? [])].sort(),
      inbound: [...(inbound.get(path) ?? [])].sort(),
      noIndex: target?.noIndex ?? false,
    };
  });

  const orphans = nodes
    .filter((n) => !n.noIndex && n.path !== '/' && n.inbound.length === 0)
    .map((n) => n.path);

  const weakPillars = TOPIC_CLUSTERS.map((cluster) => {
    const path = normalisePath(cluster.pillarPath);
    const found = nodes.find((n) => n.path === path);
    const expected = articles.filter((a) => a.clusterKey === cluster.key).length;
    return { path, inbound: found?.inbound.length ?? 0, expected };
  }).filter((p) => p.inbound < p.expected);

  return {
    nodes: nodes.sort((a, b) => b.inbound.length - a.inbound.length),
    orphans,
    dead,
    weakPillars,
    totalEdges: nodes.reduce((sum, n) => sum + n.outbound.length, 0),
  };
}

/** The internal backlinks for one page, richest first. */
export function backlinksTo(graph: LinkGraph, path: string): readonly GraphNode[] {
  const p = normalisePath(path);
  const node = graph.nodes.find((n) => n.path === p);
  if (!node) return [];
  return node.inbound
    .map((from) => graph.nodes.find((n) => n.path === from))
    .filter((n): n is GraphNode => Boolean(n))
    .sort((a, b) => b.inbound.length - a.inbound.length);
}
