import Link from 'next/link';
import { TOPIC_CLUSTERS } from '@jessmove/shared';
import { Footer, JoinCta, Nav, SkipLink } from '../../ui';
import { ViewBeacon } from '../view-beacon';
import { renderBody, type PublishedPost } from '../published';

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * An article the editorial pipeline published.
 *
 * Rendered separately from the hand-written corpus because the two are
 * genuinely different things and pretending otherwise would be the
 * dishonest option: these were drafted by a model and read by a named
 * person, and the page says so at the top rather than in a footer.
 *
 * That disclosure is not a legal hedge. It is an assurance control the
 * platform publishes — AI involvement is disclosed wherever it produced
 * something a person reads — and a reader who finds out later that an
 * article about their knees was machine-drafted has been misled by
 * omission, whatever the quality of the writing.
 */
export function AgentPost({ post }: { post: PublishedPost }) {
  const cluster = TOPIC_CLUSTERS.find((c) => c.key === post.clusterKey) ?? null;
  const selfPath = `/blog/${post.slug}`;
  const blocks = renderBody(post.body, selfPath);
  const words = post.body.split(/\s+/).filter(Boolean).length;

  return (
    <>
      <SkipLink />
      <Nav current="/blog" />
      <ViewBeacon slug={post.slug} />

      <main id="main">
        <article>
          <section className="phero">
            <div className="wrap">
              <p className="phero__crumbs">
                <Link href="/blog">Blog</Link>
                <span aria-hidden="true">/</span>
                <span>{post.category}</span>
              </p>
              <h1>{post.title}</h1>
              <p className="phero__lede">{post.description}</p>
              <p className="post__byline">
                {post.publishedAt ? DATE.format(new Date(post.publishedAt)) : 'Draft'} ·{' '}
                {Math.max(1, Math.round(words / 220))} min read
                {cluster ? ` · ${cluster.pillar}` : ''}
              </p>
            </div>
          </section>

          {/* Said at the top, where it is read, not at the bottom. */}
          {post.agentDrafted && (
            <section className="section">
              <div className="wrap">
                <p className="post__disclosure">
                  Drafted by this platform&rsquo;s editorial agent and reviewed before publication
                  {post.reviewedBy ? ` by ${post.reviewedBy}` : ''}. Nothing here is written by a
                  model and put straight in front of you — the review is a person, and it is a
                  requirement rather than a habit.
                </p>
              </div>
            </section>
          )}

          <section className="section">
            <div className="wrap post__body">
              {blocks.map((block, i) =>
                block.kind === 'heading' ? (
                  <h2 key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
                ) : (
                  <p key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
                ),
              )}
            </div>
          </section>

          {cluster && (
            <section className="section section--tint">
              <div className="wrap">
                <p className="eyebrow">More on this</p>
                <h2>{cluster.pillar}</h2>
                <p className="asr__lede">
                  This article belongs to a group of pages that argue one thing together. The one
                  they all point at is{' '}
                  <Link href={cluster.pillarPath}>{cluster.pillar.toLowerCase()}</Link>.
                </p>
              </div>
            </section>
          )}

          <JoinCta
            heading="This is written about a product you can use today."
            says="Everything described here is running. An account is free, takes about two minutes, and the writing stays free whether or not you make one."
            talkTo="/how-it-works"
            talkLabel="How it works"
            action="Create your account"
          />
        </article>
      </main>

      <Footer />
    </>
  );
}
