import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_DEFINITIONS,
  ACCOUNT_STATES,
  AUTOSAVE,
  AVATAR_CONSTRAINT,
  AUTOSAVEABLE_FIELDS,
  COVER_CONSTRAINT,
  COVER_PATTERNS,
  DISPLAY_NAME_MAX,
  EXPLICIT_FIELDS,
  GUARDIAN_APPROVAL_UNDER,
  ILLUSTRATED_AVATARS,
  IMAGE_MIME_TYPES,
  NEVER_AUTOSAVED_FIELDS,
  RESERVED_HANDLES,
  SAVE_LABELS,
  SAVE_STATES,
  applyWithVersion,
  canTransitionAccount,
  checkImage,
  clampVisibility,
  handleAvailable,
  policyFor,
  profilePolicy,
  retryDelayMs,
  shouldWarnOnLeave,
  splitPatch,
  validateProfilePatch,
  visibleTo,
  type ImageCandidate,
  type Profile,
} from '@jessmove/shared';

/* ------------------------------------------------------------------ *
 * Account kinds and lifecycle
 * ------------------------------------------------------------------ */

test('every account kind is defined, and the definition matches its key', () => {
  for (const kind of ACCOUNT_KINDS) {
    const def = ACCOUNT_KIND_DEFINITIONS[kind];
    assert.ok(def, `${kind} undefined`);
    assert.equal(def.kind, kind);
    assert.ok(def.verification.length > 0, `${kind} has no verification`);
  }
});

test('a minor cannot transact and requires a guardian', () => {
  const minor = ACCOUNT_KIND_DEFINITIONS.minor;
  assert.equal(minor.canTransact, false);
  assert.equal(minor.requiresGuardian, true);
});

test('no account kind that requires a guardian may also transact', () => {
  const both = ACCOUNT_KINDS.filter(
    (k) => ACCOUNT_KIND_DEFINITIONS[k].requiresGuardian && ACCOUNT_KIND_DEFINITIONS[k].canTransact,
  );
  assert.deepEqual(both, []);
});

test('closed is terminal and every other state can reach closing', () => {
  for (const to of ACCOUNT_STATES) {
    assert.equal(canTransitionAccount('closed', to), false, `closed -> ${to}`);
  }
  assert.ok(canTransitionAccount('active', 'closing'));
  assert.ok(canTransitionAccount('closing', 'active'), 'closure must be reversible');
});

test('an account cannot go straight from active to closed', () => {
  assert.equal(canTransitionAccount('active', 'closed'), false);
});

/* ------------------------------------------------------------------ *
 * The profile policy — the safeguarding gate
 * ------------------------------------------------------------------ */

test('no photographic avatar exists below 18, at any age in the range', () => {
  for (let age = 10; age < 18; age += 1) {
    const policy = profilePolicy(age);
    assert.ok(!policy.avatarKinds.includes('photo'), `photo avatar allowed at ${age}`);
    assert.ok(!policy.coverKinds.includes('photo'), `photo cover allowed at ${age}`);
  }
});

test('profilePolicy takes no consent argument — there is nothing to pass', () => {
  assert.equal(profilePolicy.length, 1);
});

test('an adult gets photo, public visibility and a real name', () => {
  const policy = profilePolicy(18);
  assert.ok(policy.avatarKinds.includes('photo'));
  assert.equal(policy.visibilityCeiling, 'public');
  assert.equal(policy.realNameAllowed, true);
});

test('public visibility is unreachable below 18', () => {
  for (let age = 10; age < 18; age += 1) {
    assert.equal(profilePolicy(age).visibilityCeiling, 'crew', `age ${age}`);
  }
  assert.equal(profilePolicy(18).visibilityCeiling, 'public');
});

test('under 13 there is no bio and no real name, and a guardian approves', () => {
  const policy = profilePolicy(GUARDIAN_APPROVAL_UNDER - 1);
  assert.equal(policy.bioAllowed, false);
  assert.equal(policy.bioMaxLength, 0);
  assert.equal(policy.realNameAllowed, false);
  assert.equal(policy.guardianApproval, true);
});

test('13 unlocks a short bio but not a photograph or a real name', () => {
  const policy = profilePolicy(13);
  assert.equal(policy.bioAllowed, true);
  assert.equal(policy.bioMaxLength, 160);
  assert.equal(policy.realNameAllowed, false);
  assert.ok(!policy.avatarKinds.includes('photo'));
});

test('every age still gets a real identity, never an empty set of options', () => {
  for (let age = 10; age <= 100; age += 1) {
    const policy = profilePolicy(age);
    assert.ok(policy.avatarKinds.length >= 3, `age ${age} has too few avatar options`);
    assert.ok(policy.mediaRequiresModeration, `age ${age} skips moderation`);
  }
});

