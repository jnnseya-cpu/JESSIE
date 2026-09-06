import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { assertScheduler } from '../common/cron.guard';
import { SelfOnly } from '../auth/auth.guard';
import { NudgeService } from './nudge.service';

export class WindowDto {
  /** 0 = Sunday, matching Date#getDay. */
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class SetWindowsDto {
  /*
   * A ceiling on the list, because this endpoint writes one row per entry
   * and an unbounded array is a way to make the database do unbounded
   * work with one request. Twenty-eight is four windows a day, every day,
   * which is more schedule than anybody has.
   */
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => WindowDto)
  windows!: WindowDto[];
}

@Controller('nudge')
export class NudgeController {
  constructor(private readonly nudge: NudgeService) {}

  /**
   * The scheduler's door, and the reason the platform can start a
   * conversation at all.
   *
   * A GET because that is what a platform scheduler issues, and guarded
   * by the shared secret rather than a session because a cron job has no
   * session. `assertScheduler` refuses everything when `CRON_SECRET` is
   * unset — an endpoint that decides to push notifications at people must
   * not be open by default on a deployment that forgot the variable.
   */
  @Get('cron')
  async cron(@Req() req: Request) {
    assertScheduler(req);
    return this.nudge.run();
  }

  /** A member's own declared schedule. */
  @SelfOnly('userId')
  @Get('windows/:userId')
  async windows(@Param('userId') userId: string) {
    return { windows: await this.nudge.windowsFor(userId) };
  }

  @SelfOnly('userId')
  @Post('windows/:userId')
  async setWindows(@Param('userId') userId: string, @Body() body: SetWindowsDto) {
    /*
     * Ordering is checked here as well as in the CHECK constraint. The
     * constraint is what makes it true; this is what makes the refusal
     * readable, because a member who dragged an end time before a start
     * time deserves a sentence rather than a 500 from Postgres.
     */
    const bad = body.windows.find((w) => w.endMinute - w.startMinute < 5);
    if (bad) {
      return {
        windows: await this.nudge.windowsFor(userId),
        rejected: `a window has to be at least five minutes long — ${bad.startMinute} to ${bad.endMinute} is not`,
      };
    }
    return { windows: await this.nudge.setWindows(userId, body.windows) };
  }
}
