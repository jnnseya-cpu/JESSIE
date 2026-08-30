/**
 * The AI Growth Engine.
 *
 * Ten tools a partner uses to reach people, in one place. What follows is
 * the contract they all work to, and most of it is about what they will not
 * do — because a partner promoting a health platform can damage it in ways
 * an ordinary marketing tool cannot.
 *
 * THE RULES, none of which a partner can switch off.
 *
 *  1. **The lexicon applies to a partner exactly as it applies to us.** No
 *     "burn", no "calories", no "slim down", no before-and-after framing.
 *     A partner post is the first thing most people ever read about this
 *     platform, and a platform whose own copy refuses that language while
 *     its partners trade on it has not refused it at all.
 *  2. **Nothing invents a number.** Not a follower count, not a conversion
 *     rate, not "our members lose 4kg in a month". Every figure in an
 *     output comes from that partner's own recorded results or it is not
 *     in the output. Where there is no data, the tool says there is no
 *     data — see `NOT_ENOUGH_DATA`.
 *  3. **No health claims, ever.** A partner may say what the platform does.
 *     They may not say what it will do to a body. That line is the whole
 *     regulatory difference between marketing and a medical claim.
 *  4. **AI involvement is disclosed and the partner is the publisher.**
 *     Nothing here posts anything anywhere. Every tool returns text the
 *     partner reads, edits and publishes themselves, under their own name
 *     and their own advertising-standards obligations.
 *  5. **Platform-shaped, not one blob reposted five times.** A 280-character
 *     network and a professional network want different things; the same
 *     paragraph on both performs worse on both.
 *
 * The split that matters most is between the six tools that *write* and
 * the four that *measure*. The writing ones use a model. The measuring
 * ones do not, and must not: "post at 7pm on Tuesdays" produced by a
 * language model that has never seen this partner's results is a guess
 * wearing the costume of a recommendation, and a partner who follows it
 * and does worse has been actively misled. Those four are arithmetic over
 * real records, and they refuse when the records are too thin.
 */

import { BANNED_LEXICON } from './brand';

/* ------------------------------------------------------------------ *
 * Where a post is going
 * ------------------------------------------------------------------ */

export type PlatformId =
  | 'instagram'
  | 'tiktok'
  | 'x'
  | 'linkedin'
  | 'facebook'
  | 'youtube'
  | 'threads'
  | 'pinterest';

export interface PlatformSpec {
  readonly id: PlatformId;
  readonly name: string;
  /** Hard limit on the body, in characters. */
  readonly maxChars: number;
  /** What actually works there, rather than what a listicle says works. */
  readonly register: string;
  /** Hashtags that help. Past this they stop helping and start hurting. */
  readonly hashtags: { readonly min: number; readonly max: number };
  readonly linksInBody: boolean;
  /** Anything the network itself forbids or penalises. */
  readonly caution: string;
}

export const PLATFORMS: Readonly<Record<PlatformId, PlatformSpec>> = {
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    maxChars: 2200,
    register: 'Visual first. The caption explains the picture rather than replacing it. First line is the hook — the rest is truncated behind "more".',
    hashtags: { min: 3, max: 10 },
    linksInBody: false,
    caution: 'Links in a caption are not clickable. Health and body content is the most heavily moderated category on the network.',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    maxChars: 2200,
    register: 'Spoken, not written. The caption is a label for the video; the video carries everything.',
    hashtags: { min: 3, max: 6 },
    linksInBody: false,
    caution: 'Weight, body and diet content is restricted for under-18 accounts and can suppress a whole account, not just a post.',
  },
  x: {
    id: 'x',
    name: 'X',
    maxChars: 280,
    register: 'One idea, stated. No preamble, no thread unless the idea genuinely needs one.',
    hashtags: { min: 0, max: 2 },
    linksInBody: true,
    caution: 'More than two hashtags reads as spam here and always has.',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    maxChars: 3000,
    register: 'A specific thing that happened, and what it cost. Professional does not mean bloodless — it means concrete.',
    hashtags: { min: 0, max: 3 },
    linksInBody: true,
    caution: 'An external link in the first version of a post reduces reach. Put it in a comment.',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    maxChars: 2000,
    register: 'Conversational and local. Groups outperform pages by a wide margin.',
    hashtags: { min: 0, max: 2 },
    linksInBody: true,
    caution: 'Health claims are enforced strictly and an advert can be rejected for a phrase in an image.',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    maxChars: 5000,
    register: 'The description is a search surface. The first two lines are what shows.',
    hashtags: { min: 0, max: 3 },
    linksInBody: true,
    caution: 'Content aimed at children changes what the platform allows and what data it will collect.',
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    maxChars: 500,
    register: 'Conversational, quick, replies matter more than the post.',
    hashtags: { min: 0, max: 1 },
    linksInBody: true,
    caution: 'One topic tag only. More is not supported.',
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    maxChars: 500,
    register: 'Searched, not scrolled. Describe what the thing is, plainly, for somebody looking for it.',
    hashtags: { min: 0, max: 3 },
    linksInBody: true,
    caution: 'Weight-loss content is prohibited outright on this network. This is not a style preference.',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];


