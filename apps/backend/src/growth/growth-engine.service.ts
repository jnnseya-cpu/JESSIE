import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  BANNED_LEXICON,
  GROWTH_TOOLS,
  PARTNER_DISCLOSURE,
  PLATFORMS,
  audienceReport,
  campaignReports,
  checkCopy,
  performanceReport,
  postingTimeReport,
  ratesFor,
  type GrowthResult,
  type GrowthToolId,
  type PlatformId,
} from '@jessmove/shared';
import { AiGatewayService, AllowanceExhaustedError, InstructionRefusedError } from '../ai/ai-gateway.service';
import { GrowthResultsService } from './growth-results.service';

/**
 * The engine behind the ten tools.
 *
 * Six of them write and four of them measure, and they are built
 * differently on purpose.
 *
 * The writing tools call a model, then put the result through a copy check
 * that the partner cannot switch off — the banned lexicon, health-claim
 * patterns, and figures a model would invent about a business it has never
 * seen. Copy that fails is not handed over with a warning attached: a
 * partner in a hurry copies the text and ignores the warning, and then the
 * claim is public and it is our name on it.
 *
 * The measuring tools never call a model at all. A language model asked
 * "when should I post?" will always produce an hour, and it will be an
 * hour from its training data rather than from this partner's results. A
 * partner who reschedules a month of work around that number has been
 * misled by something that looked like analysis. So those four are
 * arithmetic over recorded results, and they refuse when the results are
 * too thin to support an answer.
 */

export interface WriteRequest {
  readonly toolId: GrowthToolId;
  readonly partnerId: string;
  readonly platform?: PlatformId;
  /** What the partner wants said. Their words, not a template. */
  readonly brief: string;
  readonly audience?: string;
  /** Copy that may reach a minor or a later-life reader. */
  readonly strict?: boolean;
}

export interface WriteResult {
  readonly toolId: GrowthToolId;
  readonly platform: PlatformId | null;
  readonly output: Record<string, unknown> | null;
  readonly passed: boolean;
  readonly problems: readonly string[];
  readonly says: string;
  readonly disclosure: string;
  readonly provider: string | null;
  readonly acu: number;
  readonly outputId: string;
}

/** The shape each writing tool must return, so the UI can render it. */
const SHAPES: Record<string, Record<string, unknown>> = {
  social_post: {
    type: 'object',
    required: ['body', 'hook', 'hashtags'],
    properties: {
      hook: { type: 'string' },
      body: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      altText: { type: 'string' },
    },
  },
  travel_advert: {
    type: 'object',
    required: ['headline', 'body', 'callToAction'],
    properties: {
      headline: { type: 'string' },
      body: { type: 'string' },
      callToAction: { type: 'string' },
      settings: { type: 'array', items: { type: 'string' } },
    },
  },
  email_campaign: {
    type: 'object',
    required: ['subject', 'preview', 'body'],
    properties: {
      subject: { type: 'string' },
      preview: { type: 'string' },
      body: { type: 'string' },
      callToAction: { type: 'string' },
    },
  },
  landing_page: {
    type: 'object',
    required: ['headline', 'subhead', 'sections', 'callToAction'],
    properties: {
      headline: { type: 'string' },
      subhead: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['heading', 'body'],
          properties: { heading: { type: 'string' }, body: { type: 'string' } },
        },
      },
      objections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['objection', 'answer'],
          properties: { objection: { type: 'string' }, answer: { type: 'string' } },
        },
      },
      callToAction: { type: 'string' },
    },
  },
  hashtags: {
    type: 'object',
    required: ['hashtags'],
    properties: {
      hashtags: { type: 'array', items: { type: 'string' } },
      avoid: { type: 'array', items: { type: 'string' } },
    },
  },
  video_script: {
    type: 'object',
    required: ['hook', 'shots'],
    properties: {
      hook: { type: 'string' },
      shots: {
        type: 'array',
        items: {
          type: 'object',
          required: ['seconds', 'visual', 'spoken'],
          properties: {
            seconds: { type: 'string' },
            visual: { type: 'string' },
            spoken: { type: 'string' },
            onScreen: { type: 'string' },
          },
        },
      },
      caption: { type: 'string' },
    },
  },
};

@Injectable()
export class GrowthEngineService {
  private readonly logger = new Logger(GrowthEngineService.name);
  private static readonly CODE = 'GROW' as const;

