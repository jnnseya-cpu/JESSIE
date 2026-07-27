/**
 * Brand system. §2 of the brand and visual identity specification.
 * The names below are distinct and must not be used interchangeably.
 */
export const BRAND = {
  /** The platform. Enterprise, procurement, technical and investor contexts. */
  platform: 'MOVEQUEST',
  /** The full product name. */
  fullName: 'MoveQuest AI — Your Daily Movement and Body-Balance Operating System',
  /** What it is, in one line, for someone who has never heard of it. */
  descriptor: 'AI-powered micro-movement, food intelligence and healthy-lifestyle platform',
  /** The application a person opens, receives or speaks to. */
  app: 'MoveQuest',
  /** The AI coach persona. Speaks in first person. Never claims to be human. */
  coach: 'MOVA',
  /** What MOVA stands for. */
  coachExpansion: 'Movement Optimisation and Vitality Assistant',
  /** The atomic unit of the product, in user-facing language. */
  unit: 'micro-movement',
  /** What a micro-movement is called once the engine has scheduled it for you. */
  unitScheduled: 'mission',
} as const;

/** The primary tagline. Used alone — never stacked with a supporting line. */
export const TAGLINE = 'Small Moves. Powerful Change.';

/** Supporting taglines. Rotate; never place two in the same viewport. */
export const TAGLINES_SUPPORTING: readonly string[] = [
  'Move more without changing your whole life.',
  'Your day already has movement opportunities.',
  'Every movement counts.',
  'Your AI coach for everyday health.',
  'Build movement into the life you already live.',
  'Move better. Eat smarter. Feel stronger.',
  'Your body. Your rhythm. Your progress.',
  'Two minutes can change your day.',
  'Health that fits around real life.',
];

/** The flagship product promise. §2. */
export const FLAGSHIP_PROMISE =
  'MoveQuest learns how you live and turns everyday moments into personalised ' +
  'opportunities to move, eat better, recover and progress.';

/** The six brand personality characteristics. §3. */
export const PERSONALITY = [
  {
    trait: 'Intelligent',
    meaning: 'It understands context, and explains why it is recommending something.',
  },
  {
    trait: 'Energetic',
    meaning: 'The interface feels alive without becoming visually exhausting.',
  },
  {
    trait: 'Encouraging',
    meaning: 'Language focuses on progress, recovery and achievable actions.',
  },
  {
    trait: 'Inclusive',
    meaning: 'Built for different ages, abilities, cultures and health objectives.',
  },
  {
    trait: 'Trustworthy',
    meaning: 'Health data, safety information and AI confidence are stated plainly.',
  },
  {
    trait: 'Premium',
    meaning: 'Disciplined spacing, clear hierarchy, refined motion, high-quality components.',
  },
] as const;

/** What the product must never look like. §1 — kept in code as a review checklist. */
export const MUST_NEVER_LOOK = [
  'overly clinical',
  'judgemental',
  'intimidating',
  'childish',
  'cheap',
  'excessively sporty',
  'weight-loss obsessed',
  'overloaded with charts',
  'like a generic step counter',
] as const;

/**
 * Words that must never appear in user-facing copy at any age mode.
 * Enforced by the ethical-copy test in the backend test suite.
 */
export const BANNED_LEXICON: readonly string[] = [
  'workout',
  'burn',
  'calories',
  'fat',
  'weight loss',
  'slim',
  'toned',
  'bikini',
  'guilt',
  'cheat day',
  'no excuses',
  'lazy',
  'failure',
  'failed',
  'you lost your streak',
  'don’t break the chain',
];

/** Copy restrictions that apply additionally in the youngest and oldest modes. */
export const BANNED_LEXICON_STRICT: readonly string[] = [
  ...BANNED_LEXICON,
  'body',
  'shape',
  'size',
  'compete',
  'beat',
  'rank',
];
