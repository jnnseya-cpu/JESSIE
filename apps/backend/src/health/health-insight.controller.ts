import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Body, Controller, Delete, Get, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CONDITIONS, CONDITION_IDS, NOT_MEDICAL_ADVICE } from '@jessmove/shared';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { ActivityService } from '../activity/activity.service';
import { FoodLogService } from '../foodlens/food-log.service';
import { ConditionsService } from './conditions.service';
import { MAX_CONDITIONS } from './conditions.logic';
import {
  ACTIVE_DAYS_TARGET,
  DAILY_REFERENCE,
  HEALTHY_BMI,
  insightFor,
  type InsightInput,
} from './risk.logic';

/**
 * The privacy of this one section, stated rather than assumed.
 *
 * Everything on this platform is private. This is more private than that,
 * and the difference is worth spelling out where somebody is deciding
 * whether to tick a box about their pancreas. Each line below is a
 * property of the code rather than a promise about intentions — the table
 * has one row per member and no reporting route reads it, the draft
 * autosave refuses anything clinical outright, and deleting the account
 * takes the row with it in the database rather than in a callback
 * somebody has to remember to write.
 */
const PRIVACY = [
  'Only you ever see this. It is not in any household or organisation report, at any group size — in a household of two, “somebody has coeliac disease” is a name.',
  'It is never sent to a marketer, an insurer, an employer or an advertiser. There is no route in this platform that could.',
  'It is not part of the ordinary draft autosave, which refuses anything clinical outright. It is saved only here, only by you, and only when you tick a box.',
  'Nothing is inferred. Scanning gluten-free bread for a fortnight will never make this platform decide anything about you.',
  'One button deletes it, and deleting your account deletes it with everything else.',
];

class ConditionsDto {
  /**
   * Catalogue identifiers only. Anything the catalogue does not know is
   * dropped rather than stored, so this can never become free text.
   */
  @IsArray()
  @ArrayMaxSize(MAX_CONDITIONS)
  @IsString({ each: true })
  conditions!: string[];
}

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
    private readonly conditions: ConditionsService,
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

  /**
   * The whole catalogue, published.
   *
   * Open, because a person deciding whether to tell a platform about their
   * pancreas is entitled to read exactly what it would then say — before
   * telling it anything. Nothing about any member is in this response; it
   * is the same list for everybody.
   */
  @Get('conditions/catalogue')
  catalogue() {
    return {
      conditions: CONDITION_IDS.map((id) => CONDITIONS[id]),
      max: MAX_CONDITIONS,
      notMedicalAdvice: NOT_MEDICAL_ADVICE,
      privacy: PRIVACY,
      neverDoes: [
        'infer a condition from anything you scan — it is only ever what you chose',
        'suggest, change or comment on any medication',
        'store severity, dates, test results or free text',
        'include any of this in a household or organisation report, at any group size',
        'show any of this to anyone under 18',
        'send any of it to a marketer, an insurer, an employer or an advertiser — there is no such route in this platform',
      ],
      note:
        'Telling us is optional and reversible in one action. What it changes is how the rest of this page reads your own figures.',
    };
  }

  /** What this member has told us. Their own session, never a parameter. */
  @Get('conditions')
  async myConditions(@Req() req: Request) {
    const declared = await this.conditions.forUser(this.session(req).uid);
    return {
      conditions: declared,
      max: MAX_CONDITIONS,
      notMedicalAdvice: NOT_MEDICAL_ADVICE,
      privacy: PRIVACY,
    };
  }

  @Put('conditions')
  async setConditions(@Req() req: Request, @Body() body: ConditionsDto) {
    const session = this.session(req);
    // Rule five, enforced at the door rather than only at the render. A
    // child cannot declare a condition, so there is nothing held about a
    // child to leak later.
    const me = await this.auth.me(session);
    if (me.age < 18) {
      throw new UnauthorizedException(
        'Under 18 this platform does not hold conditions or read figures against them. That belongs with a GP.',
      );
    }
    const saved = await this.conditions.set(session.uid, body.conditions);
    return {
      conditions: saved,
      max: MAX_CONDITIONS,
      notMedicalAdvice: NOT_MEDICAL_ADVICE,
      privacy: PRIVACY,
    };
  }

  /** Told us and would rather not have. One call, nothing left behind. */
  @Delete('conditions')
  clearConditions(@Req() req: Request) {
    return this.conditions.clear(this.session(req).uid);
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
    const declared = await this.conditions.forUser(session.uid);

    const perNutrient = (key: string): number | undefined =>
      summary.totals.find((t) => t.key === key)?.perDay;
    /*
     * A daily average, but only where the ledger actually supports one.
     * See `dailyIsMeaningful` — the difference between "you ate little
     * protein" and "we could only read protein on two of your nine scans"
     * is the difference between useful advice and advice built from our
     * own missing data.
     */
    const meaningfulPerDay = (key: string): number | undefined => {
      const row = summary.totals.find((t) => t.key === key);
      return row?.dailyIsMeaningful ? row.perDay : undefined;
    };
    const topOf = (key: string): string | null =>
      summary.totals.find((t) => t.key === key)?.topContributors[0]?.name ?? null;
    const contributorsOf = (key: string): { name: string; amount: number }[] =>
      summary.totals.find((t) => t.key === key)?.topContributors ?? [];

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
          /*
           * Only when enough of the window carried a figure. `perNutrient`
           * would happily average a protein total drawn from two scans out
           * of nine, and every rule downstream would read the result as a
           * shortfall rather than as a gap in the ledger.
           */
          proteinG: meaningfulPerDay('proteinG'),
          fibreG: meaningfulPerDay('fibreG'),
        },
        topSalt: topOf('saltG'),
        topSaturates: topOf('saturatesG'),
        topSugars: topOf('sugarsG'),
        topEnergy: contributorsOf('energyKcal'),
        topSugarItems: contributorsOf('sugarsG'),
      },
      activity: {
        daysMoved: dashboard.daysMovedInWindow,
        windowDays: dashboard.days.length,
      },
      conditions: declared,
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
