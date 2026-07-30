/**
 * Accounts, profiles and profile media.
 *
 * `ACCOUNT_TYPES` in core-concepts.ts already describes the customer
 * *segment* a person belongs to. This module is about identity: what kind
 * of account somebody holds, what they may do, what their profile may
 * contain, and who may see it. The names are deliberately different —
 * `ACCOUNT_KINDS` here, `ACCOUNT_TYPES` there.
 *
 * The whole file is shaped by one problem. This platform serves
 * ten-year-olds and eighty-year-olds from one engine, and profile pictures
 * are the single highest-risk feature in it. A photograph of a child,
 * visible outside their household, carrying location data in its EXIF, on
 * a service with team challenges, is the failure mode that ends products.
 *
 * So `profilePolicy(age)` is the gate, it is called by everything that can
 * surface a profile, and below 18 it does not consult a consent flag —
 * exactly like `bodySurfacePolicy`. Consent cannot unlock a photographic
 * avatar for a twelve-year-old, because there is no version of that
 * consent that makes it safe.
 */

/* ------------------------------------------------------------------ *
 * Account kinds
 * ------------------------------------------------------------------ */

export const ACCOUNT_KINDS = [
  'adult',
  'minor',
  'guardian',
  'household_owner',
  'organisation_admin',
  'organisation_member',
  'professional',
  'growth_partner',
  'support_agent',
  'platform_staff',
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export interface AccountKindDefinition {
  readonly kind: AccountKind;
  readonly label: string;
  readonly summary: string;
  /** Must have a linked, verified guardian before the account activates. */
  readonly requiresGuardian: boolean;
  /** May hold a payment method and be charged. */
  readonly canTransact: boolean;
  /** May see cohort reporting. Never individual-level. */
  readonly seesCohortReporting: boolean;
  /** Verification required before the account leaves `pending`. */
  readonly verification: readonly string[];
}

export const ACCOUNT_KIND_DEFINITIONS: Readonly<
  Record<AccountKind, AccountKindDefinition>
> = {
  adult: {
    kind: 'adult',
    label: 'Adult',
    summary: 'A person aged 18 or over using the product for themselves.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: false,
    verification: ['email', 'age band'],
  },
  minor: {
    kind: 'minor',
    label: 'Minor',
    summary:
      'A person aged 10 to 17. Cannot transact, cannot be shown body metrics, and cannot ' +
      'activate without a linked guardian.',
    requiresGuardian: true,
    canTransact: false,
    seesCohortReporting: false,
    verification: ['guardian consent', 'age band'],
  },
  guardian: {
    kind: 'guardian',
    label: 'Guardian',
    summary:
      'An adult responsible for one or more minor accounts. Sees a defined summary, never a ' +
      'live feed, and the minor is told what the guardian can see.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: false,
    verification: ['email', 'identity check', 'relationship attestation'],
  },
  household_owner: {
    kind: 'household_owner',
    label: 'Household owner',
    summary: 'The adult who holds the Family plan and manages its seats.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: false,
    verification: ['email', 'payment method'],
  },
  organisation_admin: {
    kind: 'organisation_admin',
    label: 'Organisation admin',
    summary:
      'Manages seats and sees k-anonymous cohort reporting. There is no individual view to ' +
      'grant — it does not exist in the type system.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: true,
    verification: ['work email', 'organisation verification'],
  },
  organisation_member: {
    kind: 'organisation_member',
    label: 'Organisation member',
    summary: 'An employee on an organisation seat. Their individual data is never visible to the organisation.',
    requiresGuardian: false,
    canTransact: false,
    seesCohortReporting: false,
    verification: ['work email'],
  },
  professional: {
    kind: 'professional',
    label: 'Clinical or fitness professional',
    summary:
      'Physiotherapists, occupational therapists, trainers. They advise; the product never ' +
      'prescribes on their behalf.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: false,
    verification: ['email', 'professional registration number'],
  },
  growth_partner: {
    kind: 'growth_partner',
    label: 'Growth partner',
    summary: 'Referrers and approved influencers. KYC is required before any payout.',
    requiresGuardian: false,
    canTransact: true,
    seesCohortReporting: false,
    verification: ['email', 'KYC before first payout'],
  },
  support_agent: {
    kind: 'support_agent',
    label: 'Support agent',
    summary: 'Answers tickets. Every record they open is written to the audit log.',
    requiresGuardian: false,
    canTransact: false,
    seesCohortReporting: true,
    verification: ['SSO', 'background check'],
  },
  platform_staff: {
    kind: 'platform_staff',
    label: 'Platform staff',
    summary:
      'Engineering and clinical staff. Elevated access is time-boxed and audited, and no role ' +
      'lifts the safeguarding rules.',
    requiresGuardian: false,
    canTransact: false,
    seesCohortReporting: true,
    verification: ['SSO', 'hardware key', 'background check'],
  },
};

/** Account lifecycle. `pending` cannot use the product. */
export const ACCOUNT_STATES = [
  'pending',
  'active',
  'suspended',
  'locked',
  'closing',
  'closed',
] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const ACCOUNT_STATE_TRANSITIONS: Readonly<
  Record<AccountState, readonly AccountState[]>
> = {
  pending: ['active', 'closed'],
  active: ['suspended', 'locked', 'closing'],
  suspended: ['active', 'closing'],
  locked: ['active', 'closing'],
  closing: ['active', 'closed'],
  closed: [],
};

export function canTransitionAccount(from: AccountState, to: AccountState): boolean {
  return ACCOUNT_STATE_TRANSITIONS[from].includes(to);
}

/**
 * `closing` is a 30-day grace period, not a delete. It exists because
 * account closure is the one irreversible action a person can take while
 * upset, and a month to change their mind costs us nothing.
 */
export const CLOSURE_GRACE_DAYS = 30;

/* ------------------------------------------------------------------ *
 * Visibility
 * ------------------------------------------------------------------ */

export const PROFILE_VISIBILITY = [
  'private',
  'household',
  'crew',
  'organisation',
  'public',
] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY)[number];

