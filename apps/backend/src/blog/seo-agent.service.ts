import { Injectable, Logger } from '@nestjs/common';
import {
  AGENT_REGISTRY,
  BANNED_LEXICON,
  PLATFORM_PAYERS,
  LINK_TARGETS,
  SEED_POSTS,
  SEO_RULES,
  TOPIC_CLUSTERS,
  countWords,
  isKnownPath,
  normalisePath,
  seoAudit,
  slugify,
  withAutoLinks,
  type PostCategory,
  type PostDraft,
  type SeoAudit,
  type TopicCluster,
} from '@jessmove/shared';
import { AiGatewayService, AllowanceExhaustedError } from '../ai/ai-gateway.service';

/**
 * The SEO agent.
 *
 * It writes drafts. It cannot publish, and the status machine has no edge
 * that would let it — see BlogService.
 *
 * Two things make this more than a prompt wrapper:
 *
 *  1. Every draft is scored by the deterministic audit in the shared
 *     package before it is returned, and the agent is given one chance to
 *     repair its own blockers. A draft that still fails comes back marked
 *     as failing, with the findings, rather than being quietly returned as
 *     if it were fine.
 *
 *  2. If no model provider is configured, it does not throw. It returns a
 *     structured brief built from the topic cluster — an outline, the
 *     internal links, the target lengths — which is genuinely useful to a
 *     human writer and keeps the endpoint testable without an API key.
 */

export interface DraftResult {
  readonly draft: PostDraft;
  readonly audit: SeoAudit;
  /** `model` when a provider wrote it, `brief` when it was assembled locally. */
  readonly source: 'model' | 'brief';
  readonly provider: string | null;
  readonly repairAttempted: boolean;
  readonly acuCeiling: number;
}

export interface DraftRequest {
  readonly topic: string;
  readonly category: PostCategory;
  readonly keyword: string;
  readonly clusterKey?: string;
  /** Strict lexicon: any article that a minor or a later-life reader may see. */
  readonly strict?: boolean;
}

const OUTPUT_SHAPE = {
  type: 'object',
  required: ['title', 'description', 'keyword', 'secondaryKeywords', 'body', 'internalLinks'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    keyword: { type: 'string' },
    secondaryKeywords: { type: 'array', items: { type: 'string' } },
    body: { type: 'string' },
    internalLinks: { type: 'array', items: { type: 'string' } },
  },
} as const;

@Injectable()
export class SeoAgentService {
  private readonly logger = new Logger(SeoAgentService.name);
  private static readonly CODE = 'SEO' as const;

  constructor(private readonly ai: AiGatewayService) {}

  private clusterFor(key?: string): TopicCluster | null {
    return TOPIC_CLUSTERS.find((c) => c.key === key) ?? null;
  }

