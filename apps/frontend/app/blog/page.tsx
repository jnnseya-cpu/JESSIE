import type { Metadata } from 'next';
import Link from 'next/link';
import { SEO_RULES, TOPIC_CLUSTERS } from '@jessmove/shared';
import { Footer, Nav, PageHero, SkipLink } from '../ui';
import { POSTS } from './posts';

export const metadata: Metadata = {
  title: 'Blog — JESS MOVE',
  description:
    'Engineering notes and product decisions, written up properly — including the arguments ' +
    'we lost and the releases they delayed.',
  alternates: {
    canonical: 'https://jessmove.com/blog',
    // Autodiscovery. A reader who wants to follow this without checking the
    // site, and an aggregator that would otherwise never find the feed.
    types: { 'application/rss+xml': 'https://jessmove.com/blog/feed.xml' },
  },
};

/** The editorial pipeline, in the order it runs. */
const PIPELINE = [
  {
    step: 'The thinnest topic cluster wins',
    detail:
      'Six clusters, each with a pillar page and a set of supporting subjects. The agent is ' +
      'commissioned against whichever cluster has the fewest published articles relative to its ' +
      'subjects — not against whatever ranked well last month.',
  },
  {
    step: 'The SEO agent writes a draft',
    detail:
      'A frontier-tier call through the AI Gateway, ceiling 18 ACU, 90-second timeout. It gets ' +
      'the cluster, the pillar path, the sibling subjects and the banned lexicon. It returns ' +
      'title, description, keywords, a Markdown body and internal links.',
  },
  {
    step: 'The audit scores it, deterministically',
    detail:
      'Title and description length, slug format, word count, heading structure, keyword ' +
      'density, internal linking, cluster validity — and the banned lexicon, which is a blocker ' +
      'rather than a warning. Same draft in, same score out, every time.',
  },
  {
    step: 'One repair attempt, not a loop',
    detail:
      'A failing draft goes back with its own findings attached, and the repair is kept only if ' +
      'it scores higher. An agent that cannot fix its blockers on the second pass will not on ' +
      'the fifth, and every pass spends real money.',
  },
  {
    step: 'A named person publishes, or nobody does',
    detail:
      'The status machine has no edge from draft to published. Publishing requires a reviewer ' +
      'name and re-runs the audit at that moment rather than trusting the score stored when the ' +
      'draft was written.',
  },
];

const TRACKING = [
  ['No cookie', 'Nothing is written to the reader’s device. There is no consent banner because there is nothing to consent to.'],
  ['No stored address', 'The connecting address and user agent are hashed on arrival with a salt that regenerates daily. The raw values are never held in a variable that outlives the request.'],
  ['A view is not a read', 'A read is 25 seconds visible and 55 per cent scrolled. Both numbers are reported, separately, and the gap between them is the interesting part.'],
  ['Visible time only', 'A background tab accrues nothing. A page left open over lunch is not a two-hour read, and counting it as one flatters us in exactly the wrong direction.'],
  ['90-day retention', 'Events older than that are dropped rather than archived. Uniqueness holds within a day and deliberately stops holding across days.'],
  ['Nothing to sell', 'There is no identifier in the event, so there is no audience to build, no profile to enrich and no third party to share one with.'],
] as const;