/** Ordered from most closed to most open. Used to clamp, not to compare strings. */
const VISIBILITY_RANK: Readonly<Record<ProfileVisibility, number>> = {
  private: 0,
  household: 1,
  crew: 2,
  organisation: 3,
  public: 4,
};

export function clampVisibility(
  requested: ProfileVisibility,
  ceiling: ProfileVisibility,
): ProfileVisibility {
  return VISIBILITY_RANK[requested] <= VISIBILITY_RANK[ceiling] ? requested : ceiling;
}

/* ------------------------------------------------------------------ *
 * Profile media
 * ------------------------------------------------------------------ */

export const AVATAR_KINDS = ['photo', 'illustrated', 'initials', 'none'] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

export const COVER_KINDS = ['photo', 'pattern', 'none'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export interface ImageConstraint {
  readonly maxBytes: number;
  readonly minPx: number;
  readonly maxPx: number;
  /** width ÷ height, with the tolerance the cropper is allowed. */
  readonly aspect: number;
  readonly aspectTolerance: number;
}

export const AVATAR_CONSTRAINT: ImageConstraint = {
  maxBytes: 5 * 1024 * 1024,
  minPx: 200,
  maxPx: 4096,
  aspect: 1,
  aspectTolerance: 0.02,
};

export const COVER_CONSTRAINT: ImageConstraint = {
  maxBytes: 10 * 1024 * 1024,
  minPx: 600,
  maxPx: 6000,
  aspect: 3,
  aspectTolerance: 0.15,
};

/**
 * The curated sets. A minor gets a real, chosen identity rather than a
 * greyed-out upload button — being told "no" is worse than being offered
 * something good.
 */
export const ILLUSTRATED_AVATARS = [
  'comet', 'fern', 'heron', 'kite', 'lantern', 'meadow', 'orbit', 'pebble',
  'quartz', 'ripple', 'summit', 'thistle', 'vale', 'willow',
] as const;

export const COVER_PATTERNS = [
  'aurora', 'contour', 'dawn', 'grid', 'harbour', 'meridian', 'ridge', 'tide',
] as const;

/**
 * EXIF is stripped from every upload before it is stored, and this is not
 * configurable. A phone photograph carries the coordinates it was taken
 * at; on a child's profile picture that is a home address.
 */
export const STRIPPED_ON_UPLOAD = [
  'GPS coordinates',
  'device serial number',
  'owner and artist name',
  'original date and time',
  'thumbnail (which can differ from the image)',
] as const;

export const MODERATION_STATES = [
  'pending',
  'approved',
  'rejected',
  'quarantined',
] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

export class ImageRejectedError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(`image rejected: ${reasons.join('; ')}`);
    this.name = 'ImageRejectedError';
  }
}

