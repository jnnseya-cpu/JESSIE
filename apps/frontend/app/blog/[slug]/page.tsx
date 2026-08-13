import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TOPIC_CLUSTERS, backlinksTo } from '@jessmove/shared';
import { Footer, Nav, SkipLink, JoinCta } from '../../ui';
import { POSTS, postBySlug } from '../posts';
import { SITE_GRAPH } from '../graph';
import { Linked, newLinkBudget } from '../linked';
import { ViewBeacon } from '../view-beacon';

const SITE = 'https://jessmove.com';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = postBySlug(params.slug);
  if (!post) return { title: 'Not found — JESS MOVE' };

  const url = `${SITE}/blog/${post.slug}`;
  return {
    title: `${post.title} — JESS MOVE`,
    description: post.description,
    keywords: [post.keyword],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      section: post.category,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  };
}

export default function Post({ params }: { params: { slug: string } }) {
  const post = postBySlug(params.slug);
  if (!post) notFound();

  const cluster = TOPIC_CLUSTERS.find((c) => c.key === post.clusterKey) ?? null;
  const others = POSTS.filter((p) => p.slug !== post.slug);
  const related = [
    ...others.filter((p) => p.clusterKey && p.clusterKey === post.clusterKey),
    ...others.filter((p) => !p.clusterKey || p.clusterKey !== post.clusterKey),
  ].slice(0, 3);

  // One budget for the whole article, spent as the reader goes down it, so
  // the links land in the opening argument rather than in the footnotes.
  const budget = newLinkBudget(6);
  const selfPath = `/blog/${post.slug}`;

  // What on this site points here. The graph read backwards — internal
  // backlinks, which are the part of "backlinks" anybody actually controls.
  const backlinks = backlinksTo(SITE_GRAPH, selfPath).slice(0, 6);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    articleSection: post.category,
    keywords: post.keyword,
    wordCount: post.words,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: 'en-GB',
    url: `${SITE}/blog/${post.slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${post.slug}` },
    author: { '@type': 'Organization', name: 'JESS MOVE' },
    publisher: { '@type': 'Organization', name: 'JESS MOVE' },
  };

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 2, name: post.title, item: `${SITE}/blog/${post.slug}` },
    ],
  };

  return (
    <>
      <SkipLink />
      <Nav current="/blog" />
      <ViewBeacon slug={post.slug} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      <main id="main">
        <header className="phero">
          <div className="wrap">
            <p className="phero__crumbs">
              <Link href="/blog">Blog</Link> <span aria-hidden="true">/</span> {post.category}
            </p>
            <h1>{post.title}</h1>
            <p className="phero__lede">
              <Linked text={post.lede} selfPath={selfPath} budget={budget} />
            </p>
            <p className="article__meta">
              <time dateTime={post.publishedAt}>{post.displayDate}</time>
              <span aria-hidden="true"> · </span>
              {post.readMinutes} min read
              <span aria-hidden="true"> · </span>
              {post.words.toLocaleString('en-GB')} words
              <span aria-hidden="true"> · </span>
              human-written, human-reviewed
            </p>
          </div>
        </header>

        <section className="section">
          <div className="wrap">
            <article className="article">
              {post.sections.map((s) => (
                <section key={s.h}>
                  <h2>{s.h}</h2>
                  {s.p.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)}>
                      <Linked text={paragraph} selfPath={selfPath} budget={budget} />
                    </p>
                  ))}
                </section>
              ))}
            </article>

            <div className="dash" style={{ marginTop: 48 }}>
              {cluster && (
                <article className="card card--7 card--light">
                  <div className="card__head">
                    <h3 className="card__t">Part of: {cluster.pillar}</h3>
                    <span className="card__tag">{cluster.intent}</span>
                  </div>
                  <p className="card__note">
                    This article sits in the <code>{cluster.key}</code> cluster and links up to{' '}
                    <Link href={cluster.pillarPath}>{cluster.pillarPath}</Link>. Clusters are how
                    the editorial agent decides what to write next — the thinnest one wins.
                  </p>
                  <ul className="pills">
                    {cluster.supporting.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </article>
              )}

              <article className={`card card--${cluster ? '5' : '12'} card--light`}>
                <div className="card__head">
                  <h3 className="card__t">Referenced here</h3>
                </div>
                <ul className="pills">
                  {post.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
                <p className="card__note">
                  Reading this page records the time it was visible and how far it was scrolled.
                  No cookie, no identifier, and the connecting address is hashed with a salt that
                  regenerates daily. <Link href="/privacy">How that works</Link>.
                </p>
              </article>

              {/*
                The graph read backwards. A page nothing links to is a page
                a crawler reaches late and a reader never reaches at all, so
                the inbound links are shown rather than merely counted —
                which also means an orphan is visible on the page itself
                instead of only in an audit nobody opens.
              */}
              {backlinks.length > 0 && (
                <article className="card card--12 card--light">
                  <div className="card__head">
                    <h3 className="card__t">Linked from</h3>
                    <span className="card__tag">{backlinks.length} pages</span>
                  </div>
                  <p className="card__note">
                    Other pages here that point at this one. Internal links are the part of
                    “backlinks” a site actually controls — nothing on this platform buys or
                    exchanges the other kind.
                  </p>
                  <ul className="pills">
                    {backlinks.map((n) => (
                      <li key={n.path}>
                        <Link href={n.path}>{n.label}</Link>
                      </li>
                    ))}
                  </ul>
                </article>
              )}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Read next</p>
              <h2>More of the same argument.</h2>
            </div>
            <div className="posts">
              {related.map((p) => (
                <article className="post" key={p.slug}>
                  <div className="post__meta">
                    <span className="post__cat">{p.category}</span>
                    <br />
                    {p.displayDate}
                    <br />
                    {p.readMinutes} min read
                  </div>
                  <div>
                    <h3>
                      <Link href={`/blog/${p.slug}`}>{p.title}</Link>
                    </h3>
                    <p>{p.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        {/*
          The only thing on this page that was missing, and the one that
          decides whether any of the writing is worth doing.

          Somebody arriving from a search engine lands here, not on the
          home page — that is what organic acquisition is. Until this
          existed, a reader who finished an article could go to /blog or
          to /privacy, and those were the complete options. Traffic that
          cannot convert is traffic gathered for nothing, however much of
          it there is.
        */}
        <JoinCta
          heading="This is written about a product you can use today."
          says="Everything described here is running. An account is free, takes about two minutes, and the writing stays free whether or not you make one."
          talkTo="/how-it-works"
          talkLabel="How it works"
          action="Create your account"
        />
      </main>

      <Footer />
    </>
  );
}