export default function Blog() {
  const totalWords = POSTS.reduce((n, p) => n + p.words, 0);
  const covered = TOPIC_CLUSTERS.reduce(
    (n, c) => n + POSTS.filter((p) => p.clusterKey === c.key).length,
    0,
  );
  const supporting = TOPIC_CLUSTERS.reduce((n, c) => n + c.supporting.length, 0);

  return (
    <>
      <SkipLink />
      <Nav current="/blog" />

      <main id="main">
        <PageHero
          crumb="Blog"
          eyebrow="Notes"
          title="The arguments behind the product."
          lede={
            'Engineering notes and product decisions, written up properly — including the ones ' +
            'that made the roadmap slower and the ones we got wrong the first time.'
          }
        />

        <section className="section">
          <div className="wrap">
            <div className="dash">
              <article className="card card--3 card--light">
                <div className="stat__k">Published</div>
                <div className="stat__v">{POSTS.length}</div>
                <p className="card__note">articles, all human-reviewed</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Clusters</div>
                <div className="stat__v">{TOPIC_CLUSTERS.length}</div>
                <p className="card__note">
                  {covered} of {supporting} supporting subjects covered
                </p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Words</div>
                <div className="stat__v">{(totalWords / 1000).toFixed(1)}k</div>
                <p className="card__note">no article below {SEO_RULES.bodyWordsMin} words</p>
              </article>
              <article className="card card--3 card--light">
                <div className="stat__k">Audit floor</div>
                <div className="stat__v">{SEO_RULES.scorePass}</div>
                <p className="card__note">score required to publish, out of 100</p>
              </article>
            </div>

            <div className="posts" style={{ marginTop: 40 }}>
              {POSTS.map((p) => (
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
                    <p className="post__more">
                      <Link href={`/blog/${p.slug}`}>Read the article →</Link>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Editorial pipeline</p>
              <h2>An agent drafts. A person publishes.</h2>
              <p className="lede">
                Those are two different verbs, and the system does not let them collapse into
                one. The status machine has no transition from <code>draft</code> to{' '}
                <code>published</code> — a draft goes to review, and review is a name, not a
                flag.
              </p>
            </div>

            <div className="steps">
              {PIPELINE.map((s, i) => (
                <div className="steprow" key={s.step}>
                  <div className="steprow__n">{String(i + 1).padStart(2, '0')}</div>
                  <div>
                    <h3>{s.step}</h3>
                    <p>{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="dash" style={{ marginTop: 44 }}>
              <article className="card card--7 card--light">
                <div className="card__head">
                  <h3 className="card__t">The rule the agent cannot negotiate</h3>
                  <span className="card__tag" style={{ color: 'var(--jm-critical)' }}>
                    blocker
                  </span>
                </div>
                <p className="card__note">
                  Every banned term in the brand lexicon — the weight-loss vocabulary, the guilt
                  vocabulary, the streak-threat vocabulary — is a <strong>blocker</strong> in the
                  audit, not a warning. A draft containing one cannot reach review however well
                  it scores on everything else.
                </p>
                <p className="card__note">
                  This matters specifically for search, because those phrases have real volume
                  and an optimiser pointed at traffic will reach for them. The rule lives in the
                  audit function rather than the prompt: a prompt is a request, a function is a
                  gate.
                </p>
              </article>

              <article className="card card--5 card--light">
                <div className="card__head">
                  <h3 className="card__t">What the audit measures</h3>
                </div>
                <ul className="pills">
                  <li>title {SEO_RULES.titleMin}–{SEO_RULES.titleMax} chars</li>
                  <li>description {SEO_RULES.descriptionMin}–{SEO_RULES.descriptionMax}</li>
                  <li>body ≥ {SEO_RULES.bodyWordsMin} words</li>
                  <li>≥ {SEO_RULES.headingsMin} sections</li>
                  <li>no H1 in body</li>
                  <li>≥ {SEO_RULES.internalLinksMin} internal links</li>
                  <li>density ≤ {(SEO_RULES.keywordDensityMax * 100).toFixed(1)}%</li>
                  <li style={{ borderColor: 'var(--jm-critical)' }}>banned lexicon</li>
                  <li style={{ borderColor: 'var(--jm-critical)' }}>normalised slug</li>
                </ul>
                <p className="card__note">
                  Every finding carries a fix as well as a complaint — that is asserted in the
                  test suite, because a finding you cannot act on is noise.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Topic clusters</p>
              <h2>Cover a subject completely, then link it together.</h2>
              <p className="lede">
                That is what search visibility is made of — not repeating a phrase. Each cluster
                has one pillar page and the articles that link up to it, and the emptiest cluster
                is what the agent gets commissioned against next.
              </p>
            </div>

            <div className="dash">
              {TOPIC_CLUSTERS.map((c) => {
                const published = POSTS.filter((p) => p.clusterKey === c.key).length;
                const done = published >= c.supporting.length;
                return (
                  <article className="card card--4 card--light" key={c.key}>
                    <div className="card__head">
                      <h3 className="card__t">{c.pillar}</h3>
                      <span
                        className="card__tag"
                        style={{
                          color: done ? 'var(--jm-excellent)' : 'var(--jm-monitor)',
                        }}
                      >
                        {published}/{c.supporting.length}
                      </span>
                    </div>
                    <p className="card__note">
                      Pillar: <Link href={c.pillarPath}>{c.pillarPath}</Link> · {c.intent} intent
                    </p>
                    <ul className="pills">
                      {c.supporting.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section section--ink">
          <div className="wrap">
            <div className="section__head">
              <p className="eyebrow">Analytics</p>
              <h2>What we measure, and what we refuse to.</h2>
              <p className="lede">
                A blog on a health platform that quietly profiled its readers would be an odd
                thing to publish a privacy policy next to. The analytics are built to the same
                standard as the product.
              </p>
            </div>

            <div className="dash">
              {TRACKING.map(([k, v]) => (
                <article className="card card--4" key={k}>
                  <div className="card__head">
                    <h3 className="card__t">{k}</h3>
                  </div>
                  <p className="card__note">{v}</p>
                </article>
              ))}
            </div>

            <p className="lede" style={{ marginTop: 34 }}>
              The consequence is a unique-visitor count that is honest within a day and
              deliberately meaningless across days. We would rather have a number we can explain
              than a funnel we cannot.
            </p>
          </div>
        </section>

        <section className="section cta">
          <div className="wrap">
            <h2>Get the next one.</h2>
            <p>
              Occasional, long, and about the engineering. No growth-hacking newsletter, no
              seven-day challenge.
            </p>
            <div className="cta__row">
              <Link className="btn btn--primary" href="/contact">
                Join the list
              </Link>
              <Link className="btn btn--ghost" href="/developers">
                Developer reference
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