/* ------------------------------------------------------------------ *
 * The ten tools
 * ------------------------------------------------------------------ */

export type GrowthToolId =
  | 'social_post'
  | 'travel_advert'
  | 'email_campaign'
  | 'landing_page'
  | 'hashtags'
  | 'video_script'
  | 'performance'
  | 'audience'
  | 'analytics'
  | 'posting_time';

/**
 * `writes` uses a model and costs allowance. `measures` is arithmetic over
 * the partner's own records, costs nothing, and refuses rather than
 * guessing when the records are thin.
 */
export type ToolKind = 'writes' | 'measures';

export interface GrowthTool {
  readonly id: GrowthToolId;
  readonly name: string;
  readonly kind: ToolKind;
  readonly what: string;
  /** Said plainly, because a tool that overstates itself wastes a partner's week. */
  readonly limits: string;
  /** Allowance drawn per use. Zero for everything that only measures. */
  readonly acu: number;
  /** Records needed before it will answer at all. */
  readonly needsResults: number;
}

export const GROWTH_TOOLS: Readonly<Record<GrowthToolId, GrowthTool>> = {
  social_post: {
    id: 'social_post',
    name: 'Social post generator',
    kind: 'writes',
    what: 'A post shaped for one network — its length, its register, its hashtag conventions — rather than one paragraph pasted across five.',
    limits: 'It does not know your audience. It knows the network and it knows this platform; the judgement about the people reading is yours.',
    acu: 4,
    needsResults: 0,
  },
  travel_advert: {
    id: 'travel_advert',
    name: 'Travel advert creator',
    kind: 'writes',
    what: 'Copy for movement on the move — airports, long flights, coach journeys, hotel rooms — which is where this platform is easiest to explain and hardest to remember.',
    limits: 'Advertising standards are yours to meet. Nothing here checks the rules of the country you are advertising in.',
    acu: 5,
    needsResults: 0,
  },
  email_campaign: {
    id: 'email_campaign',
    name: 'Email campaign generator',
    kind: 'writes',
    what: 'A subject line, a preview line and a body, written to be read on a phone in eight seconds.',
    limits: 'You need consent to email the people you are emailing. This writes the message; it does not make the list lawful.',
    acu: 6,
    needsResults: 0,
  },
  landing_page: {
    id: 'landing_page',
    name: 'Landing page builder',
    kind: 'writes',
    what: 'A full page — headline, subhead, three sections, the objections answered, one honest call to action — as structured content you can paste or publish.',
    limits: 'One page of copy, not a website. It cannot see how your page performs.',
    acu: 8,
    needsResults: 0,
  },
  hashtags: {
    id: 'hashtags',
    name: 'Hashtag generator',
    kind: 'writes',
    what: 'Tags that fit the network and the post, in the number that network actually rewards.',
    limits: 'Nobody outside these networks has live tag volumes, and any tool claiming otherwise is guessing. These are relevance-picked, not volume-ranked.',
    acu: 2,
    needsResults: 0,
  },
  video_script: {
    id: 'video_script',
    name: 'Video script generator',
    kind: 'writes',
    what: 'A shot-by-shot script with timings, spoken lines and on-screen text, for a video somebody films on a phone.',
    limits: 'A script is not a video. Everything hard about the video is still ahead of you.',
    acu: 7,
    needsResults: 0,
  },
  performance: {
    id: 'performance',
    name: 'Performance recommendations',
    kind: 'measures',
    what: 'What your own results say to do more of and less of, from what actually happened rather than from what usually happens.',
    limits: 'It reads only what you have recorded here. Anything you ran elsewhere is invisible to it.',
    acu: 0,
    needsResults: 5,
  },
  audience: {
    id: 'audience',
    name: 'Audience optimisation',
    kind: 'measures',
    what: 'Which networks and which subjects reach people for you, ranked by what they produced.',
    limits: 'Correlation across a small number of posts. Five results is enough to notice something and not enough to be sure of it.',
    acu: 0,
    needsResults: 5,
  },
  analytics: {
    id: 'analytics',
    name: 'Campaign analytics',
    kind: 'measures',
    what: 'Reach, clicks, signups and paid conversions per campaign, with the rates worked out and the arithmetic shown.',
    limits: 'These are the numbers you and the platform recorded. Nothing is modelled, estimated or filled in.',
    acu: 0,
    needsResults: 1,
  },
  posting_time: {
    id: 'posting_time',
    name: 'Best posting time',
    kind: 'measures',
    what: 'When your own posts have done best, by day and by hour, from your own history.',
    limits: 'Your history, not a study of somebody else’s. Until there are enough posts it says so rather than repeating the industry advice everybody already has.',
    acu: 0,
    needsResults: 8,
  },
};

