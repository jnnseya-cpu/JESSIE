import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  BRAND_COLOURS,
  CHART_PROHIBITIONS,
  CONTRAST_RATIO_MIN,
  CONTRAST_TARGET,
  DARK,
  LIGHT,
  MAX_FLASH_HZ,
  MOTION_MS,
  RADII,
  SPACING,
  STATUS_LABELS,
  TARGET_SIZE_PX,
  TYPEFACES,
  MIN_TRANSACTION_GBP,
  MUST_NEVER_LOOK,
  PAYOUT_ABOVE_CHARGE_FLOOR,
  PAYOUT_MINIMUM_GBP,
} from '@jessmove/shared';
import { supervisors } from '@jessmove/body-command';

/**
 * The accessibility numbers, measured against what actually ships.
 *
 * Every constant used here was exported, documented with a WCAG clause
 * beside it, and read by nothing. `MAX_FLASH_HZ = 3` is a seizure-safety
 * limit; `CONTRAST_RATIO_MIN = 4.5` is the AA floor for body text;
 * `TARGET_SIZE_PX.wcagMinimum` says "never go below this". A number with
 * a standard cited next to it and no check behind it is a claim, and the
 * assurance page makes these claims in public.
 *
 * So this file measures. Contrast is computed from the real hex values,
 * flash rate from the real keyframes, and the rest from the real
 * stylesheet — not from a copy of the intent.
 */

const CSS = readFileSync(
  new URL('../../frontend/app/globals.css', import.meta.url),
  'utf8',
);

/* ------------------------------------------------------------------ *
 * Contrast, computed rather than asserted
 * ------------------------------------------------------------------ */

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Number(((hi! + 0.05) / (lo! + 0.05)).toFixed(2));
}

/** Every pair that carries actual reading, in both palettes. */
const READING_PAIRS: [string, string, string][] = [
  ['light: primary text on background', LIGHT.textPrimary, LIGHT.background],
  ['light: primary text on surface', LIGHT.textPrimary, LIGHT.surface],
  ['light: secondary text on background', LIGHT.textSecondary, LIGHT.background],
  ['light: secondary text on surface', LIGHT.textSecondary, LIGHT.surface],
  ['dark: primary text on background', DARK.textPrimary, DARK.background],
  ['dark: primary text on surface', DARK.textPrimary, DARK.surface],
  ['dark: secondary text on background', DARK.textSecondary, DARK.background],
  ['dark: secondary text on surface', DARK.textSecondary, DARK.surface],
];

test('body text clears the contrast floor the platform publishes', () => {
  /*
   * A ratio computed from the real tokens is the only version of this
   * claim worth making. The first draft of this test named fields that do
   * not exist on the palette — `LIGHT.ink`, `LIGHT.bg` — and an optional
   * chain skipped every pair, so it passed while measuring nothing. A
   * vacuous pass is worse than no test, because it is believed.
   */
  assert.equal(READING_PAIRS.length, 8, 'a reading pair was dropped from the check');

  for (const [what, fg, bg] of READING_PAIRS) {
    assert.ok(fg && bg, `${what} names a colour that no longer exists on the palette`);
    const ratio = contrast(fg, bg);
    assert.ok(
      ratio >= CONTRAST_RATIO_MIN,
      `${what} is ${ratio}:1, below the published ${CONTRAST_RATIO_MIN}:1 floor (${fg} on ${bg})`,
    );
  }
});

test('the later-life modes ask for AAA, and every reading pair delivers 7:1', () => {
  /*
   * The constant says these modes target AAA, and AAA for normal text is
   * 7:1. Nothing checked it, and one pair did not meet it: light-mode
   * secondary text was #536575 at 5.63:1 — comfortably AA, and short of
   * the promise for exactly the readers the promise exists for.
   *
   * It is now #475663: the same hue, fifteen percent darker, 7.06:1 on
   * the background and 7.56:1 on the surface. Nothing else moved.
   */
  for (const mode of ['explorer', 'independence', 'vitality'] as const) {
    assert.equal(CONTRAST_TARGET[mode], 'AAA', `${mode} no longer targets AAA`);
  }
  assert.equal(CONTRAST_TARGET.default, 'AA');

  for (const [what, fg, bg] of READING_PAIRS) {
    const ratio = contrast(fg, bg);
    assert.ok(
      ratio >= 7,
      `${what} is ${ratio}:1 and cannot satisfy the AAA target the later-life ` +
        'modes publish',
    );
  }
});

