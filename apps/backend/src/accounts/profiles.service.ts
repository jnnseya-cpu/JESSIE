import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { StorageService } from '../storage/storage.service';
import { sniffImage, stripImageMetadata } from '../storage/image-bytes';
import {
  ACCOUNT_KIND_DEFINITIONS,
  AVATAR_CONSTRAINT,
  COVER_CONSTRAINT,
  COVER_PATTERNS,
  ILLUSTRATED_AVATARS,
  applyWithVersion,
  checkImage,
  profilePolicy,
  splitPatch,
  validateProfilePatch,
  visibleTo,
  type AccountKind,
  type ImageCandidate,
  type Profile,
  type ProfileMedia,
  type ProfilePatch,
  type SaveResult,
  type ViewerRelationship,
} from '@jessmove/shared';

/**
 * Profiles, media and the autosave path.
 *
 * Three things this service is careful about.
 *
 * **Age is an argument, never an inference.** Every write takes the
 * verified age and passes it to `profilePolicy`. There is no default and
 * no "if unknown, assume adult" — an absent age is a 400.
 *
 * **Autosave and explicit are different endpoints.** `autosave` refuses
 * anything the field policy does not classify as autosaveable, so a client
 * bug cannot quietly persist a consent toggle. `commit` accepts explicit
 * fields and is the only path that does.
 *
 * **Uploaded media starts pending.** Nothing photographic is visible to
 * anyone but its owner until it is approved, and below 18 the moderation
 * step is not optional at all.
 */

export interface Account {
  userId: string;
  kind: AccountKind;
  age: number;
  guardianId: string | null;
  createdAt: string;
}

const now = (): string => new Date().toISOString();

const emptyMedia = (kind: ProfileMedia['kind']): ProfileMedia => ({
  kind,
  assetId: null,
  preset: null,
  moderation: 'approved',
  updatedAt: now(),
});

@Injectable()
export class ProfilesService {
  constructor(private readonly storage: StorageService) {}

  private readonly accounts = new Map<string, Account>();
  private readonly profiles = new Map<string, Profile>();
  /** Field-level record of what has changed since a given version. */
  private readonly changeLog = new Map<string, { version: number; field: string; value: unknown }[]>();

  createAccount(userId: string, kind: AccountKind, age: number, guardianId?: string): Account {
    if (this.accounts.has(userId)) {
      throw new BadRequestException(`account "${userId}" already exists`);
    }
    const definition = ACCOUNT_KIND_DEFINITIONS[kind];
    if (definition.requiresGuardian && !guardianId) {
      throw new BadRequestException(
        `a ${definition.label} account cannot activate without a linked guardian`,
      );
    }
    if (age < 18 && kind !== 'minor') {
      throw new BadRequestException(
        `a person under 18 holds a minor account, not ${kind} — the account kind cannot be used to route around the age rules`,
      );
    }
    if (age >= 18 && kind === 'minor') {
      throw new BadRequestException('a minor account requires an age under 18');
    }

    const account: Account = {
      userId,
      kind,
      age,
      guardianId: guardianId ?? null,
      createdAt: now(),
    };
    this.accounts.set(userId, account);

    const policy = profilePolicy(age);
    this.profiles.set(userId, {
      userId,
      accountKind: kind,
      displayName: userId,
      handle: userId.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
      pronouns: null,
      realName: null,
      bio: null,
      locale: 'en-GB',
      timezone: 'Europe/London',
      avatar: { ...emptyMedia('initials') },
      cover: { ...emptyMedia('pattern'), preset: COVER_PATTERNS[0] },
      visibility: policy.defaultVisibility,
      updatedAt: now(),
      version: 1,
    });
    this.changeLog.set(userId, []);

    return account;
  }

  account(userId: string): Account {
    const account = this.accounts.get(userId);
    if (!account) throw new NotFoundException(`no account "${userId}"`);
    return account;
  }

  profile(userId: string): Profile {
    const profile = this.profiles.get(userId);
    if (!profile) throw new NotFoundException(`no profile for "${userId}"`);
    return profile;
  }

  /** What a given viewer would actually see. The demo behind the policy. */
  asSeenBy(userId: string, viewer: ViewerRelationship) {
    const profile = this.profile(userId);
    return {
      viewer,
      visibility: profile.visibility,
      profile: visibleTo(profile, viewer),
      hidden: visibleTo(profile, viewer) === null,
    };
  }

  private takenHandles(exceptUserId: string): string[] {
    return [...this.profiles.values()]
      .filter((p) => p.userId !== exceptUserId)
      .map((p) => p.handle);
  }

  private changedSince(userId: string, version: number): Record<string, unknown> {
    const entries = this.changeLog.get(userId) ?? [];
    const out: Record<string, unknown> = {};
    for (const entry of entries) {
      if (entry.version > version) out[entry.field] = entry.value;
    }
    return out;
  }

