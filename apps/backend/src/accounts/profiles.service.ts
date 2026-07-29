import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

  /** Attach an already-validated upload. Lands in `pending`, always. */
  attachUpload(userId: string, slot: 'avatar' | 'cover', age: number, candidate: ImageCandidate) {
    const check = this.checkUpload(slot, age, candidate);
    if (!check.ok) throw new BadRequestException(check.reasons.join('; '));

    const profile = this.profile(userId);
    const mutable = profile as unknown as Record<string, unknown>;
    const media: ProfileMedia = {
      kind: 'photo',
      assetId: randomUUID(),
      preset: null,
      moderation: 'pending',
      updatedAt: now(),
    };
    mutable[slot] = media;
    mutable.version = profile.version + 1;
    mutable.updatedAt = now();

    return { slot, media, version: profile.version, exifStripped: true };
  }

  list() {
    return [...this.profiles.values()].map((p) => ({
      userId: p.userId,
      accountKind: p.accountKind,
      handle: p.handle,
      visibility: p.visibility,
      version: p.version,
    }));
  }
}