export interface ImageCandidate {
  readonly mimeType: string;
  readonly bytes: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface ImageCheck {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export function checkImage(
  candidate: ImageCandidate,
  constraint: ImageConstraint,
): ImageCheck {
  const reasons: string[] = [];

  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(candidate.mimeType)) {
    reasons.push(
      `${candidate.mimeType} is not accepted — use ${IMAGE_MIME_TYPES.join(', ')}`,
    );
  }
  if (candidate.bytes > constraint.maxBytes) {
    reasons.push(
      `${(candidate.bytes / 1024 / 1024).toFixed(1)}MB exceeds the ` +
        `${(constraint.maxBytes / 1024 / 1024).toFixed(0)}MB limit`,
    );
  }
  if (candidate.bytes <= 0) reasons.push('the file is empty');

  const shortest = Math.min(candidate.widthPx, candidate.heightPx);
  const longest = Math.max(candidate.widthPx, candidate.heightPx);
  if (shortest < constraint.minPx) {
    reasons.push(`at least ${constraint.minPx}px on the shortest side`);
  }
  if (longest > constraint.maxPx) {
    reasons.push(`no more than ${constraint.maxPx}px on the longest side`);
  }

  if (candidate.heightPx > 0) {
    const aspect = candidate.widthPx / candidate.heightPx;
    if (Math.abs(aspect - constraint.aspect) > constraint.aspectTolerance) {
      reasons.push(
        `aspect ratio ${aspect.toFixed(2)} is outside ${constraint.aspect}` +
          ` ±${constraint.aspectTolerance}`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function assertImage(candidate: ImageCandidate, constraint: ImageConstraint): void {
  const result = checkImage(candidate, constraint);
  if (!result.ok) throw new ImageRejectedError(result.reasons);
}

/* ------------------------------------------------------------------ *
 * The profile policy — the gate
 * ------------------------------------------------------------------ */

export interface ProfilePolicy {
  readonly avatarKinds: readonly AvatarKind[];
  readonly coverKinds: readonly CoverKind[];
  /** The most open visibility this person may choose. */
  readonly visibilityCeiling: ProfileVisibility;
  readonly defaultVisibility: ProfileVisibility;
  /** Real name may be collected and shown. */
  readonly realNameAllowed: boolean;
  readonly bioAllowed: boolean;
  readonly bioMaxLength: number;
  /** Uploaded media must be approved before anybody else can see it. */
  readonly mediaRequiresModeration: boolean;
  /** A guardian must approve profile changes before they take effect. */
  readonly guardianApproval: boolean;
  readonly reason: string;
}

/** Below this age a guardian approves profile changes, not just the account. */
export const GUARDIAN_APPROVAL_UNDER = 13;

/**
 * The single gate. Every path that can surface or accept a profile calls
 * this, and below 18 it takes no consent argument at all — there is
 * nothing to pass, so there is no branch where a truthy value in the wrong
 * field unlocks a child's photograph.
 */
export function profilePolicy(age: number): ProfilePolicy {
  if (!Number.isFinite(age) || age < 0) {
    throw new RangeError('a profile policy needs a real age');
  }

  if (age < GUARDIAN_APPROVAL_UNDER) {
    return {
      avatarKinds: ['illustrated', 'initials', 'none'],
      coverKinds: ['pattern', 'none'],
      visibilityCeiling: 'crew',
      defaultVisibility: 'household',
      realNameAllowed: false,
      bioAllowed: false,
      bioMaxLength: 0,
      mediaRequiresModeration: true,
      guardianApproval: true,
      reason:
        'Under 13: no photograph, no real name, no free-text bio, and a guardian approves ' +
        'every change. Illustrated avatars and patterned covers are offered instead, so the ' +
        'account still has an identity.',
    };
  }

  if (age < 18) {
    return {
      avatarKinds: ['illustrated', 'initials', 'none'],
      coverKinds: ['pattern', 'none'],
      visibilityCeiling: 'crew',
      defaultVisibility: 'crew',
      realNameAllowed: false,
      bioAllowed: true,
      bioMaxLength: 160,
      mediaRequiresModeration: true,
      guardianApproval: false,
      reason:
        '13 to 17: a chosen display name and a short moderated bio, but still no photographic ' +
        'avatar and never public visibility. A photograph of a minor on a service with team ' +
        'challenges is a risk no consent setting makes acceptable.',
    };
  }

  return {
    avatarKinds: ['photo', 'illustrated', 'initials', 'none'],
    coverKinds: ['photo', 'pattern', 'none'],
    visibilityCeiling: 'public',
    defaultVisibility: 'crew',
    realNameAllowed: true,
    bioAllowed: true,
    bioMaxLength: 400,
    mediaRequiresModeration: true,
    guardianApproval: false,
    reason: 'Adult: photographic avatar and cover, any visibility, moderation still applies.',
  };
}

/* ------------------------------------------------------------------ *
 * The profile itself
 * ------------------------------------------------------------------ */

export interface ProfileMedia {
  readonly kind: AvatarKind | CoverKind;
  /** Set for uploads. Null when the kind is illustrated, pattern, initials or none. */
  readonly assetId: string | null;
  /** Where the stored object is served from. Only uploads have one. */
  readonly url?: string | null;
  /** Set for curated choices. Null for uploads. */
  readonly preset: string | null;
  readonly moderation: ModerationState;
  readonly updatedAt: string;
}

export interface Profile {
  readonly userId: string;
  readonly accountKind: AccountKind;
  readonly displayName: string;
  readonly handle: string;
  readonly pronouns: string | null;
  readonly realName: string | null;
  readonly bio: string | null;
  readonly locale: string;
  readonly timezone: string;
  readonly avatar: ProfileMedia;
  readonly cover: ProfileMedia;
  readonly visibility: ProfileVisibility;
  readonly updatedAt: string;
  /** Bumped on every accepted write. Autosave uses it to detect conflicts. */
  readonly version: number;
}

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_]{1,28})[a-z0-9]$/;
export const DISPLAY_NAME_MAX = 40;

/** Handles that would let somebody impersonate the platform or a role. */
export const RESERVED_HANDLES: readonly string[] = [
  'admin', 'administrator', 'support', 'help', 'jessmove', 'jess_move', 'jess',
  'mova', 'staff', 'team', 'official', 'moderator', 'security', 'billing',
  'safeguarding', 'clinical', 'root', 'system', 'api',
];

export function handleAvailable(handle: string, taken: readonly string[] = []): boolean {
  const h = handle.toLowerCase();
  if (!HANDLE_PATTERN.test(h)) return false;
  if (RESERVED_HANDLES.includes(h)) return false;
  return !taken.map((t) => t.toLowerCase()).includes(h);
}

export class ProfileRejectedError extends Error {
  constructor(readonly reasons: readonly string[]) {
    super(`profile rejected: ${reasons.join('; ')}`);
    this.name = 'ProfileRejectedError';
  }
}

export interface ProfilePatch {
  displayName?: string;
  handle?: string;
  pronouns?: string | null;
  realName?: string | null;
  bio?: string | null;
  locale?: string;
  timezone?: string;
  visibility?: ProfileVisibility;
  avatarKind?: AvatarKind;
  avatarPreset?: string | null;
  coverKind?: CoverKind;
  coverPreset?: string | null;
}

export interface ProfileValidation {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  /** What the patch becomes once the policy has clamped it. */
  readonly applied: ProfilePatch;
  readonly clamped: readonly string[];
  readonly needsGuardianApproval: boolean;
}

/**
 * Validates a patch against the policy for this age.
 *
 * Two different outcomes, deliberately: a field the policy forbids is a
 * **rejection**, and a field the policy merely limits is **clamped** and
 * reported. Asking for `public` at fifteen is a mistake to correct
 * silently; uploading a photograph at fifteen is a refusal that needs
 * saying out loud.
 */
export function validateProfilePatch(
  patch: ProfilePatch,
  age: number,
  takenHandles: readonly string[] = [],
): ProfileValidation {
  const policy = profilePolicy(age);
  const reasons: string[] = [];
  const clamped: string[] = [];
  const applied: ProfilePatch = { ...patch };

  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (name.length < 2) reasons.push('a display name needs at least two characters');
    if (name.length > DISPLAY_NAME_MAX) {
      reasons.push(`a display name is at most ${DISPLAY_NAME_MAX} characters`);
    }
    applied.displayName = name;
  }

  if (patch.handle !== undefined) {
    const handle = patch.handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) {
      reasons.push(
        'a handle is 3 to 30 characters, lowercase letters, numbers and underscores, ' +
          'starting and ending with a letter or number',
      );
    } else if (RESERVED_HANDLES.includes(handle)) {
      reasons.push(`"${handle}" is reserved`);
    } else if (takenHandles.map((t) => t.toLowerCase()).includes(handle)) {
      reasons.push(`"${handle}" is already taken`);
    }
    applied.handle = handle;
  }

  if (patch.realName != null && patch.realName !== '' && !policy.realNameAllowed) {
    reasons.push('a real name is not collected below 18');
    applied.realName = null;
  }

  if (patch.bio != null && patch.bio !== '') {
    if (!policy.bioAllowed) {
      reasons.push('a free-text bio is not available below 13');
      applied.bio = null;
    } else if (patch.bio.length > policy.bioMaxLength) {
      reasons.push(`a bio is at most ${policy.bioMaxLength} characters at this age`);
    }
  }

  if (patch.visibility !== undefined) {
    const allowed = clampVisibility(patch.visibility, policy.visibilityCeiling);
    if (allowed !== patch.visibility) {
      clamped.push(
        `visibility ${patch.visibility} → ${allowed} (ceiling at this age is ` +
          `${policy.visibilityCeiling})`,
      );
    }
    applied.visibility = allowed;
  }

  if (patch.avatarKind !== undefined && !policy.avatarKinds.includes(patch.avatarKind)) {
    reasons.push(
      `a ${patch.avatarKind} avatar is not available at this age — ` +
        `${policy.avatarKinds.join(', ')} are`,
    );
  }
  if (patch.coverKind !== undefined && !policy.coverKinds.includes(patch.coverKind)) {
    reasons.push(
      `a ${patch.coverKind} cover is not available at this age — ` +
        `${policy.coverKinds.join(', ')} are`,
    );
  }

  if (
    patch.avatarPreset != null &&
    !(ILLUSTRATED_AVATARS as readonly string[]).includes(patch.avatarPreset)
  ) {
    reasons.push(`"${patch.avatarPreset}" is not one of the illustrated avatars`);
  }
  if (
    patch.coverPreset != null &&
    !(COVER_PATTERNS as readonly string[]).includes(patch.coverPreset)
  ) {
    reasons.push(`"${patch.coverPreset}" is not one of the cover patterns`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    applied,
    clamped,
    needsGuardianApproval: policy.guardianApproval,
  };
}

/**
 * What another account may see. The viewer's relationship decides, and a
 * profile is never more visible than its own setting.
 */
export type ViewerRelationship =
  | 'self'
  | 'guardian'
  | 'household'
  | 'crew'
  | 'organisation'
  | 'stranger';

export interface VisibleProfile {
  readonly displayName: string;
  readonly handle: string;
  readonly pronouns: string | null;
  readonly bio: string | null;
  readonly avatar: ProfileMedia | null;
  readonly cover: ProfileMedia | null;
  readonly realName: string | null;
}

const RELATIONSHIP_RANK: Readonly<Record<ViewerRelationship, number>> = {
  self: 5,
  guardian: 4,
  household: 3,
  crew: 2,
  organisation: 1,
  stranger: 0,
};

const VISIBILITY_REQUIRES: Readonly<Record<ProfileVisibility, number>> = {
  private: 5,
  household: 3,
  crew: 2,
  organisation: 1,
  public: 0,
};

/**
 * Media that has not been approved is shown to its owner and to nobody
 * else. A rejected image is never shown to anyone, including the owner,
 * as an image — the owner is told it was rejected instead.
 */
export function visibleTo(
  profile: Profile,
  viewer: ViewerRelationship,
): VisibleProfile | null {
  const canSee = RELATIONSHIP_RANK[viewer] >= VISIBILITY_REQUIRES[profile.visibility];
  if (!canSee) return null;

  const isOwner = viewer === 'self';
  const mediaFor = (m: ProfileMedia): ProfileMedia | null => {
    if (m.moderation === 'approved') return m;
    if (m.moderation === 'pending' && isOwner) return m;
    return null;
  };

  return {
    displayName: profile.displayName,
    handle: profile.handle,
    pronouns: profile.pronouns,
    bio: profile.bio,
    avatar: mediaFor(profile.avatar),
    cover: mediaFor(profile.cover),
    // A real name reaches self, guardian and household. Never a crew.
    realName: RELATIONSHIP_RANK[viewer] >= RELATIONSHIP_RANK.household
      ? profile.realName
      : null,
  };
}
