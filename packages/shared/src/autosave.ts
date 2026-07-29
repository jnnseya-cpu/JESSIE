/**
 * Autosave.
 *
 * Autosave is easy to build badly in a way nobody notices until it costs
 * somebody something. Three decisions matter more than the debounce
 * interval:
 *
 *  1. **Some fields must never autosave.** A consent toggle that saves
 *     itself 800ms after a mis-tap is not consent. Neither is a date of
 *     birth that silently changes an age band, a guardian link, or a
 *     safety screening answer. These need an explicit confirm, and the
 *     field policy below is what makes that structural rather than a
 *     convention somebody forgets.
 *
 *  2. **Last-write-wins is wrong here.** A household plan means two people
 *     can be editing the same record, and on a phone the second tab is
 *     often the same person. Every write carries the version it was based
 *     on; a mismatch returns both values rather than overwriting one.
 *
 *  3. **"Saved" must mean saved.** The indicator is derived from the
 *     server's acknowledgement, not from the timer firing, because a
 *     tick that appears before the request lands is worse than no tick.
 */

/* ------------------------------------------------------------------ *
 * Timing
 * ------------------------------------------------------------------ */

export const AUTOSAVE = {
  /** Quiet period after the last keystroke before a save is attempted. */
  debounceMs: 900,
  /** Save at least this often while someone types continuously. */
  maxIntervalMs: 6_000,
  /** Below this, a change is not worth a request. */
  minChangedFields: 1,
  /** Retries on a network failure, with exponential backoff. */
  maxRetries: 4,
  retryBaseMs: 500,
  /** A draft that is never committed is discarded after this. */
  draftTtlHours: 72,
} as const;

export function retryDelayMs(attempt: number): number {
  if (attempt < 1) throw new RangeError('attempts are 1-based');
  return AUTOSAVE.retryBaseMs * 2 ** (attempt - 1);
}

/* ------------------------------------------------------------------ *
 * Field policy
 * ------------------------------------------------------------------ */

export const SAVE_POLICIES = ['autosave', 'explicit', 'never'] as const;
export type SavePolicy = (typeof SAVE_POLICIES)[number];

/**
 * `explicit` fields are editable but require a deliberate confirmation.
 * `never` fields are not editable through this surface at all — they move
 * through their own verified flow.
 */
export const FIELD_POLICY: Readonly<Record<string, SavePolicy>> = {
  // Safe to save as you type.
  displayName: 'autosave',
  handle: 'autosave',
  pronouns: 'autosave',
  bio: 'autosave',
  locale: 'autosave',
  timezone: 'autosave',
  avatarPreset: 'autosave',
  coverPreset: 'autosave',
  notificationChannels: 'autosave',
  quietHours: 'autosave',
  movementGoal: 'autosave',
  coachPresence: 'autosave',

  // Deliberate action required. A mis-tap must not change any of these.
  visibility: 'explicit',
  realName: 'explicit',
  avatarKind: 'explicit',
  coverKind: 'explicit',
  optedIntoBodyMetrics: 'explicit',
  consentScopes: 'explicit',
  wearableScopes: 'explicit',
  autoTopUp: 'explicit',
  spendCap: 'explicit',
  crewVisibility: 'explicit',
  accountClosure: 'explicit',

  // Not editable here at all.
  dateOfBirth: 'never',
  ageBand: 'never',
  guardianLink: 'never',
  accountKind: 'never',
  paymentMethod: 'never',
  screeningAnswers: 'never',
  clinicalFlags: 'never',
  kycIdentity: 'never',
};

export function policyFor(field: string): SavePolicy {
  // Unknown fields are refused rather than assumed safe. A new field that
  // nobody classified should fail loudly on the first save, not quietly
  // autosave whatever it holds.
  return FIELD_POLICY[field] ?? 'never';
}

export const AUTOSAVEABLE_FIELDS = Object.keys(FIELD_POLICY).filter(
  (f) => FIELD_POLICY[f] === 'autosave',
);
export const EXPLICIT_FIELDS = Object.keys(FIELD_POLICY).filter(
  (f) => FIELD_POLICY[f] === 'explicit',
);
export const NEVER_AUTOSAVED_FIELDS = Object.keys(FIELD_POLICY).filter(
  (f) => FIELD_POLICY[f] !== 'autosave',
);