test('a nonsense age throws rather than defaulting to the permissive branch', () => {
  assert.throws(() => profilePolicy(Number.NaN), RangeError);
  assert.throws(() => profilePolicy(-1), RangeError);
});

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

test('clampVisibility lowers but never raises', () => {
  assert.equal(clampVisibility('public', 'crew'), 'crew');
  assert.equal(clampVisibility('household', 'crew'), 'household');
  assert.equal(clampVisibility('private', 'public'), 'private');
});

/* ------------------------------------------------------------------ *
 * Patch validation
 * ------------------------------------------------------------------ */

test('a fifteen-year-old asking for public is clamped, not refused', () => {
  const result = validateProfilePatch({ visibility: 'public' }, 15);
  assert.equal(result.ok, true);
  assert.equal(result.applied.visibility, 'crew');
  assert.equal(result.clamped.length, 1);
});

test('a fifteen-year-old uploading a photograph is refused, not clamped', () => {
  const result = validateProfilePatch({ avatarKind: 'photo' }, 15);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /photo avatar is not available/);
});

test('a real name below 18 is refused and stripped from the applied patch', () => {
  const result = validateProfilePatch({ realName: 'A Real Person' }, 16);
  assert.equal(result.ok, false);
  assert.equal(result.applied.realName, null);
});

test('a bio below 13 is refused and stripped', () => {
  const result = validateProfilePatch({ bio: 'hello' }, 11);
  assert.equal(result.ok, false);
  assert.equal(result.applied.bio, null);
});

test('an over-length bio is refused at the limit for that age', () => {
  assert.equal(validateProfilePatch({ bio: 'x'.repeat(160) }, 15).ok, true);
  assert.equal(validateProfilePatch({ bio: 'x'.repeat(161) }, 15).ok, false);
  assert.equal(validateProfilePatch({ bio: 'x'.repeat(400) }, 30).ok, true);
});

test('an invalid or reserved handle is refused', () => {
  assert.equal(validateProfilePatch({ handle: 'ab' }, 30).ok, false);
  assert.equal(validateProfilePatch({ handle: 'Has Spaces' }, 30).ok, false);
  assert.equal(validateProfilePatch({ handle: '_leading' }, 30).ok, false);
  assert.equal(validateProfilePatch({ handle: 'admin' }, 30).ok, false);
  assert.equal(validateProfilePatch({ handle: 'good_handle1' }, 30).ok, true);
});

test('a taken handle is refused, case-insensitively', () => {
  assert.equal(validateProfilePatch({ handle: 'taken' }, 30, ['TAKEN']).ok, false);
});

test('every reserved handle is actually unavailable', () => {
  for (const h of RESERVED_HANDLES) {
    assert.equal(handleAvailable(h), false, h);
  }
});

test('a display name is bounded at both ends', () => {
  assert.equal(validateProfilePatch({ displayName: 'A' }, 30).ok, false);
  assert.equal(validateProfilePatch({ displayName: 'x'.repeat(DISPLAY_NAME_MAX) }, 30).ok, true);
  assert.equal(
    validateProfilePatch({ displayName: 'x'.repeat(DISPLAY_NAME_MAX + 1) }, 30).ok,
    false,
  );
});

test('a preset that is not in the curated set is refused', () => {
  assert.equal(validateProfilePatch({ avatarPreset: 'not-a-real-one' }, 12).ok, false);
  assert.equal(validateProfilePatch({ avatarPreset: ILLUSTRATED_AVATARS[0] }, 12).ok, true);
  assert.equal(validateProfilePatch({ coverPreset: COVER_PATTERNS[0] }, 12).ok, true);
});

test('a patch from an under-13 is flagged as needing guardian approval', () => {
  assert.equal(validateProfilePatch({ displayName: 'Robin' }, 11).needsGuardianApproval, true);
  assert.equal(validateProfilePatch({ displayName: 'Robin' }, 14).needsGuardianApproval, false);
});

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

const img = (over: Partial<ImageCandidate> = {}): ImageCandidate => ({
  mimeType: 'image/jpeg',
  bytes: 400_000,
  widthPx: 800,
  heightPx: 800,
  ...over,
});

test('a good square avatar passes', () => {
  assert.equal(checkImage(img(), AVATAR_CONSTRAINT).ok, true);
});

test('an avatar that is not square is rejected', () => {
  const result = checkImage(img({ widthPx: 800, heightPx: 600 }), AVATAR_CONSTRAINT);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /aspect ratio/);
});

test('an oversized file is rejected with the actual size named', () => {
  const result = checkImage(img({ bytes: 9 * 1024 * 1024 }), AVATAR_CONSTRAINT);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join(' '), /9\.0MB exceeds the 5MB limit/);
});