export const GROWTH_TOOL_IDS = Object.keys(GROWTH_TOOLS) as GrowthToolId[];


/* ------------------------------------------------------------------ *
 * The refusal that keeps the measuring tools honest
 * ------------------------------------------------------------------ */

export interface NotEnoughData {
  readonly answered: false;
  readonly have: number;
  readonly need: number;
  readonly says: string;
}

/**
 * What a measuring tool returns instead of a guess.
 *
 * The temptation is to fill the screen — pick a plausible hour, cite a
 * study, and let the partner feel served. A partner who reschedules a
 * month of posts around a number invented from nothing has been actively
 * harmed by that kindness, and when it does not work they will conclude
 * the fault is theirs.
 */
export function notEnoughData(tool: GrowthTool, have: number): NotEnoughData {
  return {
    answered: false,
    have,
    need: tool.needsResults,
    says:
      `${have} of the ${tool.needsResults} results this needs. It will not guess the rest — ` +
      'a recommendation made up from nothing is worse than no recommendation, because you would act on it.',
  };
}

/* ------------------------------------------------------------------ *
 * What a partner records, and what is computed from it
 * ------------------------------------------------------------------ */

/**
 * One published thing and what it did.
 *
 * Deliberately small. Reach, clicks, signups and paid conversions are the
 * chain a partner is actually paid on, and every one of them is a number
 * the partner or the platform observed. There is no field for a figure
 * somebody estimated.
 */
export interface GrowthResult {
  readonly id: string;
  readonly partnerId: string;
  readonly toolId: GrowthToolId | null;
  readonly platform: PlatformId | null;
  readonly campaign: string | null;
  readonly subject: string | null;
  /** ISO instant the thing was published. */
  readonly postedAt: string;
  readonly reach: number;
  readonly clicks: number;
  readonly signups: number;
  readonly paid: number;
}

export interface RateSet {
  readonly clickRate: number;
  readonly signupRate: number;
  readonly paidRate: number;
}

export function ratesFor(rows: readonly GrowthResult[]): RateSet {
  const sum = (pick: (r: GrowthResult) => number): number => rows.reduce((n, r) => n + pick(r), 0);
  const reach = sum((r) => r.reach);
  const clicks = sum((r) => r.clicks);
  const signups = sum((r) => r.signups);
  const paid = sum((r) => r.paid);
  const rate = (top: number, bottom: number): number =>
    bottom === 0 ? 0 : Number((top / bottom).toFixed(4));
  return {
    clickRate: rate(clicks, reach),
    signupRate: rate(signups, clicks),
    paidRate: rate(paid, signups),
  };
}

/* --- campaign analytics --------------------------------------------- */

export interface CampaignReport {
  readonly campaign: string;
  readonly posts: number;
  readonly reach: number;
  readonly clicks: number;
  readonly signups: number;
  readonly paid: number;
  readonly rates: RateSet;
  /** The step losing the most people, named. */
  readonly weakestStep: 'reach to click' | 'click to signup' | 'signup to paid' | null;
}