export class NotAutosaveableError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(
      `these fields cannot autosave and need an explicit confirmation: ${fields.join(', ')}`,
    );
    this.name = 'NotAutosaveableError';
  }
}

export interface SplitPatch {
  /** Safe to write on the autosave path. */
  readonly autosave: Record<string, unknown>;
  /** Editable, but only through a confirmed submit. */
  readonly explicit: Record<string, unknown>;
  /** Not editable through this surface. Always an error to send. */
  readonly refused: readonly string[];
}

/**
 * Splits an incoming patch three ways. The caller writes `autosave`,
 * surfaces `explicit` as "confirm these changes", and treats `refused` as
 * a client bug.
 */
export function splitPatch(patch: Record<string, unknown>): SplitPatch {
  const autosave: Record<string, unknown> = {};
  const explicit: Record<string, unknown> = {};
  const refused: string[] = [];

  for (const [field, value] of Object.entries(patch)) {
    switch (policyFor(field)) {
      case 'autosave':
        autosave[field] = value;
        break;
      case 'explicit':
        explicit[field] = value;
        break;
      default:
        refused.push(field);
    }
  }

  return { autosave, explicit, refused };
}

/* ------------------------------------------------------------------ *
 * Conflict detection
 * ------------------------------------------------------------------ */

export const SAVE_STATES = ['idle', 'dirty', 'saving', 'saved', 'error', 'conflict'] as const;
export type SaveState = (typeof SAVE_STATES)[number];

export interface FieldConflict {
  readonly field: string;
  readonly yours: unknown;
  readonly theirs: unknown;
}

export interface SaveResult {
  readonly state: SaveState;
  readonly version: number;
  readonly savedFields: readonly string[];
  readonly conflicts: readonly FieldConflict[];
  readonly message: string;
}

/**
 * Applies a patch optimistically against a version.
 *
 * A version mismatch does not always mean a conflict. If the other writer
 * touched different fields, both edits can land — which is the common case
 * for two people editing a household. A conflict is only reported for
 * fields that changed on both sides to *different* values.
 */
export function applyWithVersion(
  current: Record<string, unknown>,
  currentVersion: number,
  patch: Record<string, unknown>,
  basedOnVersion: number,
  changedSinceBase: Record<string, unknown> = {},
): SaveResult {
  const conflicts: FieldConflict[] = [];
  const savedFields: string[] = [];

  const stale = basedOnVersion < currentVersion;

  for (const [field, value] of Object.entries(patch)) {
    if (stale && field in changedSinceBase) {
      const theirs = changedSinceBase[field];
      if (!Object.is(theirs, value)) {
        conflicts.push({ field, yours: value, theirs });
        continue;
      }
    }
    current[field] = value;
    savedFields.push(field);
  }

  if (conflicts.length > 0) {
    return {
      state: 'conflict',
      version: currentVersion,
      savedFields,
      conflicts,
      message:
        `${conflicts.length} field${conflicts.length === 1 ? '' : 's'} changed elsewhere ` +
        'while you were editing. Nothing was overwritten — choose which value to keep.',
    };
  }

  if (savedFields.length === 0) {
    return {
      state: 'idle',
      version: currentVersion,
      savedFields: [],
      conflicts: [],
      message: 'Nothing to save.',
    };
  }

  return {
    state: 'saved',
    version: currentVersion + 1,
    savedFields,
    conflicts: [],
    message: `Saved ${savedFields.length} change${savedFields.length === 1 ? '' : 's'}.`,
  };
}

/* ------------------------------------------------------------------ *
 * What the user is told
 * ------------------------------------------------------------------ */

export const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  idle: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save — retrying',
  conflict: 'Changed elsewhere',
};

/**
 * Whether leaving the page should warn. Only when there is real unsaved
 * work — a "are you sure you want to leave?" dialog that fires on a clean
 * form trains people to dismiss it without reading.
 */
export function shouldWarnOnLeave(state: SaveState): boolean {
  return state === 'dirty' || state === 'saving' || state === 'error' || state === 'conflict';
}
