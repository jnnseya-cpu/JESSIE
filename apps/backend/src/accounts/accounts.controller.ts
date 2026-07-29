import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_DEFINITIONS,
  ACCOUNT_STATES,
  ACCOUNT_STATE_TRANSITIONS,
  AUTOSAVE,
  AUTOSAVEABLE_FIELDS,
  AVATAR_CONSTRAINT,
  AVATAR_KINDS,
  CLOSURE_GRACE_DAYS,
  COVER_CONSTRAINT,
  COVER_KINDS,
  COVER_PATTERNS,
  EXPLICIT_FIELDS,
  FIELD_POLICY,
  ILLUSTRATED_AVATARS,
  IMAGE_MIME_TYPES,
  MODERATION_STATES,
  PROFILE_VISIBILITY,
  RESERVED_HANDLES,
  SAVE_LABELS,
  STRIPPED_ON_UPLOAD,
  profilePolicy,
  type ViewerRelationship,
} from '@jessmove/shared';
import { CreateAccountDto, MediaCheckDto, SaveDto } from './accounts.dto';
import { ProfilesService } from './profiles.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly profiles: ProfilesService) {}

  /** Every account kind, what it may do and what verifies it. */
  @Get('kinds')
  kinds() {
    return {
      kinds: ACCOUNT_KINDS.map((k) => ACCOUNT_KIND_DEFINITIONS[k]),
      states: ACCOUNT_STATES,
      transitions: ACCOUNT_STATE_TRANSITIONS,
      closureGraceDays: CLOSURE_GRACE_DAYS,
    };
  }

  /** The profile policy for an age. The gate, exposed. */
  @Get('policy')
  policy(@Query('age') age?: string) {
    const value = Number(age);
    if (!Number.isFinite(value)) {
      return {
        note: 'Pass ?age= to resolve the policy. It is never inferred.',
        byAge: [11, 15, 18, 40, 75].map((a) => ({ age: a, ...profilePolicy(a) })),
      };
    }
    return { age: value, ...profilePolicy(value) };
  }

  /** Everything the media pipeline enforces, before anybody uploads. */
  @Get('media/rules')
  mediaRules() {
    return {
      avatar: { kinds: AVATAR_KINDS, constraint: AVATAR_CONSTRAINT, presets: ILLUSTRATED_AVATARS },
      cover: { kinds: COVER_KINDS, constraint: COVER_CONSTRAINT, presets: COVER_PATTERNS },
      acceptedTypes: IMAGE_MIME_TYPES,
      strippedOnUpload: STRIPPED_ON_UPLOAD,
      moderationStates: MODERATION_STATES,
      note:
        'EXIF stripping is not configurable. A phone photograph carries the coordinates it ' +
        'was taken at, which on a child’s profile picture is a home address.',
    };
  }

  /** The autosave contract, including what will never autosave. */
  @Get('autosave/policy')
  autosavePolicy() {
    return {
      timing: AUTOSAVE,
      fields: FIELD_POLICY,
      autosaveable: AUTOSAVEABLE_FIELDS,
      explicit: EXPLICIT_FIELDS,
      labels: SAVE_LABELS,
      unknownFieldBehaviour:
        'refused — a field nobody classified fails loudly rather than autosaving whatever it holds',
      note:
        'A consent toggle that saves itself 800ms after a mis-tap is not consent. Those ' +
        'fields require a confirmed submit.',
    };
  }

  @Get('visibility')
  visibility() {
    return {
      levels: PROFILE_VISIBILITY,
      reservedHandles: RESERVED_HANDLES,
      note: 'A real name reaches self, guardian and household. Never a crew.',
    };
  }

  @Post()
  create(@Body() body: CreateAccountDto) {
    return this.profiles.createAccount(body.userId, body.kind, body.age, body.guardianId);
  }

  @Get('profiles')
  list() {
    return this.profiles.list();
  }

  /**
   * Delete one account outright.
   *
   * This is the developer reset, not the product's account closure. Real
   * closure is a 30-day `closing` grace period — see ACCOUNT_STATE_TRANSITIONS
   * — because closing an account is the one irreversible thing somebody
   * does while upset, and a month to reconsider costs nothing.
   */
  @Delete('profiles/:userId')
  remove(@Param('userId') userId: string) {
    return this.profiles.remove(userId);
  }

  /**
   * Wipe every account.
   *
   * Refused when NODE_ENV is production unless ALLOW_ACCOUNT_RESET is
   * explicitly set. A reset endpoint that works in production is a reset
   * endpoint that eventually runs there.
   */
  @Post('reset')
  reset() {
    const production = process.env.NODE_ENV === 'production';
    const allowed = process.env.ALLOW_ACCOUNT_RESET === 'true';
    if (production && !allowed) {
      throw new BadRequestException(
        'refused in production — set ALLOW_ACCOUNT_RESET=true if you genuinely mean it',
      );
    }
    return { ...this.profiles.reset(), environment: process.env.NODE_ENV ?? 'development' };
  }

  /**
   * Create one account of every kind, so the platform can be tried from
   * each side. Idempotent — running it twice adds nothing.
   */
  @Post('seed')
  seed() {
    const result = this.profiles.seed();
    return {
      ...result,
      personas: this.profiles.list(),
      note:
        'Try any of these at /try on the site. There is no authentication yet, so this is a ' +
        'role-switching harness rather than a login.',
    };
  }

  @Get('profiles/:userId')
  one(@Param('userId') userId: string) {
    return this.profiles.profile(userId);
  }

  /** What a given viewer would actually see. */
  @Get('profiles/:userId/as/:viewer')
  as(@Param('userId') userId: string, @Param('viewer') viewer: ViewerRelationship) {
    return this.profiles.asSeenBy(userId, viewer);
  }

  @Post('profiles/:userId/autosave')
  autosave(@Param('userId') userId: string, @Body() body: SaveDto) {
    return this.profiles.autosave(userId, body.age, body.patch, body.basedOnVersion);
  }

  @Post('profiles/:userId/commit')
  commit(@Param('userId') userId: string, @Body() body: SaveDto) {
    return this.profiles.commit(userId, body.age, body.patch, body.basedOnVersion);
  }

  /** Validate an upload before the bytes are sent. */
  @Post('media/check')
  check(@Body() body: MediaCheckDto) {
    return this.profiles.checkUpload(body.slot, body.age, {
      mimeType: body.mimeType,
      bytes: body.bytes,
      widthPx: body.widthPx,
      heightPx: body.heightPx,
    });
  }

  @Post('profiles/:userId/media')
  attach(@Param('userId') userId: string, @Body() body: MediaCheckDto) {
    return this.profiles.attachUpload(userId, body.slot, body.age, {
      mimeType: body.mimeType,
      bytes: body.bytes,
      widthPx: body.widthPx,
      heightPx: body.heightPx,
    });
  }
}
