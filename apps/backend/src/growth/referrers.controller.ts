import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  NO_REFERRAL_FEE,
  REFERRER_KINDS,
  REFERRER_KIND_DEFINITIONS,
  REFERRER_PROMISE,
  codeFromLabel,
  type ReferrerKind,
} from '@jessmove/shared';
import { AdminOnly } from '../auth/auth.guard';
import { ReferrersService } from './referrers.service';

class CreateReferrerDto {
  @IsString() @MinLength(2) @MaxLength(80) label!: string;
  @IsIn(REFERRER_KINDS as unknown as string[]) kind!: ReferrerKind;
}

/**
 * The route in for organisations that already have the people.
 *
 * Public to resolve, admin to create. Resolving is public because the
 * whole design is a link somebody hands over — a code that needed
 * authentication to read would be a code nobody could use.
 */
@Controller('referrers')
export class ReferrersController {
  constructor(private readonly referrers: ReferrersService) {}

  /**
   * What a code means, for the page somebody lands on.
   *
   * Returns 200 with `found: false` rather than a 404, because the person
   * holding an out-of-date leaflet did nothing wrong and should be told
   * something useful rather than shown an error.
   */
  @Get(':code')
  async resolve(@Param('code') code: string) {
    const record = await this.referrers.find(code);
    if (!record) {
      return {
        found: false,
        says:
          'That link is not one of ours, or it has been retired. Nothing is wrong — you can ' +
          'still create an account directly, and it works exactly the same either way.',
      };
    }
    const kind = REFERRER_KIND_DEFINITIONS[record.kind];
    return {
      found: true,
      code: record.code,
      label: record.label,
      active: record.active,
      kind: record.kind,
      kindLabel: kind.label,
      /*
       * The four things the person handing this over needs, in the order
       * they ask them. Not a pitch: somebody in a caring role is deciding
       * whether to put their own credibility behind this, and the honest
       * answers are more persuasive than the enthusiastic ones.
       */
      forThem: {
        handsItTo: kind.handsItTo,
        asksFirst: kind.asksFirst,
        answeredBy: kind.answeredBy,
      },
      promise: REFERRER_PROMISE,
      noFee: NO_REFERRAL_FEE,
      retired: record.active
        ? null
        : 'This code is no longer active. It still works as a way in — nothing about the account differs.',
    };
  }

  /** What each kind of organisation asks before passing anything on. */
  @Get()
  kinds() {
    return {
      kinds: REFERRER_KINDS.map((kind) => ({ kind, ...REFERRER_KIND_DEFINITIONS[kind] })),
      noFee: NO_REFERRAL_FEE,
      promise: REFERRER_PROMISE,
    };
  }

  @AdminOnly()
  @Post()
  async create(@Body() body: CreateReferrerDto) {
    const code = codeFromLabel(body.label);
    const made = await this.referrers.create({ code, label: body.label, kind: body.kind });
    return made
      ? { created: true, ...made, link: `https://www.jessmove.com/join/${made.code}` }
      : { created: false, says: 'That could not be saved — check the name produces a usable code.' };
  }

  /** Which routes actually reached anybody. */
  @AdminOnly()
  @Get('admin/report')
  async report(@Query('days') days?: string) {
    return this.referrers.report(Math.min(365, Math.max(1, Number(days) || 90)));
  }
}