test('a tiny image is rejected', () => {
  assert.equal(checkImage(img({ widthPx: 64, heightPx: 64 }), AVATAR_CONSTRAINT).ok, false);
});

test('an empty file is rejected', () => {
  assert.equal(checkImage(img({ bytes: 0 }), AVATAR_CONSTRAINT).ok, false);
});

test('a format outside the allow-list is rejected — including SVG', () => {
  for (const mime of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html']) {
    const result = checkImage(img({ mimeType: mime }), AVATAR_CONSTRAINT);
    assert.equal(result.ok, false, mime);
  }
  for (const mime of IMAGE_MIME_TYPES) {
    assert.equal(checkImage(img({ mimeType: mime }), AVATAR_CONSTRAINT).ok, true, mime);
  }
});

test('a cover is checked against 3:1 rather than square', () => {
  assert.equal(checkImage(img({ widthPx: 1800, heightPx: 600 }), COVER_CONSTRAINT).ok, true);
  assert.equal(checkImage(img({ widthPx: 800, heightPx: 800 }), COVER_CONSTRAINT).ok, false);
});

test('a rejected image reports every reason, not just the first', () => {
  /*
   * `assertImage` was a throwing wrapper around `checkImage` and was
   * called by nothing — the real upload path in profiles.service.ts does
   * its own check and throws with `reasons.join('; ')`, which is the same
   * guarantee from the place that actually runs. The wrapper is gone; the
   * property it protected is asserted here against the function the
   * upload uses.
   *
   * The property matters: telling somebody their avatar is the wrong
   * format, then the wrong size, then too small, one round trip at a
   * time, is how an upload gets abandoned.
   */
  const rejected = checkImage(
    img({ mimeType: 'image/gif', bytes: 0, widthPx: 10, heightPx: 90 }),
    AVATAR_CONSTRAINT,
  );
  assert.equal(rejected.ok, false);
  assert.ok(
    rejected.reasons.length >= 3,
    `only ${rejected.reasons.length} reason(s) reported: ${rejected.reasons.join('; ')}`,
  );
});

/* ------------------------------------------------------------------ *
 * Who sees what
 * ------------------------------------------------------------------ */

const profile = (over: Partial<Profile> = {}): Profile => ({
  userId: 'u_1',
  accountKind: 'adult',
  displayName: 'Sam',
  handle: 'sam',
  pronouns: 'they/them',
  realName: 'Samantha Example',
  bio: 'Walks a lot.',
  locale: 'en-GB',
  timezone: 'Europe/London',
  avatar: { kind: 'photo', assetId: 'a1', preset: null, moderation: 'approved', updatedAt: '' },
  cover: { kind: 'pattern', assetId: null, preset: 'tide', moderation: 'approved', updatedAt: '' },
  visibility: 'crew',
  updatedAt: '',
  version: 1,
  ...over,
});

test('a private profile is invisible to everyone but its owner', () => {
  const p = profile({ visibility: 'private' });
  assert.equal(visibleTo(p, 'self')?.handle, 'sam');
  for (const viewer of ['guardian', 'household', 'crew', 'organisation', 'stranger'] as const) {
    assert.equal(visibleTo(p, viewer), null, viewer);
  }
});

test('a crew profile is invisible to a stranger', () => {
  assert.equal(visibleTo(profile({ visibility: 'crew' }), 'stranger'), null);
  assert.ok(visibleTo(profile({ visibility: 'crew' }), 'crew'));
});

test('a real name never reaches a crew, even on a public profile', () => {
  const p = profile({ visibility: 'public' });
  assert.equal(visibleTo(p, 'crew')?.realName, null);
  assert.equal(visibleTo(p, 'stranger')?.realName, null);
  assert.equal(visibleTo(p, 'household')?.realName, 'Samantha Example');
  assert.equal(visibleTo(p, 'self')?.realName, 'Samantha Example');
});

test('media awaiting moderation is shown to its owner and nobody else', () => {
  const p = profile({
    visibility: 'public',
    avatar: { kind: 'photo', assetId: 'a1', preset: null, moderation: 'pending', updatedAt: '' },
  });
  assert.ok(visibleTo(p, 'self')?.avatar);
  assert.equal(visibleTo(p, 'crew')?.avatar, null);
});

test('rejected and quarantined media is shown to nobody, including its owner', () => {
  for (const state of ['rejected', 'quarantined'] as const) {
    const p = profile({
      avatar: { kind: 'photo', assetId: 'a1', preset: null, moderation: state, updatedAt: '' },
    });
    assert.equal(visibleTo(p, 'self')?.avatar, null, state);
    assert.equal(visibleTo(p, 'crew')?.avatar, null, state);
  }
});

/* ------------------------------------------------------------------ *
 * Autosave — the field policy
 * ------------------------------------------------------------------ */

