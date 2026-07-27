/**
 * MOVEQUEST — canonical design tokens. §4–§12 and §36 of the brand and
 * visual identity specification.
 *
 * These values are normative. The frontend imports them rather than
 * redeclaring hex codes, so a token change propagates in one commit.
 *
 * Two rules govern every use of colour here:
 *   1. Colour is never the only way information is communicated. A status
 *      colour must always travel with an icon, a label or a pattern.
 *   2. Red is reserved for safety, allergy conflict, account security and
 *      critical system warnings. It is never used because somebody missed a
 *      movement or ate an energy-dense meal.
 */

/* ============================================================
   §4 — Brand colours
   ============================================================ */

export const BRAND_COLOURS = {
  /** Trust, intelligence, depth, security. Navigation, headers, dark mode. */
  navy: '#102A43',
  /** Health, renewal, momentum, balance. Primary buttons, completion, progress. */
  teal: '#00A99D',
  /** Fresh energy, achievement, optimism. Rewards, streaks, celebrations. */
  lime: '#B7E436',
  /** Technology, clarity, reliability. AI, wearables, data, links. */
  blue: '#3487F7',
  /** Personalisation. BodyCommand, specialist pathways, generated plans. */
  purple: '#7656E8',
  /** Attention without danger. Energetic challenges, recovery of a missed action. */
  coral: '#FF6B5E',
  /** FoodLens, meal insight, nutrition, food diversity. */
  orange: '#F59E3D',
  /** Hydration, sleep, breathing, calm. */
  sky: '#67C5EB',
  /** Resistance movement, muscle protection, strength achievement. */
  magenta: '#D84F9A',
} as const;

export type BrandColour = keyof typeof BRAND_COLOURS;

/* ============================================================
   §5 — Health-state colours
   Always paired with an icon or label. Never colour alone.
   ============================================================ */

export const STATUS_COLOURS = {
  excellent: '#11875D',
  positive: '#35A853',
  monitor: '#E5A000',
  action: '#EB6A22',
  critical: '#C83B46',
  information: '#2474C6',
  specialist: '#7656E8',
  unavailable: '#7A8896',
} as const;

export type StatusColour = keyof typeof STATUS_COLOURS;

/** Permitted labels per status. A status may never be rendered as colour alone. */
export const STATUS_LABELS: Readonly<Record<StatusColour, readonly string[]>> = {
  excellent: ['Strong progress', 'Excellent consistency', 'Completed', 'Healthy pattern'],
  positive: ['Positive', 'On track', 'Good balance'],
  monitor: ['Worth monitoring', 'Review recommended', 'Moderate concern'],
  action: ['Improvement opportunity', 'Action recommended', 'Pattern detected'],
  critical: ['Safety', 'Urgent attention', 'Possible allergy conflict'],
  information: ['Information', 'Guidance', 'AI explanation'],
  specialist: ['Personalised', 'Specialist pathway', 'Age-adapted'],
  unavailable: ['Insufficient data', 'Low confidence', 'Not connected'],
};

/* ============================================================
   §6 — Signature gradients
   Used selectively. Never behind long-form text.
   ============================================================ */

export const GRADIENTS = {
  hero: ['#102A43', '#006F80', '#00A99D'],
  intelligence: ['#3487F7', '#7656E8'],
  movement: ['#00A99D', '#B7E436'],
  food: ['#F59E3D', '#FF6B5E'],
  recovery: ['#67C5EB', '#7656E8'],
} as const;

export type GradientName = keyof typeof GRADIENTS;

/* ============================================================
   §7 — Surfaces
   ============================================================ */

export const LIGHT = {
  /** A soft mint-grey. Calmer and healthier-feeling than pure white. */
  background: '#F4F8F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#EAF2F1',
  textPrimary: '#102A43',
  textSecondary: '#536575',
  divider: '#DCE6E4',
} as const;

export const DARK = {
  background: '#081A27',
  surface: '#102A3A',
  surfaceElevated: '#17384A',
  textPrimary: '#F4FAF9',
  textSecondary: '#B7C8CF',
  divider: '#264657',
} as const;