test('the stylesheet and the palette have not drifted apart', () => {
  /*
   * globals.css is the design system and `design.ts` is the specification
   * of it, which only works while they agree. They did agree, exactly,
   * which is why the contrast shortfall existed in both places at once —
   * and why the fix had to be applied to both.
   */
  const pairs: [string, string][] = [
    ['--jm-bg', LIGHT.background],
    ['--jm-surface', LIGHT.surface],
    ['--jm-text', LIGHT.textPrimary],
    ['--jm-text-2', LIGHT.textSecondary],
    ['--jm-bg-d', DARK.background],
    ['--jm-surface-d', DARK.surface],
    ['--jm-text-d', DARK.textPrimary],
  ];

  for (const [token, expected] of pairs) {
    const found = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8})`).exec(CSS);
    assert.ok(found, `${token} is not defined in globals.css`);
    assert.equal(
      found![1]!.toLowerCase(),
      expected.toLowerCase(),
      `${token} is ${found![1]} in the stylesheet and ${expected} in design.ts`,
    );
  }
});

test('shape, spacing, motion and type reach the stylesheet', () => {
  /*
   * These four tables described a design system that globals.css did not
   * implement: the stylesheet had colour tokens and hardcoded every
   * radius, gap and duration. So the spec described one system and the
   * product shipped another, and nothing could tell because neither
   * referred to the other.
   *
   * They are now custom properties in `:root`, and this asserts the
   * shipped value equals the declared one. That is what makes the table
   * the specification rather than a parallel opinion.
   */
  const expected: [string, string][] = [
    ...Object.entries(RADII).map(
      ([k, v]) => [`--jm-radius-${k}`, `${v}px`] as [string, string],
    ),
    ...Object.entries(SPACING).map(
      ([k, v]) => [`--jm-space-${k}`, `${v}px`] as [string, string],
    ),
    ...Object.entries(MOTION_MS).map(
      ([k, v]) => [`--jm-motion-${k}`, `${v}ms`] as [string, string],
    ),
    ['--jm-target-min', `${TARGET_SIZE_PX.wcagMinimum}px`],
    ['--jm-target-standard', `${TARGET_SIZE_PX.standard}px`],
    ['--jm-target-later-life', `${TARGET_SIZE_PX.laterLife}px`],
  ];

  for (const [token, value] of expected) {
    const found = new RegExp(`${token}:\\s*([^;]+);`).exec(CSS);
    assert.ok(found, `${token} is declared in design.ts and missing from globals.css`);
    assert.equal(
      found![1]!.trim(),
      value,
      `${token} is ${found![1]!.trim()} in the stylesheet and ${value} in design.ts`,
    );
  }

  for (const [key, family] of Object.entries(TYPEFACES)) {
    const found = new RegExp(`--jm-type-${key}:\\s*([^;]+);`).exec(CSS);
    assert.ok(found, `--jm-type-${key} is missing from globals.css`);
    assert.ok(
      found![1]!.replace(/['"]/g, '').trim() === family,
      `--jm-type-${key} is ${found![1]} and design.ts says ${family}`,
    );
  }
});

/* ------------------------------------------------------------------ *
 * Seizure safety
 * ------------------------------------------------------------------ */

test('nothing in the stylesheet flashes faster than the seizure limit', () => {
  /*
   * WCAG 2.3.1. A repeating animation completing more than three times a
   * second is the threshold, so any keyframe animation shorter than
   * 1000/MAX_FLASH_HZ milliseconds that also repeats is a candidate.
   */
  const shortest = 1000 / MAX_FLASH_HZ;

  const animations = [...CSS.matchAll(/animation:[^;]+;/g)].map((m) => m[0]);
  const offenders: string[] = [];

  for (const rule of animations) {
    if (!/infinite|\b[2-9]\b\s*$/.test(rule)) continue; // not repeating
    const duration = /([\d.]+)s/.exec(rule);
    const ms = /([\d.]+)ms/.exec(rule);
    const value = duration ? Number(duration[1]) * 1000 : ms ? Number(ms[1]) : null;
    if (value !== null && value < shortest) offenders.push(`${rule.trim()} (${value}ms)`);
  }

  assert.deepEqual(
    offenders,
    [],
    `a repeating animation completes faster than ${MAX_FLASH_HZ}Hz, which is the ` +
      'WCAG 2.3.1 seizure threshold',
  );
});

test('the stylesheet honours a reduced-motion preference', () => {
  assert.match(
    CSS,
    /@media[^{]*prefers-reduced-motion/,
    'nothing respects prefers-reduced-motion, so motion cannot be turned off',
  );
});

/* ------------------------------------------------------------------ *
 * Touch targets
 * ------------------------------------------------------------------ */

test('the shipped touch target is above the WCAG floor, not at it', () => {
  assert.ok(
    TARGET_SIZE_PX.standard >= TARGET_SIZE_PX.wcagMinimum,
    'the standard target is below the WCAG minimum it is measured against',
  );
  assert.ok(
    TARGET_SIZE_PX.laterLife >= TARGET_SIZE_PX.standard,
    'later-life targets are smaller than the standard ones, which inverts the reason they exist',
  );

  /*
   * And the stylesheet has to actually contain a rule that large. The
   * numbers above are a promise about the product; this is the product.
   */
  const sizes = [...CSS.matchAll(/min-(?:height|width):\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(
    sizes.some((px) => px >= TARGET_SIZE_PX.wcagMinimum),
    `no rule in globals.css sets a minimum of ${TARGET_SIZE_PX.wcagMinimum}px or more, ` +
      'so nothing enforces a touch target size',
  );
});

/* ------------------------------------------------------------------ *
 * Never colour alone
 * ------------------------------------------------------------------ */

test('every status colour has words to go with it', () => {
  /*
   * WCAG 1.4.1: colour is never the only way information is conveyed.
   * A status palette without a label set is exactly that failure, and
   * this table exists to prevent it.
   */
  for (const [status, labels] of Object.entries(STATUS_LABELS)) {
    assert.ok(
      labels.length > 0,
      `the ${status} status has a colour and no words, so it reads as nothing to ` +
        'anybody who cannot distinguish it',
    );
    for (const label of labels) {
      assert.ok(label.trim().length > 2, `${status} has an empty-ish label: "${label}"`);
    }
  }

  // A palette entry with no label set at all is the failure mode.
  for (const status of Object.keys(BRAND_COLOURS.status ?? {})) {
    assert.ok(
      status in STATUS_LABELS,
      `the ${status} colour exists with no words defined for it`,
    );
  }
});

test('the charts obey their own prohibitions', () => {
  /*
   * CHART_PROHIBITIONS listed five things the platform does not do to a
   * graph and was read by nothing. Three of them are checkable against
   * the chart code; the other two are judgement and stay as prose.
   */
  const charts = readFileSync(new URL('../../frontend/app/charts.tsx', import.meta.url), 'utf8');

  assert.ok(
    CHART_PROHIBITIONS.length >= 5,
    'the prohibitions list has shrunk — removing one is a decision, not a tidy-up',
  );

  // "excessive 3D charts"
  assert.doesNotMatch(charts, /rotateX|rotateY|perspective\(/, 'a chart is being drawn in 3D');

  // "more than six prominent colours in one chart"
  const paletteRefs = new Set([...charts.matchAll(/--jm-([a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(
    paletteRefs.size <= 16,
    `charts.tsx references ${paletteRefs.size} colour tokens; six prominent colours ` +
      'in any one chart is the limit and this many suggests the limit is not being kept',
  );

  // "unlabelled colour-only charts"
  assert.match(
    charts,
    /aria-label|<title>|role="img"/,
    'no chart carries a text alternative, so a colour-only chart is all there is',
  );
});

/* ------------------------------------------------------------------ *
 * Three invariants that are true or false about the constants
 * themselves, and had nothing holding them
 * ------------------------------------------------------------------ */

test('the referral payout floor sits above the platform minimum charge', () => {
  /*
   * `PAYOUT_ABOVE_CHARGE_FLOOR` computes this and its own comment calls it
   * a sanity check — then nothing read the answer, so the sanity check
   * could have been false for the whole life of the platform and said so
   * to nobody.
   *
   * It matters because a payout below MIN_TRANSACTION_GBP is one Stripe's
   * fixed fee consumes: paying somebody £3 costs £0.20 to send, and the
   * floor exists so the platform never promises a reward it loses money
   * delivering.
   */
  assert.equal(
    PAYOUT_ABOVE_CHARGE_FLOOR,
    true,
    `the referral payout minimum (£${PAYOUT_MINIMUM_GBP}) is at or below the ` +
      `£${MIN_TRANSACTION_GBP} minimum charge, so a payout costs more to send than it is worth`,
  );
  assert.ok(PAYOUT_MINIMUM_GBP > MIN_TRANSACTION_GBP);
});

test('exactly one agent holds supervisory authority', () => {
  /*
   * The comment beside `supervisors()` says "asserted in tests" and no
   * test asserted it. Two supervisors is an ambiguous escalation path —
   * an agent that needs a decision has two places to send it and no rule
   * about which — and zero means nothing above the agents at all.
   */
  const found = supervisors();
  assert.equal(
    found.length,
    1,
    `${found.length} agents claim supervisory authority: ${found.map((a) => a.code).join(', ')}`,
  );
});

test('the product still knows what it must never look like', () => {
  /*
   * A review checklist kept in code, which is a reasonable place for it —
   * design review is a human act and this is the list the human reads.
   * What a test can hold is that the list has not been quietly emptied,
   * because a checklist that reaches zero items stops being consulted
   * before anybody notices it is gone.
   */
  assert.ok(
    MUST_NEVER_LOOK.length >= 9,
    `the "must never look like" list is down to ${MUST_NEVER_LOOK.length} items; ` +
      'removing one is a design decision and should be argued for, not dropped',
  );
  for (const entry of MUST_NEVER_LOOK) {
    assert.ok(entry.trim().length > 3, `an empty entry in the checklist: "${entry}"`);
  }
  assert.ok(
    MUST_NEVER_LOOK.includes('weight-loss obsessed'),
    'the platform positions itself as movement rather than weight loss; that entry ' +
      'is the one that keeps the rest of the copy honest',
  );
});