  private write(
    userId: string,
    patch: ProfilePatch,
    basedOnVersion: number,
  ): SaveResult {
    const profile = this.profile(userId);
    const mutable = profile as unknown as Record<string, unknown>;

    // Media kind and preset live on nested objects; flatten them for the
    // version-aware apply, then fold them back afterwards.
    const flat: Record<string, unknown> = { ...patch };
    delete flat.avatarKind;
    delete flat.avatarPreset;
    delete flat.coverKind;
    delete flat.coverPreset;

    const result = applyWithVersion(
      mutable,
      profile.version,
      flat,
      basedOnVersion,
      this.changedSince(userId, basedOnVersion),
    );

    const mediaTouched: string[] = [];
    if (patch.avatarKind !== undefined || patch.avatarPreset !== undefined) {
      mutable.avatar = {
        kind: patch.avatarKind ?? profile.avatar.kind,
        assetId: patch.avatarKind === 'photo' ? profile.avatar.assetId : null,
        preset: patch.avatarPreset ?? (patch.avatarKind === 'illustrated' ? profile.avatar.preset : null),
        moderation: patch.avatarKind === 'photo' ? 'pending' : 'approved',
        updatedAt: now(),
      } satisfies ProfileMedia;
      mediaTouched.push('avatar');
    }
    if (patch.coverKind !== undefined || patch.coverPreset !== undefined) {
      mutable.cover = {
        kind: patch.coverKind ?? profile.cover.kind,
        assetId: patch.coverKind === 'photo' ? profile.cover.assetId : null,
        preset: patch.coverPreset ?? (patch.coverKind === 'pattern' ? profile.cover.preset : null),
        moderation: patch.coverKind === 'photo' ? 'pending' : 'approved',
        updatedAt: now(),
      } satisfies ProfileMedia;
      mediaTouched.push('cover');
    }

    const saved = [...result.savedFields, ...mediaTouched];
    if (saved.length > 0 && result.state !== 'conflict') {
      const version = profile.version + 1;
      mutable.version = version;
      mutable.updatedAt = now();
      const log = this.changeLog.get(userId) ?? [];
      for (const field of saved) log.push({ version, field, value: mutable[field] });
      this.changeLog.set(userId, log);
      return { ...result, state: 'saved', version, savedFields: saved };
    }

    return result;
  }

  /**
   * The autosave path. Anything not classified as autosaveable is refused
   * here rather than silently written — that refusal is the whole point of
   * the field policy existing.
   */
  autosave(userId: string, age: number, patch: Record<string, unknown>, basedOnVersion: number) {
    const account = this.accounts.get(userId);
    if (account && account.age !== age) {
      throw new BadRequestException(
        'the age sent does not match the verified age on this account',
      );
    }

    const split = splitPatch(patch);
    if (split.refused.length > 0) {
      throw new BadRequestException(
        `these fields are not editable here: ${split.refused.join(', ')}`,
      );
    }
    if (Object.keys(split.explicit).length > 0) {
      throw new BadRequestException(
        `these fields need a confirmed submit rather than autosave: ` +
          `${Object.keys(split.explicit).join(', ')}`,
      );
    }

    const validation = validateProfilePatch(
      split.autosave as ProfilePatch,
      age,
      this.takenHandles(userId),
    );
    if (!validation.ok) throw new BadRequestException(validation.reasons.join('; '));

    const result = this.write(userId, validation.applied, basedOnVersion);
    return { ...result, clamped: validation.clamped, needsGuardianApproval: validation.needsGuardianApproval };
  }

  /** The confirmed path. The only one that accepts `explicit` fields. */
  commit(userId: string, age: number, patch: Record<string, unknown>, basedOnVersion: number) {
    const split = splitPatch(patch);
    if (split.refused.length > 0) {
      throw new BadRequestException(
        `these fields are not editable here: ${split.refused.join(', ')}`,
      );
    }

    const merged = { ...split.autosave, ...split.explicit };
    const validation = validateProfilePatch(
      merged as ProfilePatch,
      age,
      this.takenHandles(userId),
    );
    if (!validation.ok) throw new BadRequestException(validation.reasons.join('; '));

    const result = this.write(userId, validation.applied, basedOnVersion);
    return {
      ...result,
      clamped: validation.clamped,
      needsGuardianApproval: validation.needsGuardianApproval,
      note: validation.needsGuardianApproval
        ? 'Held for guardian approval before it becomes visible.'
        : undefined,
    };
  }

  /**
   * Validate an upload *before* the bytes are sent. Cheaper for the user
   * on a phone, and it lets the client explain the problem next to the
   * file picker rather than after a slow failed upload.
   */
  checkUpload(slot: 'avatar' | 'cover', age: number, candidate: ImageCandidate) {
    const policy = profilePolicy(age);
    const allowed = slot === 'avatar' ? policy.avatarKinds : policy.coverKinds;

    if (!(allowed as readonly string[]).includes('photo')) {
      return {
        ok: false,
        reasons: [
          `a photographic ${slot} is not available at this age`,
        ],
        allowedInstead: allowed,
        presets: slot === 'avatar' ? ILLUSTRATED_AVATARS : COVER_PATTERNS,
        policyReason: policy.reason,
      };
    }

    const constraint = slot === 'avatar' ? AVATAR_CONSTRAINT : COVER_CONSTRAINT;
    const check = checkImage(candidate, constraint);
    return {
      ...check,
      constraint,
      moderation: 'pending',
      note: 'EXIF is stripped on upload and is not configurable. Approved before anyone else sees it.',
    };
  }

