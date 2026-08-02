import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { ActivityService } from './activity.service';
import type { ActivityKind } from './activity.logic';

class RecordActivityDto {
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

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }
}
