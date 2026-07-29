import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TOPIC_CLUSTERS } from '@jessmove/shared';
import { Footer, Nav, SkipLink } from '../../ui';
import { POSTS, postBySlug } from '../posts';
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
            <p className="phero__lede">{post.lede}</p>
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
                    <p key={paragraph.slice(0, 48)}>{paragraph}</p>
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
      </main>

      <Footer />
    </>
  );
}