  /**
   * The real upload. Dimensions are sniffed from the bytes rather than
   * taken from the client, metadata is stripped before storage, and the
   * result lands in `pending` moderation — always.
   */
  async attachUpload(
    userId: string,
    slot: 'avatar' | 'cover',
    age: number,
    mimeType: string,
    bytes: Buffer,
  ) {
    const sniffed = sniffImage(bytes);
    if (!sniffed.format) {
      throw new BadRequestException('that file is not a JPEG, PNG or WebP image');
    }
    const expected = `image/${sniffed.format}`;
    if (expected !== mimeType) {
      throw new BadRequestException(
        `the file's bytes say ${expected} but the declared type is ${mimeType} — refused, because a mismatch is how a disguised file gets in`,
      );
    }

    const check = this.checkUpload(slot, age, {
      mimeType,
      bytes: bytes.length,
      widthPx: sniffed.widthPx,
      heightPx: sniffed.heightPx,
    });
    if (!check.ok) throw new BadRequestException(check.reasons.join('; '));

    const stripped = stripImageMetadata(bytes);
    const key = randomUUID();
    const stored = await this.storage.put(key, stripped, mimeType);

    const profile = this.profile(userId);
    const mutable = profile as unknown as Record<string, unknown>;
    const media: ProfileMedia = {
      kind: 'photo',
      assetId: key,
      url: stored.url,
      preset: null,
      moderation: 'pending',
      updatedAt: now(),
    };
    mutable[slot] = media;
    mutable.version = profile.version + 1;
    mutable.updatedAt = now();

    return {
      slot,
      media,
      version: profile.version,
      storage: stored.driver,
      sniffed: { widthPx: sniffed.widthPx, heightPx: sniffed.heightPx, format: sniffed.format },
      bytesRemoved: bytes.length - stripped.length,
      exifStripped: true,
    };
  }

  /**
   * Deletes an account, its profile and its change log.
   *
   * A real deletion, not a flag — this is the developer reset, and a
   * "deleted" account that still occupies its handle makes testing
   * confusing. Production account closure is a different thing entirely:
   * a 30-day `closing` grace period, because closure is the one
   * irreversible action somebody takes while upset.
   */
  remove(userId: string): { removed: string; freedHandle: string | null } {
    const profile = this.profiles.get(userId);
    if (!this.accounts.has(userId) && !profile) {
      throw new NotFoundException(`no account "${userId}"`);
    }
    const handle = profile?.handle ?? null;
    this.accounts.delete(userId);
    this.profiles.delete(userId);
    this.changeLog.delete(userId);
    return { removed: userId, freedHandle: handle };
  }

  /** Wipes everything. Guarded at the controller, not here. */
  reset(): { removed: number } {
    const removed = this.accounts.size;
    this.accounts.clear();
    this.profiles.clear();
    this.changeLog.clear();
    return { removed };
  }

  /**
   * A demo cast — one account of every kind, so the platform can be tried
   * from each side without hand-rolling nine POSTs. Idempotent: existing
   * personas are left alone rather than erroring.
   */
  seed(): { created: string[]; existing: string[] } {
    const cast: { userId: string; kind: AccountKind; age: number; guardianId?: string }[] = [
      { userId: 'demo_admin', kind: 'platform_staff', age: 41 },
      { userId: 'demo_support', kind: 'support_agent', age: 33 },
      { userId: 'demo_adult', kind: 'adult', age: 34 },
      { userId: 'demo_later_life', kind: 'adult', age: 74 },
      { userId: 'demo_guardian', kind: 'guardian', age: 44 },
      { userId: 'demo_teen', kind: 'minor', age: 15, guardianId: 'demo_guardian' },
      { userId: 'demo_child', kind: 'minor', age: 11, guardianId: 'demo_guardian' },
      { userId: 'demo_household', kind: 'household_owner', age: 38 },
      { userId: 'demo_org_admin', kind: 'organisation_admin', age: 47 },
      { userId: 'demo_org_member', kind: 'organisation_member', age: 29 },
      { userId: 'demo_professional', kind: 'professional', age: 36 },
      { userId: 'demo_partner', kind: 'growth_partner', age: 31 },
    ];

    const created: string[] = [];
    const existing: string[] = [];

    for (const member of cast) {
      if (this.accounts.has(member.userId)) {
        existing.push(member.userId);
        continue;
      }
      this.createAccount(member.userId, member.kind, member.age, member.guardianId);
      created.push(member.userId);
    }

    return { created, existing };
  }

  list() {
    return [...this.profiles.values()].map((p) => ({
      userId: p.userId,
      accountKind: p.accountKind,
      age: this.accounts.get(p.userId)?.age ?? null,
      guardianId: this.accounts.get(p.userId)?.guardianId ?? null,
      displayName: p.displayName,
      handle: p.handle,
      visibility: p.visibility,
      avatar: p.avatar.kind,
      cover: p.cover.kind,
      version: p.version,
    }));
  }
}