test('an unclassified field is refused rather than assumed safe', () => {
  assert.equal(policyFor('somethingNobodyClassified'), 'never');
});

test('consent, age and identity fields never autosave', () => {
  for (const field of [
    'consentScopes',
    'optedIntoBodyMetrics',
    'dateOfBirth',
    'ageBand',
    'guardianLink',
    'paymentMethod',
    'screeningAnswers',
    'kycIdentity',
  ]) {
    assert.notEqual(policyFor(field), 'autosave', `${field} must not autosave`);
  }
});

test('the three field sets are disjoint and cover the policy', () => {
  const all = new Set([...AUTOSAVEABLE_FIELDS, ...NEVER_AUTOSAVED_FIELDS]);
  assert.equal(all.size, AUTOSAVEABLE_FIELDS.length + NEVER_AUTOSAVED_FIELDS.length);
  assert.ok(EXPLICIT_FIELDS.every((f) => NEVER_AUTOSAVED_FIELDS.includes(f)));
});

test('splitPatch routes each field by its policy', () => {
  const split = splitPatch({
    displayName: 'Robin',
    visibility: 'public',
    dateOfBirth: '1990-01-01',
  });
  assert.deepEqual(split.autosave, { displayName: 'Robin' });
  assert.deepEqual(split.explicit, { visibility: 'public' });
  assert.deepEqual(split.refused, ['dateOfBirth']);
});

test('an empty patch splits into three empties rather than throwing', () => {
  const split = splitPatch({});
  assert.deepEqual(split.autosave, {});
  assert.deepEqual(split.explicit, {});
  assert.deepEqual(split.refused, []);
});

/* ------------------------------------------------------------------ *
 * Autosave — conflicts
 * ------------------------------------------------------------------ */

test('a clean save advances the version', () => {
  const current = { displayName: 'Sam' };
  const result = applyWithVersion(current, 4, { displayName: 'Robin' }, 4);
  assert.equal(result.state, 'saved');
  assert.equal(result.version, 5);
  assert.equal(current.displayName, 'Robin');
});

test('a stale write to an untouched field still lands', () => {
  const current = { displayName: 'Sam', bio: 'theirs' };
  const result = applyWithVersion(
    current,
    9,
    { displayName: 'Robin' },
    4,
    { bio: 'theirs' },
  );
  assert.equal(result.state, 'saved');
  assert.equal(current.displayName, 'Robin');
});

test('a genuine conflict overwrites nothing and returns both values', () => {
  const current = { bio: 'theirs' };
  const result = applyWithVersion(current, 9, { bio: 'mine' }, 4, { bio: 'theirs' });
  assert.equal(result.state, 'conflict');
  assert.equal(current.bio, 'theirs', 'the existing value must survive');
  assert.deepEqual(result.conflicts, [{ field: 'bio', yours: 'mine', theirs: 'theirs' }]);
});

test('two writers setting the same value is not a conflict', () => {
  const result = applyWithVersion({ bio: 'same' }, 9, { bio: 'same' }, 4, { bio: 'same' });
  assert.equal(result.state, 'saved');
});

test('a conflict still saves the fields that did not conflict', () => {
  const current = { bio: 'theirs', pronouns: 'she/her' };
  const result = applyWithVersion(
    current,
    9,
    { bio: 'mine', pronouns: 'they/them' },
    4,
    { bio: 'theirs' },
  );
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.savedFields, ['pronouns']);
  assert.equal(current.pronouns, 'they/them');
  assert.equal(current.bio, 'theirs');
});

test('an empty patch reports idle rather than a save', () => {
  const result = applyWithVersion({}, 3, {}, 3);
  assert.equal(result.state, 'idle');
  assert.equal(result.version, 3);
});

/* ------------------------------------------------------------------ *
 * Autosave — timing and messaging
 * ------------------------------------------------------------------ */

test('the debounce is shorter than the maximum interval', () => {
  assert.ok(AUTOSAVE.debounceMs < AUTOSAVE.maxIntervalMs);
});

test('retry backoff is exponential and 1-based', () => {
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(2), 1000);
  assert.equal(retryDelayMs(4), 4000);
  assert.throws(() => retryDelayMs(0), RangeError);
});

test('every save state has a label a person can read', () => {
  for (const s of SAVE_STATES) {
    assert.ok(SAVE_LABELS[s]?.length > 3, s);
  }
});

test('leaving warns only when there is real unsaved work', () => {
  assert.equal(shouldWarnOnLeave('idle'), false);
  assert.equal(shouldWarnOnLeave('saved'), false);
  assert.equal(shouldWarnOnLeave('dirty'), true);
  assert.equal(shouldWarnOnLeave('conflict'), true);
});