  private systemPrompt(strict: boolean): string {
    return [
      'You write for JESS MOVE, a movement and food-intelligence platform for ages 10 to 100.',
      '',
      'Voice: plain British English. Specific over enthusiastic. You may say what the product',
      'does not do, and what a decision cost. Never exclamation marks, never second-person',
      'hype, never a call to action in the body.',
      '',
      'Absolutely forbidden, at any age, for any search reason — these terms end the draft:',
      BANNED_LEXICON.join(', '),
      strict
        ? 'This article may be read by a minor or in a later-life mode: also avoid body, shape, size, compete, beat, rank.'
        : '',
      '',
      'Structure: no level-one heading (the page supplies it). Use ## for sections and ###',
      `for sub-points. At least ${SEO_RULES.headingsMin} sections.`,
      `Length: ${SEO_RULES.bodyWordsMin}–${SEO_RULES.bodyWordsMax} words.`,
      `Title: ${SEO_RULES.titleMin}–${SEO_RULES.titleMax} characters, containing the primary phrase.`,
      `Description: ${SEO_RULES.descriptionMin}–${SEO_RULES.descriptionMax} characters.`,
      'Use the primary phrase naturally — under 2.5% of the words. Repetition is penalised.',
      '',
      'Return JSON only. `body` is Markdown. `internalLinks` are site-relative paths.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private userPrompt(req: DraftRequest, cluster: TopicCluster | null): string {
    const lines = [
      `Topic: ${req.topic}`,
      `Category: ${req.category}`,
      `Primary search phrase: ${req.keyword}`,
    ];
    if (cluster) {
      lines.push(
        '',
        `This article belongs to the "${cluster.pillar}" cluster (${cluster.intent} intent).`,
        `Link up to the pillar at ${cluster.pillarPath}, and across to at least one sibling subject:`,
        ...cluster.supporting.map((s) => `  - ${s}`),
      );
    }

    /*
     * The whole registry, given rather than left to memory.
     *
     * Asked for internal links without this, a model produces
     * `/blog/movement-guide` and `/features/foodlens` — paths that look
     * exactly like ours and do not exist. Every one is a 404 for a reader
     * and wasted crawl for everyone else. Handing over the real list turns
     * an invention problem into a selection problem, and the audit rejects
     * anything that still is not on it.
     */
    lines.push(
      '',
      'These are the only pages on this site. Link to at least ' +
        `${SEO_RULES.internalLinksMin} of them and never to a path that is not in this list:`,
      ...LINK_TARGETS.filter((t) => !t.noIndex).map((t) => `  ${t.path} — ${t.summary}`),
      ...this.knownSlugs().map((slug) => `  /blog/${slug} — an existing article`),
      '',
      'Put the links inside sentences where the subject already comes up, not in a list at the end.',
    );
    return lines.join('\n');
  }

  /** The article slugs that exist, so a sibling link is not called dead. */
  private knownSlugs(): readonly string[] {
    return SEED_POSTS.map((p) => p.slug);
  }

  /**
   * Drops anything the site does not have.
   *
   * Belt and braces with the audit: the audit reports a dead link as a
   * blocker so a person sees it, and this stops the obviously-invented ones
   * reaching the audit at all — which means the repair pass spends its one
   * attempt on prose rather than on re-listing URLs.
   */
  private realLinksOnly(links: readonly string[]): string[] {
    const slugs = this.knownSlugs();
    const kept: string[] = [];
    for (const link of links) {
      const path = normalisePath(link);
      if (!kept.includes(path) && isKnownPath(path, slugs)) kept.push(path);
    }
    return kept;
  }

  /** Pull the first JSON object out of a response that may be fenced or prefaced. */
  private parse(raw: string): Record<string, unknown> | null {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced?.[1] ?? raw;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private toDraft(
    parsed: Record<string, unknown>,
    req: DraftRequest,
  ): PostDraft {
    const title = String(parsed.title ?? req.topic).trim();
    const slug = slugify(title);
    const secondary = Array.isArray(parsed.secondaryKeywords)
      ? parsed.secondaryKeywords.map(String)
      : [];

    /*
     * The body gains its contextual links here rather than being asked for
     * them, because a model asked to place links in prose either forgets or
     * overdoes it, and neither is worth a repair pass. The linker is
     * deterministic, bounded, and knows where the real pages are: one link
     * per destination, first mention only, never inside a heading or an
     * existing link. What the model is left to do is write.
     */
    const body = withAutoLinks(String(parsed.body ?? ''), { selfPath: `/blog/${slug}` });

    // Declared links, plus whatever the prose picked up, minus anything
    // that does not exist. The article's real outbound set.
    const declared = Array.isArray(parsed.internalLinks) ? parsed.internalLinks.map(String) : [];
    const inProse = [...body.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1] ?? '');
    const links = this.realLinksOnly([...declared, ...inProse]);

    return {
      title,
      slug,
      description: String(parsed.description ?? '').trim(),
      category: req.category,
      keyword: String(parsed.keyword ?? req.keyword).trim(),
      secondaryKeywords: secondary,
      body,
      clusterKey: req.clusterKey,
      internalLinks: links,
    };
  }

  /**
   * The brief. Not a stub — this is what the endpoint returns when no
   * provider is configured, and it is a genuinely usable commission for a
   * human writer.
   */
  private brief(req: DraftRequest, cluster: TopicCluster | null): PostDraft {
    const sections = cluster
      ? cluster.supporting
      : ['what the problem actually is', 'what we measured', 'what we built', 'what it cost'];

    const body = [
      `_Brief only — no model provider is configured, so this outline was assembled from the`,
      `topic cluster rather than written._`,
      '',
      ...sections.flatMap((s) => [
        `## ${s.charAt(0).toUpperCase()}${s.slice(1)}`,
        '',
        `Cover ${s}. Target roughly ${Math.round(SEO_RULES.bodyWordsMin / sections.length)} words.`,
        'State the specific number, decision or constraint. Avoid generalities.',
        '',
      ]),
      '## What this means in practice',
      '',
      'Close on the concrete consequence for the reader, not a call to action.',
    ].join('\n');

    return {
      title: req.topic,
      slug: slugify(req.topic),
      description: `${req.topic} — an outline covering ${sections.length} sections, ready to write.`,
      category: req.category,
      keyword: req.keyword,
      secondaryKeywords: cluster ? [...cluster.supporting].slice(0, 3) : [],
      body,
      clusterKey: req.clusterKey,
      internalLinks: this.realLinksOnly(
        cluster
          ? [cluster.pillarPath, '/how-it-works', '/blog', '/about']
          : ['/how-it-works', '/blog', '/about', '/micro-movement'],
      ),
    };
  }

  async draft(req: DraftRequest): Promise<DraftResult> {
    const cluster = this.clusterFor(req.clusterKey);
    const strict = req.strict ?? false;
    const definition = AGENT_REGISTRY[SeoAgentService.CODE];

    let parsed: Record<string, unknown> | null = null;
    let provider: string | null = null;

    try {
      const response = await this.ai.complete({
        agent: SeoAgentService.CODE,
        modelClass: definition.modelClass,
        maxTokens: 4000,
        // Editorial has no member behind it, which used to mean it had no
        // bill either. It draws on the platform's own daily budget now, so
        // an agent looping on a bad prompt runs out of allowance rather
        // than out of somebody's card.
        billTo: PLATFORM_PAYERS.editorial,
        jsonSchema: OUTPUT_SHAPE as unknown as Record<string, unknown>,
        messages: [
          { role: 'system', content: this.systemPrompt(strict) },
          { role: 'user', content: this.userPrompt(req, cluster) },
        ],
      });
      provider = response.provider;
      parsed = this.parse(response.text);
    } catch (error) {
      // No provider, a timeout, or every provider refusing. None of those
      // should turn an editorial request into a 500.
      //
      // An exhausted editorial budget is different: falling back to a
      // brief would report "no provider configured" for what is really
      // "today's budget is spent", and autopilot would go on commissioning
      // against a wall it cannot see.
      if (error instanceof AllowanceExhaustedError) throw error;
      this.logger.warn(
        `SEO agent falling back to a brief: ${(error as Error).message}`,
      );
    }

    if (!parsed) {
      const draft = this.brief(req, cluster);
      return {
        draft,
        audit: seoAudit(draft, strict),
        source: 'brief',
        provider: null,
        repairAttempted: false,
        acuCeiling: definition.acuCeiling,
      };
    }

    let draft = this.toDraft(parsed, req);
    let audit = seoAudit(draft, strict);
    let repairAttempted = false;

    // One repair pass. Not a loop — an agent that cannot fix its own
    // blockers on the second attempt is not going to on the fifth, and
    // each attempt spends against the ACU ceiling.
    if (!audit.passes) {
      repairAttempted = true;
      const problems = audit.findings
        .filter((f) => f.severity !== 'note')
        .map((f) => `- ${f.rule}: ${f.detail}. ${f.fix}`)
        .join('\n');

      try {
        const retry = await this.ai.complete({
          agent: SeoAgentService.CODE,
          modelClass: definition.modelClass,
          maxTokens: 4000,
          billTo: PLATFORM_PAYERS.editorial,
          jsonSchema: OUTPUT_SHAPE as unknown as Record<string, unknown>,
          messages: [
            { role: 'system', content: this.systemPrompt(strict) },
            { role: 'user', content: this.userPrompt(req, cluster) },
            { role: 'assistant', content: JSON.stringify(parsed) },
            {
              role: 'user',
              content:
                `The draft failed the editorial audit at ${audit.score}/100 ` +
                `(${countWords(draft.body)} words). Fix every item and return the ` +
                `full corrected JSON:\n${problems}`,
            },
          ],
        });
        const repaired = this.parse(retry.text);
        if (repaired) {
          const candidate = this.toDraft(repaired, req);
          const candidateAudit = seoAudit(candidate, strict);
          // Keep the repair only if it is actually better.
          if (candidateAudit.score > audit.score) {
            draft = candidate;
            audit = candidateAudit;
            provider = retry.provider;
          }
        }
      } catch (error) {
        this.logger.warn(`SEO repair pass failed: ${(error as Error).message}`);
      }
    }

    return {
      draft,
      audit,
      source: 'model',
      provider,
      repairAttempted,
      acuCeiling: definition.acuCeiling,
    };
  }

  /**
   * Which clusters are thin. The agent's own commissioning input — a
   * cluster whose supporting subjects have no published article is where
   * the next post should come from.
   */
  gaps(publishedClusterKeys: readonly (string | null)[]): readonly {
    cluster: string;
    pillar: string;
    published: number;
    supporting: number;
    nextSubject: string | null;
  }[] {
    return TOPIC_CLUSTERS.map((c) => {
      const published = publishedClusterKeys.filter((k) => k === c.key).length;
      return {
        cluster: c.key,
        pillar: c.pillar,
        published,
        supporting: c.supporting.length,
        nextSubject: c.supporting[published] ?? null,
      };
    }).sort((a, b) => a.published / a.supporting - b.published / b.supporting);
  }
}