  constructor(
    private readonly ai: AiGatewayService,
    private readonly results: GrowthResultsService,
  ) {}

  private systemPrompt(req: WriteRequest): string {
    const tool = GROWTH_TOOLS[req.toolId];
    const platform = req.platform ? PLATFORMS[req.platform] : null;

    return [
      'You write marketing copy for a partner promoting JESS MOVE, a movement and food-intelligence',
      'platform for ages 10 to 100. The partner publishes it under their own name.',
      '',
      'Voice: plain British English. Specific over enthusiastic. Say what the thing does rather',
      'than how it will make somebody feel. No exclamation marks.',
      '',
      'These words end the draft, at any age, for any campaign:',
      BANNED_LEXICON.join(', '),
      req.strict ? 'This may reach a minor or a later-life reader: also avoid body, shape, size.' : '',
      '',
      'Three things you must never do, because the consequences land on the platform rather than',
      'on the partner who published it:',
      '  1. No health claim. Never cure, treat, heal, reverse, prevent, or guarantee an outcome.',
      '     You may say what the platform does. You may not say what it will do to a body.',
      '  2. No invented figure. No member counts, no percentages, no "trusted by 10,000". You',
      '     cannot see this partner\'s business and anything you state about it is fabricated.',
      '  3. No before-and-after framing and no appearance framing, in any form.',
      '',
      platform
        ? [
            `Network: ${platform.name}.`,
            `Hard limit: ${platform.maxChars} characters.`,
            `Register: ${platform.register}`,
            `Hashtags: between ${platform.hashtags.min} and ${platform.hashtags.max}.`,
            platform.linksInBody ? 'Links work in the body.' : 'Links are not clickable in the body — do not put one there.',
            `Caution: ${platform.caution}`,
          ].join('\n')
        : '',
      '',
      `Task: ${tool.what}`,
      'Return JSON only, matching the schema you were given.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private userPrompt(req: WriteRequest): string {
    const lines = [`What the partner wants said: ${req.brief}`];
    if (req.audience) lines.push('', `Who it is for: ${req.audience}`);
    if (req.platform) lines.push('', `Written for ${PLATFORMS[req.platform].name}.`);
    return lines.join('\n');
  }

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

  /** Every string anywhere in the output, so a claim cannot hide in an array. */
  private allText(value: unknown, into: string[] = []): string[] {
    if (typeof value === 'string') into.push(value);
    else if (Array.isArray(value)) for (const item of value) this.allText(item, into);
    else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) this.allText(item, into);
    }
    return into;
  }

  async write(req: WriteRequest): Promise<WriteResult> {
    const tool = GROWTH_TOOLS[req.toolId];
    if (tool.kind !== 'writes') {
      throw new BadRequestException(
        `${tool.name} measures rather than writes — it reads your own results and is not a model call`,
      );
    }
    if (!req.brief.trim()) {
      throw new BadRequestException('say what you want the copy to be about');
    }

    let parsed: Record<string, unknown> | null = null;
    let provider: string | null = null;

    try {
      const response = await this.ai.complete({
        agent: GrowthEngineService.CODE,
        modelClass: 'mid_tier_llm',
        maxTokens: 2500,
        // The partner pays for their own marketing out of their own
        // allowance, which is also what stops one partner's campaign
        // spending the platform's budget.
        billTo: req.partnerId,
        jsonSchema: SHAPES[req.toolId],
        messages: [
          { role: 'system', content: this.systemPrompt(req) },
          /*
           * Carries the partner's own brief, audience note and product
           * description. A partner is a customer, not an operator, and
           * their copy does not get to change what the engine will write.
           */
          { role: 'user', content: this.userPrompt(req), untrusted: true },
        ],
      });
      provider = response.provider;
      parsed = this.parse(response.text);
    } catch (error) {
      // A partner out of allowance is told so, with a top-up offered —
      // not handed "nothing was written" and left guessing why.
      if (error instanceof AllowanceExhaustedError) throw error;
      if (error instanceof InstructionRefusedError) throw error;
      this.logger.warn(`growth engine: ${(error as Error).message}`);
      const outputId = await this.results.saveOutput(req.partnerId, {
        toolId: req.toolId,
        platform: req.platform ?? null,
        brief: req.brief,
        output: null,
        passed: false,
        problems: [(error as Error).message],
        acuSpent: 0,
      });
      return {
        toolId: req.toolId,
        platform: req.platform ?? null,
        output: null,
        passed: false,
        problems: [(error as Error).message],
        says: 'Nothing was written. Your allowance was not charged for a draft you did not get.',
        disclosure: PARTNER_DISCLOSURE,
        provider: null,
        acu: 0,
        outputId,
      };
    }

    if (!parsed) {
      const outputId = await this.results.saveOutput(req.partnerId, {
        toolId: req.toolId,
        platform: req.platform ?? null,
        brief: req.brief,
        output: null,
        passed: false,
        problems: ['the model did not return usable copy'],
        acuSpent: tool.acu,
      });
      return {
        toolId: req.toolId,
        platform: req.platform ?? null,
        output: null,
        passed: false,
        problems: ['the model did not return usable copy'],
        says: 'That came back unreadable. Try again, or say the brief differently.',
        disclosure: PARTNER_DISCLOSURE,
        provider,
        acu: tool.acu,
        outputId,
      };
    }

    /*
     * The check, over every string in the output rather than over one
     * field. A health claim in the fourth bullet of a landing page is the
     * same liability as one in the headline, and an array is exactly where
     * a spot-check would miss it.
     */
    const problems: string[] = [];
    for (const text of this.allText(parsed)) {
      const check = checkCopy(text, req.strict ?? false);
      for (const problem of check.problems) {
        if (!problems.includes(problem)) problems.push(problem);
      }
    }

    // The network's hard limit, checked rather than hoped for.
    const platform = req.platform ? PLATFORMS[req.platform] : null;
    const body = typeof parsed.body === 'string' ? parsed.body : '';
    if (platform && body.length > platform.maxChars) {
      problems.push(
        `${body.length} characters against ${platform.name}'s ${platform.maxChars} limit — it would be cut mid-sentence`,
      );
    }

    const passed = problems.length === 0;
    const outputId = await this.results.saveOutput(req.partnerId, {
      toolId: req.toolId,
      platform: req.platform ?? null,
      brief: req.brief,
      output: passed ? parsed : null,
      passed,
      problems,
      acuSpent: tool.acu,
    });

    return {
      toolId: req.toolId,
      platform: req.platform ?? null,
      // Refused copy is not handed over with a warning on it. A partner in
      // a hurry copies the text and skips the warning, and then the claim
      // is public with our name attached.
      output: passed ? parsed : null,
      passed,
      problems,
      says: passed
        ? 'Yours to edit and publish.'
        : `Not handed over: ${problems.length} problem${problems.length === 1 ? '' : 's'} that would land on the platform rather than on you. Change the brief and run it again.`,
      disclosure: PARTNER_DISCLOSURE,
      provider,
      acu: tool.acu,
      outputId,
    };
  }

  /**
   * The four measuring tools. No model, no allowance, and a refusal rather
   * than a guess when the history is too thin.
   */
  async measure(partnerId: string, toolId: GrowthToolId): Promise<Record<string, unknown>> {
    const tool = GROWTH_TOOLS[toolId];
    if (tool.kind !== 'measures') {
      throw new BadRequestException(`${tool.name} writes copy — it is not a report`);
    }

    const rows = await this.results.forPartner(partnerId);

    switch (toolId) {
      case 'performance':
        return { tool: tool.name, ...performanceReport(rows), limits: tool.limits };
      case 'audience':
        return { tool: tool.name, ...audienceReport(rows), limits: tool.limits };
      case 'posting_time':
        return { tool: tool.name, ...postingTimeReport(rows), limits: tool.limits };
      case 'analytics':
      default:
        return {
          tool: tool.name,
          answered: rows.length > 0,
          totals: this.totals(rows),
          campaigns: campaignReports(rows),
          says:
            rows.length === 0
              ? 'Nothing recorded yet. Add what a post reached and how many clicked, and this fills itself in.'
              : `${rows.length} result${rows.length === 1 ? '' : 's'} across ${campaignReports(rows).length} campaigns. Every figure here is one you or the platform counted.`,
          limits: tool.limits,
        };
    }
  }

  private totals(rows: readonly GrowthResult[]) {
    return {
      posts: rows.length,
      reach: rows.reduce((n, r) => n + r.reach, 0),
      clicks: rows.reduce((n, r) => n + r.clicks, 0),
      signups: rows.reduce((n, r) => n + r.signups, 0),
      paid: rows.reduce((n, r) => n + r.paid, 0),
      rates: ratesFor(rows),
    };
  }
}
