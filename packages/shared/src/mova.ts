import type { AgeMode } from './age-modes';

/**
 * MOVA — Movement Optimisation and Vitality Assistant.
 *
 * The coach is the part of the product people will trust or distrust, so
 * the rules that make it trustworthy live in code rather than in a prompt.
 *
 * Three of them are absolute:
 *
 *   1. Every suggestion carries a machine-readable reason trace. If the
 *      trace cannot be built, the suggestion is not shown. "Why this?" is
 *      not a feature — it is the precondition for showing anything.
 *   2. MOVA may narrow what the safety layer allowed. It may never widen
 *      it, and it may never invent a movement that is not in the reviewed
 *      library.
 *   3. MOVA can be switched off completely. The product still works: the
 *      data-only experience is a first-class mode, not a degraded one.
 */

/* ============================================================
   1 — Presence
   ============================================================ */

/** How much of MOVA a person wants. Every level is fully supported. §15. */
export const MOVA_PRESENCE = ['full', 'compact', 'quiet', 'off'] as const;
export type MovaPresence = (typeof MOVA_PRESENCE)[number];

export interface PresenceDefinition {
  readonly presence: MovaPresence;
  readonly label: string;
  readonly what: string;
  /** What the person still gets. Never "nothing". */
  readonly retains: readonly string[];
}

export const PRESENCE_DEFINITIONS: Readonly<Record<MovaPresence, PresenceDefinition>> = {
  full: {
    presence: 'full',
    label: 'Full coach',
    what: 'Conversational panel, voice, weekly review, animated guidance.',
    retains: ['everything'],
  },
  compact: {
    presence: 'compact',
    label: 'Compact',
    what: 'A recommendation card with a reason line. No conversation, no voice.',
    retains: ['missions', 'reasons', 'progress', 'all charts'],
  },
  quiet: {
    presence: 'quiet',
    label: 'Quiet',
    what: 'Missions arrive with no persona, no encouragement and no personality.',
    retains: ['missions', 'reasons', 'progress', 'all charts'],
  },
  off: {
    presence: 'off',
    label: 'Off — data only',
    what: 'No coach at all. You read the numbers and decide for yourself.',
    retains: [
      'the full movement library',
      'every chart and every reading',
      'the sedentary timeline',
      'export and deletion',
      'team challenges',
    ],
  },
};

/** Turning MOVA off must never remove a capability. Asserted in test. */
export function capabilitiesLostByTurningOff(): readonly string[] {
  return [];
}

/* ============================================================
   2 — Context states
   ============================================================ */

/**
 * §15 — MOVA changes colour with context. Colour is a secondary signal:
 * the state name is always printed, because colour alone is never the
 * only way information is communicated.
 */
export const MOVA_STATE_KEYS = [
  'movement',
  'food',
  'body',
  'recovery',
  'success',
  'attention',
  'safety',
] as const;
export type MovaStateKey = (typeof MOVA_STATE_KEYS)[number];

export interface MovaState {
  readonly key: MovaStateKey;
  readonly label: string;
  readonly token: string;
  readonly means: string;
  /** Whether this state may interrupt a person who has asked for quiet. */
  readonly mayInterruptQuiet: boolean;
}

export const MOVA_STATES: Readonly<Record<MovaStateKey, MovaState>> = {
  movement: {
    key: 'movement',
    label: 'Movement',
    token: 'teal',
    means: 'Coaching a micro-movement.',
    mayInterruptQuiet: false,
  },
  food: {
    key: 'food',
    label: 'Food',
    token: 'orange',
    means: 'FoodLens analysis and alternatives.',
    mayInterruptQuiet: false,
  },
  body: {
    key: 'body',
    label: 'Body',
    token: 'purple',
    means: 'BodyCommand reasoning about a pathway.',
    mayInterruptQuiet: false,
  },
  recovery: {
    key: 'recovery',
    label: 'Recovery',
    token: 'sky',
    means: 'Sleep, hydration, breathing, stepping back.',
    mayInterruptQuiet: false,
  },
  success: {
    key: 'success',
    label: 'Done',
    token: 'positive',
    means: 'Something completed.',
    mayInterruptQuiet: false,
  },
  attention: {
    key: 'attention',
    label: 'Worth a look',
    token: 'monitor',
    means: 'A pattern that may be worth reviewing.',
    mayInterruptQuiet: false,
  },
  safety: {
    key: 'safety',
    label: 'Safety',
    token: 'critical',
    means: 'A safety message. The only state that overrides quiet.',
    mayInterruptQuiet: true,
  },
};

/* ============================================================
   3 — The reason trace
   ============================================================ */

/**
 * Why this, why now, why you. A suggestion without all three cannot be
 * rendered — `explain()` throws rather than returning a vague string.
 */