export function campaignReports(rows: readonly GrowthResult[]): readonly CampaignReport[] {
  const byCampaign = new Map<string, GrowthResult[]>();
  for (const row of rows) {
    const key = row.campaign ?? 'unassigned';
    byCampaign.set(key, [...(byCampaign.get(key) ?? []), row]);
  }

  return [...byCampaign.entries()]
    .map(([campaign, group]) => {
      const rates = ratesFor(group);
      const steps: { step: CampaignReport['weakestStep']; rate: number }[] = [
        { step: 'reach to click', rate: rates.clickRate },
        { step: 'click to signup', rate: rates.signupRate },
        { step: 'signup to paid', rate: rates.paidRate },
      ];
      // The weakest step is only meaningful once somebody reached the top
      // of the funnel at all; with no reach every rate is zero and naming
      // one of them as "the problem" is noise.
      const reach = group.reduce((n, r) => n + r.reach, 0);
      const weakest = reach === 0 ? null : steps.sort((a, b) => a.rate - b.rate)[0]!.step;

      return {
        campaign,
        posts: group.length,
        reach,
        clicks: group.reduce((n, r) => n + r.clicks, 0),
        signups: group.reduce((n, r) => n + r.signups, 0),
        paid: group.reduce((n, r) => n + r.paid, 0),
        rates,
        weakestStep: weakest,
      };
    })
    .sort((a, b) => b.paid - a.paid || b.signups - a.signups);
}

/* --- audience optimisation ------------------------------------------ */

export interface AudienceSlice {
  readonly key: string;
  readonly posts: number;
  readonly reach: number;
  readonly signups: number;
  readonly signupsPerThousandReached: number;
  /** Below the point where the ranking means anything. */
  readonly thin: boolean;
}

export interface AudienceReport {
  readonly answered: true;
  readonly byPlatform: readonly AudienceSlice[];
  readonly bySubject: readonly AudienceSlice[];
  readonly says: string;
}

/** Two posts on a network is not evidence about that network. */
export const THIN_SLICE_POSTS = 3;

function sliceBy(
  rows: readonly GrowthResult[],
  key: (r: GrowthResult) => string | null,
): readonly AudienceSlice[] {
  const groups = new Map<string, GrowthResult[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([k, group]) => {
      const reach = group.reduce((n, r) => n + r.reach, 0);
      const signups = group.reduce((n, r) => n + r.signups, 0);
      return {
        key: k,
        posts: group.length,
        reach,
        signups,
        signupsPerThousandReached: reach === 0 ? 0 : Number(((signups / reach) * 1000).toFixed(2)),
        thin: group.length < THIN_SLICE_POSTS,
      };
    })
    .sort((a, b) => b.signupsPerThousandReached - a.signupsPerThousandReached);
}

export function audienceReport(rows: readonly GrowthResult[]): AudienceReport | NotEnoughData {
  const tool = GROWTH_TOOLS.audience;
  if (rows.length < tool.needsResults) return notEnoughData(tool, rows.length);

  const byPlatform = sliceBy(rows, (r) => r.platform);
  const bySubject = sliceBy(rows, (r) => r.subject);
  const best = byPlatform.find((s) => !s.thin);

  return {
    answered: true,
    byPlatform,
    bySubject,
    says: best
      ? `${best.key} is doing most for you: ${best.signupsPerThousandReached} signups per thousand reached, across ${best.posts} posts. Anything marked thin has too few posts behind it to rank.`
      : 'No network has enough posts behind it yet to rank one above another. Keep going and this becomes a ranking rather than a list.',
  };
}

/* --- best posting time ---------------------------------------------- */

export interface TimeSlot {
  /** 0 is Sunday, matching Date.getUTCDay. */
  readonly day: number;
  readonly hour: number;
  readonly posts: number;
  readonly signupsPerThousandReached: number;
}