/** Back-compatible flat map of the most-used tokens. */
export const TOKENS = {
  ...BRAND_COLOURS,
  background: LIGHT.background,
  surface: LIGHT.surface,
  text: LIGHT.textPrimary,
  textSecondary: LIGHT.textSecondary,
  divider: LIGHT.divider,
} as const;

export type TokenName = keyof typeof TOKENS;

/* ============================================================
   §8 — Typography
   ============================================================ */

export const TYPEFACES = {
  /** Body, buttons, forms, dashboards, numbers, data labels. */
  primary: 'Inter',
  /** Hero headlines, major scores, achievement screens, campaign graphics. */
  display: 'Manrope',
  /** Explorer Mode only (ages 10–12). */
  youth: 'Nunito Sans',
} as const;

/**
 * Minimum body type size by mode. Never render below these values.
 * 16px baseline, rising to 18px at 65+ and 20px at 80+.
 */
export const MIN_BODY_PX = {
  default: 16,
  independence: 18,
  vitality: 20,
} as const;

/** Contrast floor per surface. AAA is required in Explorer, Independence and Vitality. */
export const CONTRAST_TARGET = {
  default: 'AA',
  explorer: 'AAA',
  independence: 'AAA',
  vitality: 'AAA',
} as const;

/* ============================================================
   §11–§12 — Shape and spacing
   ============================================================ */

export const RADII = {
  small: 12,
  input: 14,
  card: 20,
  hero: 24,
  modal: 24,
  sheet: 28,
  pill: 999,
} as const;

export const SPACING = {
  micro: 4,
  compact: 8,
  small: 12,
  standard: 16,
  section: 24,
  large: 32,
  screen: 48,
  hero: 64,
} as const;

/* ============================================================
   §28 — Accessibility floors
   ============================================================ */

/**
 * WCAG 2.2 AA sets a 24 × 24 CSS pixel minimum pointer target. MoveQuest
 * exceeds it: many users are older, moving, or operating one-handed.
 */
export const TARGET_SIZE_PX = {
  /** The WCAG 2.2 AA floor. Never go below this. */
  wcagMinimum: 24,
  /** What MoveQuest actually ships. */
  standard: 48,
  /** Independence and Vitality modes. */
  laterLife: 56,
} as const;

/** Text contrast floor for normal-size text. */
export const CONTRAST_RATIO_MIN = 4.5;

/* ============================================================
   §29 — Motion
   ============================================================ */

export const MOTION_MS = {
  micro: 140,
  transition: 250,
  transformation: 420,
  celebration: 1500,
} as const;

/** Nothing may flash above this rate. Photosensitivity ceiling. */
export const MAX_FLASH_HZ = 3;

/* ============================================================
   §21 — Chart rules
   ============================================================ */

/** Every chart must carry all of these. Asserted in the design-governance test. */
export const CHART_REQUIREMENTS = [
  'a descriptive title',
  'a one-sentence interpretation',
  'visible labels',
  'an accessible data table',
  'pattern or icon support where colours repeat',
  'a clear zero or baseline',
  'tooltip explanations',
  'a screen-reader summary',
] as const;

export const CHART_PROHIBITIONS = [
  'excessive 3D charts',
  'unlabelled colour-only charts',
  'misleading compressed axes',
  'more than six prominent colours in one chart',
  'decorative graphs without meaning',
] as const;

/* ============================================================
   Signature
   ============================================================ */

/** The signature line required on every screen, invoice and export. */
export const SIGNATURE_LINE = 'Powered by MOVEQUEST — Small Moves. Powerful Change.';

/**
 * ASCII-safe rendering of the signature line for HTTP headers.
 * Header values must be latin1; the em dash in SIGNATURE_LINE is rejected
 * by Node's header validation, so the full line travels in the response
 * body and this variant travels in the header.
 */
export const SIGNATURE_LINE_ASCII = 'Powered by MOVEQUEST - Small Moves. Powerful Change.';

/** Header key carrying the signature line on every API response. */
export const SIGNATURE_HEADER = 'x-powered-by-movequest';