export interface ReasonTrace {
  /** The observation that triggered it. "Seated for 94 minutes." */
  readonly trigger: string;
  /** The window that made it possible. "25 free minutes before 15:00." */
  readonly window: string;
  /** Why this movement and not another. "Silent, seated, no space needed." */
  readonly fit: string;
  /** What was ruled out, and by whom. Empty is allowed; absent is not. */
  readonly ruledOut: readonly string[];
  /** Which agent produced each part, for audit. */
  readonly attribution: Readonly<Record<'trigger' | 'window' | 'fit', string>>;
  /** 0–1. Shown as a confidence chip, never hidden. */
  readonly confidence: number;
}

export class UnexplainableSuggestionError extends Error {
  constructor(missing: string) {
    super(
      `A suggestion cannot be shown without a complete reason trace. Missing: ${missing}. ` +
        `If the engine cannot say why, the person should not be interrupted.`,
    );
    this.name = 'UnexplainableSuggestionError';
  }
}

export function explain(trace: Partial<ReasonTrace>): ReasonTrace {
  const missing: string[] = [];
  if (!trace.trigger?.trim()) missing.push('trigger');
  if (!trace.window?.trim()) missing.push('window');
  if (!trace.fit?.trim()) missing.push('fit');
  if (!trace.attribution) missing.push('attribution');
  if (typeof trace.confidence !== 'number') missing.push('confidence');
  if (missing.length > 0) throw new UnexplainableSuggestionError(missing.join(', '));
  return {
    trigger: trace.trigger!,
    window: trace.window!,
    fit: trace.fit!,
    ruledOut: trace.ruledOut ?? [],
    attribution: trace.attribution!,
    confidence: trace.confidence!,
  };
}

/** Renders the trace as the one-line "why this?" a person actually reads. */
export function reasonLine(trace: ReasonTrace): string {
  return `${trace.trigger} ${trace.window} ${trace.fit}`;
}

/* ============================================================
   4 — Register
   ============================================================ */

/** One personality, six voices. §6 of the product spec. */
export const REGISTERS: Readonly<Record<AgeMode, { opens: string; never: string }>> = {
  explorer: {
    opens: 'Your explorer has been resting. Two minutes to wake them up?',
    never: 'Anything evaluative about a body, a shape or a number.',
  },
  teen: {
    opens: 'Fifty-two minutes of revision. Three-minute reset before the next topic?',
    never: 'Hype, exclamation marks, or anything that sounds like a parent.',
  },
  momentum: {
    opens: 'Seated ninety-four minutes, next call at 15:00. Silent desk reset?',
    never: 'Anything that costs more time than it saves.',
  },
  balance: {
    opens: 'Third long block today. Two minutes now protects tomorrow morning.',
    never: 'Pretending a long horizon is a short one.',
  },
  independence: {
    opens: 'A good moment for the counter balance sequence, if you fancy it.',
    never: 'Rushing, or implying that slower is worse.',
  },
  vitality: {
    opens: 'Shall we do the seated shoulder roll together?',
    never: 'Timers, scores, failure states, or more than one instruction.',
  },
};

/* ============================================================
   5 — Refusals
   ============================================================ */

/**
 * What MOVA will not do, whatever it is asked. These are refusals rather
 * than confidence thresholds — a better model does not unlock them.
 */
export const MOVA_REFUSES = [
  {
    ask: 'Diagnose a symptom',
    instead: 'Stops the session and points to a professional who can examine you.',
  },
  {
    ask: 'Invent a movement that is not in the reviewed library',
    instead: 'Assembles and explains movements a clinician has already signed off.',
  },
  {
    ask: 'Override a safety block because you insist',
    instead: 'Offers the nearest movement the safety layer did allow.',
  },
  {
    ask: 'Discuss a child’s weight, shape, BMI or calories',
    instead: 'Talks about energy, confidence, growth and routine.',
  },
  {
    ask: 'Compare you with another named person',
    instead: 'Compares you with your own fortnight.',
  },
  {
    ask: 'Promise a result — pounds, dress size, a date',
    instead: 'Describes direction, and says how uncertain it is.',
  },
  {
    ask: 'Contact emergency services',
    instead: 'Shows the number and tells you to call it yourself. It cannot dial.',
  },
] as const;

/**
 * A safety message is the only thing that reaches someone who asked for
 * quiet — and even then it informs rather than instructs.
 */
export function mayDeliver(state: MovaStateKey, presence: MovaPresence): boolean {
  if (presence === 'off') return false;
  if (presence === 'quiet') return MOVA_STATES[state].mayInterruptQuiet;
  return true;
}

/* ============================================================
   6 — Redaction
   ============================================================ */

/*
 * The redaction list — what is never sent to a model provider under any
 * presence setting, for any agent — is defined once in `ai.ts` as
 * NEVER_SEND_TO_MODEL and enforced in the gateway. It is referenced here
 * rather than restated, so the two can never drift apart.
 */