export interface PostingTimeReport {
  readonly answered: true;
  readonly best: readonly TimeSlot[];
  readonly worst: readonly TimeSlot[];
  readonly says: string;
  /** True when the sample is real enough to reschedule around. */
  readonly confident: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function dayName(day: number): string {
  return DAY_NAMES[day] ?? 'Unknown';
}

/**
 * When this partner's own posts did best.
 *
 * Not "9am on Tuesday because a blog said so". If the history says
 * Thursday evening, it says Thursday evening; if the history is too thin
 * to say anything, it says that, and `confident` stays false until there
 * is more than one post behind the winning slot.
 */
export function postingTimeReport(
  rows: readonly GrowthResult[],
): PostingTimeReport | NotEnoughData {
  const tool = GROWTH_TOOLS.posting_time;
  if (rows.length < tool.needsResults) return notEnoughData(tool, rows.length);

  const slots = new Map<string, { day: number; hour: number; rows: GrowthResult[] }>();
  for (const row of rows) {
    const at = new Date(row.postedAt);
    if (Number.isNaN(at.getTime())) continue;
    const day = at.getUTCDay();
    const hour = at.getUTCHours();
    const key = `${day}-${hour}`;
    const held = slots.get(key) ?? { day, hour, rows: [] };
    held.rows.push(row);
    slots.set(key, held);
  }

  const scored: TimeSlot[] = [...slots.values()]
    .map((slot) => {
      const reach = slot.rows.reduce((n, r) => n + r.reach, 0);
      const signups = slot.rows.reduce((n, r) => n + r.signups, 0);
      return {
        day: slot.day,
        hour: slot.hour,
        posts: slot.rows.length,
        signupsPerThousandReached: reach === 0 ? 0 : Number(((signups / reach) * 1000).toFixed(2)),
      };
    })
    .sort((a, b) => b.signupsPerThousandReached - a.signupsPerThousandReached);

  const best = scored.slice(0, 3);
  const top = best[0];
  const confident = Boolean(top && top.posts > 1);

  return {
    answered: true,
    best,
    worst: scored.slice(-2).reverse(),
    confident,
    says: !top
      ? 'Nothing in the history carries a usable time.'
      : confident
        ? `${dayName(top.day)} around ${String(top.hour).padStart(2, '0')}:00 UTC has done best for you — ${top.signupsPerThousandReached} signups per thousand reached across ${top.posts} posts.`
        : `${dayName(top.day)} around ${String(top.hour).padStart(2, '0')}:00 UTC leads, but on a single post. That is a coincidence until it happens twice.`,
  };
}

/* --- performance recommendations ------------------------------------ */

export interface Recommendation {
  readonly do: string;
  /** The figures it came from. A recommendation with no evidence is an opinion. */
  readonly because: string;
  readonly confidence: 'strong' | 'worth trying' | 'thin';
}

export interface PerformanceReport {
  readonly answered: true;
  readonly recommendations: readonly Recommendation[];
  readonly says: string;
}

export function performanceReport(
  rows: readonly GrowthResult[],
): PerformanceReport | NotEnoughData {
  const tool = GROWTH_TOOLS.performance;
  if (rows.length < tool.needsResults) return notEnoughData(tool, rows.length);

  const out: Recommendation[] = [];
  const overall = ratesFor(rows);

  const platforms = sliceBy(rows, (r) => r.platform).filter((s) => !s.thin);
  if (platforms.length >= 2) {
    const best = platforms[0]!;
    const worst = platforms[platforms.length - 1]!;
    if (best.signupsPerThousandReached > worst.signupsPerThousandReached * 2) {
      out.push({
        do: `Move effort from ${worst.key} to ${best.key}.`,
        because: `${best.key} returns ${best.signupsPerThousandReached} signups per thousand reached against ${worst.signupsPerThousandReached} on ${worst.key}, over ${best.posts} and ${worst.posts} posts.`,
        confidence: best.posts >= 5 && worst.posts >= 5 ? 'strong' : 'worth trying',
      });
    }
  }

  /*
   * The funnel, in order, so the advice lands on the step that is actually
   * losing people. Telling somebody to widen their reach when the reach is
   * fine and nobody who clicks ever signs up sends them to work on the one
   * thing that was already working.
   */
  if (overall.clickRate > 0 && overall.clickRate < 0.01) {
    out.push({
      do: 'Rewrite the opening line rather than posting more.',
      because: `${(overall.clickRate * 100).toFixed(2)}% of the people reached clicked. The reach is there; the first sentence is not earning it.`,
      confidence: rows.length >= 10 ? 'strong' : 'worth trying',
    });
  }
  if (overall.clickRate >= 0.01 && overall.signupRate > 0 && overall.signupRate < 0.1) {
    out.push({
      do: 'Look at the page people land on, not at the post.',
      because: `People click — ${(overall.clickRate * 100).toFixed(2)}% of those reached — and then ${(100 - overall.signupRate * 100).toFixed(1)}% of them leave without signing up. The loss is after the click.`,
      confidence: 'strong',
    });
  }
  if (overall.signupRate >= 0.1 && overall.paidRate < 0.1 && overall.paidRate > 0) {
    out.push({
      do: 'Set the expectation before the signup, not after.',
      because: `${(overall.signupRate * 100).toFixed(1)}% of clicks sign up but only ${(overall.paidRate * 100).toFixed(1)}% go on to pay. People are arriving expecting something else.`,
      confidence: 'worth trying',
    });
  }

  const subjects = sliceBy(rows, (r) => r.subject).filter((s) => !s.thin);
  if (subjects.length >= 2 && subjects[0]!.signupsPerThousandReached > 0) {
    out.push({
      do: `Write more about "${subjects[0]!.key}".`,
      because: `It returns ${subjects[0]!.signupsPerThousandReached} signups per thousand reached across ${subjects[0]!.posts} posts — the best of the ${subjects.length} subjects with enough behind them to compare.`,
      confidence: subjects[0]!.posts >= 5 ? 'strong' : 'thin',
    });
  }

  return {
    answered: true,
    recommendations: out,
    says:
      out.length === 0
        ? `Across ${rows.length} results nothing stands out far enough from the rest to act on. That is a real answer, not a missing one.`
        : `${out.length} thing${out.length === 1 ? '' : 's'} your own ${rows.length} results say to change.`,
  };
}

/* ------------------------------------------------------------------ *
 * What a generated output must survive before a partner sees it
 * ------------------------------------------------------------------ */

export interface CopyCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * Patterns that turn marketing into a health claim.
 *
 * Not a style guide. A partner saying this platform "cures", "treats" or
 * "guarantees" a result has made a medical claim on our behalf, and the
 * consequences land on the platform rather than on the person who typed
 * it. So it never reaches them to copy.
 */
const HEALTH_CLAIM = [
  /\b(cure|cures|cured|treats?|treating|heals?|reverses?)\b/i,
  /\bclinically (proven|guaranteed)\b/i,
  /\bguarantee[sd]? (results?|weight|loss|outcomes?)\b/i,
  /\blose \d+\s?(kg|kilos|pounds|lbs|stone)\b/i,
  /\b\d+\s?(kg|kilos|pounds|lbs|stone) in \d+\b/i,
  /\bmedically (approved|endorsed)\b/i,
  /\bprevents? (disease|diabetes|cancer|illness)\b/i,
];

/** Numbers a model would happily invent about a business it cannot see. */
const INVENTED_STAT = [
  /\b\d{1,3}(\.\d+)?%\s+(of\s+)?(our|their|users?|members?|customers?|people)\b/i,
  /\b\d[\d,]*\+?\s+(happy|satisfied|active)\s+(users?|members?|customers?)\b/i,
  /\b(join|trusted by)\s+\d[\d,]*\+?\b/i,
];

export function checkCopy(text: string, strict = false): CopyCheck {
  const problems: string[] = [];
  const haystack = text.toLowerCase();

  for (const term of BANNED_LEXICON) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(haystack)) {
      problems.push(
        `contains "${term}" — the lexicon applies to a partner exactly as it applies to us`,
      );
    }
  }
  for (const pattern of HEALTH_CLAIM) {
    const found = text.match(pattern);
    if (found) problems.push(`"${found[0]}" is a health claim, not marketing`);
  }
  for (const pattern of INVENTED_STAT) {
    const found = text.match(pattern);
    if (found) problems.push(`"${found[0]}" is a figure nothing here can verify`);
  }
  if (strict && /\b(body|shape|size)\b/i.test(text)) {
    problems.push('body, shape or size framing, which this audience must not be sold on');
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The line under every generated output, shown to the partner and meant to
 * survive into what they publish.
 */
export const PARTNER_DISCLOSURE =
  'Drafted for you, published by you. You are the advertiser: the claims, the consent to email ' +
  'anybody, and the advertising rules of wherever this runs are yours. Nothing here posts ' +
  'anything anywhere on your behalf.';
