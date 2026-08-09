import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { ActivityService } from './activity.service';
import type { ActivityKind } from './activity.logic';

class RecordActivityDto {
  /*
   * `walk_logged` is deliberately absent. A walk goes through its own
   * endpoint below, so the category and the ceiling are set by the server
   * rather than accepted from whatever the client sent.
   */
  @IsIn(['snap_offered', 'snap_completed', 'snap_held', 'food_checked', 'body_read'])
  kind!: ActivityKind;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  seconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  detail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  value?: number;
}

class LogWalkDto {
  /**
   * One minute to two hours. The ceiling is the column's, not an opinion
   * about how far anybody should walk — a longer walk is two entries, and
   * that is a cheap price for a bound on what one request can claim.
   */
  @IsInt()
  @Min(1)
  @Max(120)
  minutes!: number;

  /** Optional, cosmetic, and never read by anything that computes. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  where?: string;
}

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly auth: AuthService,
  ) {}

  /** The member's own history, drawn as the day and the fortnight. */
  @Get('dashboard')
  async dashboard(@Req() req: Request) {
    return this.activity.dashboard(this.session(req).uid);
  }

  @Post()
  async record(@Req() req: Request, @Body() body: RecordActivityDto) {
    await this.activity.record({ userId: this.session(req).uid, ...body });
    return this.activity.dashboard(this.session(req).uid);
  }

  /**
   * A walk the member did on their own.
   *
   * Minutes, and nothing else. Not distance, not pace, not steps, not
   * calories — every one of those would have to be inferred from a number
   * somebody typed into a phone, and inferring numbers is the thing this
   * platform refuses to do everywhere else. Minutes are what was reported,
   * so minutes are what is stored and minutes are what is shown back.
   *
   * `where` is optional and free of consequence: it changes the line in the
   * timeline and nothing in any figure. It exists because "walked the dog"
   * is the difference between a log somebody keeps and one they abandon.
   */
  @Post('walk')
  async walk(@Req() req: Request, @Body() body: LogWalkDto) {
    const uid = this.session(req).uid;
    await this.activity.record({
      userId: uid,
      kind: 'walk_logged',
      // Set here, never taken from the client. A walk is cardio.
      category: 'cardio',
      seconds: body.minutes * 60,
      detail: (body.where ?? '').slice(0, 60),
    });
    return this.activity.dashboard(uid);
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }
}
