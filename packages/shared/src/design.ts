/**
 * Canonical design tokens. §2 of the specification.
 * These values are normative — the frontend imports them rather than
 * redeclaring hex codes, so a token change propagates in one commit.
 */
export const TOKENS = {
  ink: '#0B1220', // primary text, dark surfaces
  pulse: '#00E08A', // success, completion, live states
  ember: '#FF6B3D', // streak, energy, calls to action
  deep: '#12326B', // brand navy, headers, enterprise
  mist: '#F4F7FB', // app background
  slate: '#5A6B85', // secondary text
  gold: '#E9B949', // achievement, Sparks, rewards
  alert: '#D7263D', // clinical / safety only
} as const;

export type TokenName = keyof typeof TOKENS;

/**
 * Minimum body type size by mode. Never render below these values.
 * §2 — 17px baseline, 22px Silver, 26px Centennial.
 */
export const MIN_BODY_PX = {
  default: 17,
  silver: 22,
  centennial: 26,
} as const;

/** Contrast floor per surface. AAA is required in Kid, Silver and Centennial. */
export const CONTRAST_TARGET = {
  default: 'AA',
  kid: 'AAA',
  silver: 'AAA',
  centennial: 'AAA',
} as const;

/** The signature line required on every screen, invoice and export. */
export const SIGNATURE_LINE =
  'Powered by JESSIE-OS™ — movement, engineered into the gaps.';

/**
 * ASCII-safe rendering of the signature line for HTTP headers.
 * Header values must be latin1; the trademark sign and em dash in
 * SIGNATURE_LINE are rejected by Node's header validation, so the full
 * line travels in the response body and this variant travels in the header.
 */
export const SIGNATURE_LINE_ASCII =
  'Powered by JESSIE-OS - movement, engineered into the gaps.';

/** Header key carrying the signature line on every API response. */
export const SIGNATURE_HEADER = 'x-powered-by-jessie';
