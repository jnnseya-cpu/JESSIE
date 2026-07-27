/**
 * Brand system. The three names are distinct and must not be used
 * interchangeably — see the specification, §2.2.
 */
export const BRAND = {
  /** The platform. Enterprise, procurement, technical, investor contexts. */
  platform: 'JESSIE-OS™',
  /** Expansion of the acronym. */
  expansion: 'Just Enough Somatic Stimulus Intelligence Engine',
  /** The application a person opens, receives or speaks to. */
  app: 'Jessie',
  /** The coach persona. Speaks in first person. Never claims to be human. */
  coach: 'Jess',
  /** The atomic unit of the product. */
  unit: 'Snap',
} as const;

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
