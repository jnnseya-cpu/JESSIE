import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { ActivityService } from '../activity/activity.service';
import { FoodLogService } from '../foodlens/food-log.service';
import {
  ACTIVE_DAYS_TARGET,
  DAILY_REFERENCE,
  HEALTHY_BMI,
  insightFor,
  type InsightInput,
} from './risk.logic';

class InsightDto {
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(260)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(400)
  weightKg?: number;

  /** The member's own trend, when BodyCommand has one. */
  @IsOptional()
  @IsNumber()
  @Min(-10)
  @Max(10)
  kgPerWeek?: number;

  /** Which window of the food ledger to read the daily averages from. */
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(1095)
  windowDays?: number;
}

/**
 * One picture, out of everything the platform holds.
 *
 * The member's own figures come in the request because BodyCommand keeps
 * them in the member's drafts rather than on a server. Everything else —
 * what was scanned, which days had movement in them — is read here from
 * the session, so nothing about somebody else's account can be asked for.
 */
@Controller('insight')
export class HealthInsightController {
  constructor(
    private readonly auth: AuthService,
    private readonly foodLog: FoodLogService,
    private readonly activity: ActivityService,
  ) {}

  /** The rules this module works to, published rather than implied. */
  @Get('policy')
  policy() {
    return {
      healthyBmi: HEALTHY_BMI,
      dailyReference: DAILY_REFERENCE,
      activeDaysTarget: ACTIVE_DAYS_TARGET,
      neverDoes: [
        'diagnose anything',
        'name a condition as present rather than associated',
        'show any of this to anyone under 18',
        'treat BMI as a verdict rather than as one signal',
        'account for medication, pregnancy, a diagnosis or a family history',
      ],
      note:
        'Every association used here is the one in mainstream UK public-health guidance. Nothing is novel and nothing is invented.',
    };
  }

  @Post()
  async insight(@Req() req: Request, @Body() body: InsightDto) {
    const session = this.session(req);
    const me = await this.auth.me(session);
    const windowDays = body.windowDays ?? 30;

    const summary = await this.foodLog.summary(
      session.uid,
      windowDays <= 7 ? 'week' : windowDays <= 31 ? 'month' : windowDays <= 366 ? 'year' : 'all',
    );
    const dashboard = await this.activity.dashboard(session.uid);

    const perNutrient = (key: string): number | undefined =>
      summary.totals.find((t) => t.key === key)?.perDay;
    const topOf = (key: string): string | null =>
      summary.totals.find((t) => t.key === key)?.topContributors[0]?.name ?? null;

    const input: InsightInput = {
      age: me.age,
      heightCm: body.heightCm ?? null,
      weightKg: body.weightKg ?? null,
      food: {
        daysRecorded: summary.daysRecorded,
        daysCovered: summary.daysCovered,
        perDay: {
          saltG: perNutrient('saltG'),
          saturatesG: perNutrient('saturatesG'),
          sugarsG: perNutrient('sugarsG'),
          energyKcal: perNutrient('energyKcal'),
        },
        topSalt: topOf('saltG'),
        topSaturates: topOf('saturatesG'),
        topSugars: topOf('sugarsG'),
      },
      activity: {
        daysMoved: dashboard.daysMovedInWindow,
        windowDays: dashboard.days.length,
      },
      trend:
        typeof body.kgPerWeek === 'number'
          ? {
              kgPerWeek: body.kgPerWeek,
              direction: body.kgPerWeek < -0.05 ? 'down' : body.kgPerWeek > 0.05 ? 'up' : 'level',
            }
          : null,
    };

    return insightFor(input);
  }

  private session(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }
}
