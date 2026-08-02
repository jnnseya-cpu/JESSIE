/**
 * What may be remembered without being asked.
 *
 * The engine's autosave policy already names the fields that must never
 * be written silently — consent, date of birth, anything clinical — and
 * that rule does not weaken just because the storage is a key/value
 * document rather than a profile column. So keys are allow-listed by
 * prefix, and a document is size-capped: a draft is a convenience, not
 * a place to accumulate a person's history.
 */

export const STATE_KEYS = [
  'body.inputs',
  'scanner.list',
  'foodlens.last',
  'mova.thread',
  'snap.current',
  'ui.preferences',
] as const;
export type StateKey = (typeof STATE_KEYS)[number];

/** Anything matching these may never be autosaved, whatever it is called. */
export const FORBIDDEN = [
  'consent',
  'dateofbirth',
  'dob',
  'clinical',
  'diagnosis',
  'password',
  'token',
  'guardian',
];

export const MAX_DOCUMENT_BYTES = 24_000;

export function isAllowedKey(key: string): boolean {
  if (!STATE_KEYS.includes(key as StateKey)) return false;
  const flat = key.toLowerCase().replace(/[^a-z]/g, '');
  return !FORBIDDEN.some((word) => flat.includes(word));
}

export interface StateCheck {
  ok: boolean;
  why?: string;
}

export function checkDocument(key: string, value: unknown): StateCheck {
  if (!isAllowedKey(key)) {
    return { ok: false, why: `"${key}" is not a key this platform saves automatically` };
  }
  if (value === undefined) return { ok: false, why: 'nothing to save' };

  const serialised = JSON.stringify(value);
  if (serialised === undefined) return { ok: false, why: 'that value cannot be stored' };
  if (Buffer.byteLength(serialised, 'utf8') > MAX_DOCUMENT_BYTES) {
    return { ok: false, why: 'that draft is too large to keep — it is a draft, not an archive' };
  }

  // A field named as forbidden anywhere in the document is refused
  // outright, so a client cannot smuggle consent into a draft.
  const flat = serialised.toLowerCase().replace(/[^a-z]/g, '');
  const smuggled = FORBIDDEN.find((word) => flat.includes(`${word}true`) || flat.includes(`${word}false`));
  if (smuggled) {
    return { ok: false, why: `"${smuggled}" is never saved without an explicit act` };
  }

  return { ok: true };
}
