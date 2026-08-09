import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  OnModuleDestroy,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import {
  CHECK_IDS,
  CONCERN_THRESHOLDS,
  FUNCTIONAL_CHECKS,
  LEVELS,
  NOT_A_RISK_SCORE,
  RECHECK_WEEKS,
  progressBetween,
  startingPoint,
  type CheckResults,
} from '@jessmove/shared';
import { AuthService } from '../auth/auth.service';
import { tokenFrom } from '../auth/auth.guard';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * The store for strength and balance checks.
 *
 * Small on purpose. Three numbers, two yes-or-no answers, and the level
 * that was derived at the time — that last one so a future change to the
 * thresholds cannot silently rewrite somebody's history into a different
 * story than the one they were told.
 */
@Injectable()
export class FallsService implements OnModuleDestroy {
  private readonly logger = new Logger(FallsService.name);
  private readonly memory = new Map<string, (CheckResults & { at: string; level: string })[]>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) this.logger.warn('falls checks: in-memory — history will not survive a restart');
  }

  async record(
    userId: string,
    results: CheckResults,
    level: string,
  ): Promise<{ id: string; at: string }> {
    const id = `fc_${randomUUID().slice(0, 12)}`;
    const at = new Date().toISOString();

    if (!this.pool) {
      this.memory.set(userId, [...(this.memory.get(userId) ?? []), { ...results, at, level }]);
      return { id, at };
    }
    await this.pool.query(
      `INSERT INTO falls_checks
         (id, user_id, taken_at, chair_stand_reps, balance_seconds, up_and_go_seconds,
          fallen_last_year, afraid_of_falling, level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        userId,
        at,
        results.chairStandReps ?? null,
        results.balanceSeconds ?? null,
        results.upAndGoSeconds ?? null,
        results.fallenInLastYear ?? false,
        results.afraidOfFalling ?? false,
        level,
      ],
    );
    return { id, at };
  }

  async history(userId: string): Promise<(CheckResults & { at: string; level: string })[]> {
    if (!this.pool) return this.memory.get(userId) ?? [];
    try {
      const result = await this.pool.query(
        `SELECT taken_at, chair_stand_reps, balance_seconds, up_and_go_seconds,
                fallen_last_year, afraid_of_falling, level
           FROM falls_checks
          WHERE user_id = $1
          ORDER BY taken_at DESC
          LIMIT 200`,
        [userId],
      );
      return result.rows.map((r) => ({
        at: r.taken_at instanceof Date ? r.taken_at.toISOString() : String(r.taken_at),
        chairStandReps: r.chair_stand_reps === null ? null : Number(r.chair_stand_reps),
        balanceSeconds: r.balance_seconds === null ? null : Number(r.balance_seconds),
        upAndGoSeconds: r.up_and_go_seconds === null ? null : Number(r.up_and_go_seconds),
        fallenInLastYear: Boolean(r.fallen_last_year),
        afraidOfFalling: Boolean(r.afraid_of_falling),
        level: String(r.level),
      }));
    } catch (error) {
      // An unreadable history must not be reported as "no history", which
      // would restart somebody at the seated level they have outgrown.
      this.logger.error(`falls history: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}

class CheckDto {
  @IsOptional() @IsInt() @Min(0) @Max(60) chairStandReps?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(40) balanceSeconds?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(300) upAndGoSeconds?: number;
  @IsOptional() @IsBoolean() fallenInLastYear?: boolean;
  @IsOptional() @IsBoolean() afraidOfFalling?: boolean;
}

/**
 * Strength and balance, for the people this platform is unusual in
 * serving at all.
 *
 * The programme itself is the existing movement prescription with its
 * seated and supported variants — nothing new was needed there. What was
 * missing was the thing that makes a falls programme work rather than
 * merely exist: a starting level that is right, a re-check that comes
 * round, and a refusal to produce the one number everybody asks for.
 */
@Controller('falls')
export class FallsController {
  constructor(
    private readonly auth: AuthService,
    private readonly falls: FallsService,
  ) {}

  private me(req: Request) {
    const token = tokenFrom(req);
    const session = token ? this.auth.verify(token) : null;
    if (!session) throw new UnauthorizedException('no valid session');
    return session;
  }

  /** The checks, how to do them safely, and what this refuses to be. */
  @Get('checks')
  checks() {
    return {
      checks: CHECK_IDS.map((id) => FUNCTIONAL_CHECKS[id]),
      levels: Object.values(LEVELS),
      recheckWeeks: RECHECK_WEEKS,
      thresholds: CONCERN_THRESHOLDS,
      notARiskScore: NOT_A_RISK_SCORE,
      neverDoes: [
        'produce a falls risk score — a reassuring one is the output most likely to cause a fall',
        'replace a falls assessment, which looks at medication, blood pressure, vision, feet and your home',
        'tell anybody to push through pain or to attempt a position they do not feel safe in',
        'report any of this to a household or an organisation',
      ],
      whyItMatters:
        'Falls and fractures cost the NHS around £2 billion a year across four million bed days. ' +
        'What prevents them has been settled for decades — progressive, balance-challenging ' +
        'exercise, three times a week, kept up. The hard part has always been the keeping up.',
    };
  }

  /**
   * Records a set of checks and returns where to start.
   *
   * Deliberately one call: somebody who has just done three physical
   * measures should not then have to press something else to find out
   * what they were for.
   */
  @Post('checks')
  async record(@Req() req: Request, @Body() body: CheckDto) {
    const session = this.me(req);
    const me = await this.auth.me(session);

    /*
     * The same age gate the rest of the health module uses. This is aimed
     * at later life and there is no version of it that belongs in front of
     * a child — a twelve-year-old measuring their balance against a
     * falls-service cut-point is being handed a worry that is not theirs.
     */
    if (me.age < 18) {
      throw new UnauthorizedException(
        'This is a strength and balance programme for adults. Under 18 the platform does movement and growth, and nothing that measures against a clinical threshold.',
      );
    }

    const results: CheckResults = {
      chairStandReps: body.chairStandReps ?? null,
      balanceSeconds: body.balanceSeconds ?? null,
      upAndGoSeconds: body.upAndGoSeconds ?? null,
      fallenInLastYear: body.fallenInLastYear ?? false,
      afraidOfFalling: body.afraidOfFalling ?? false,
    };

    const start = startingPoint(results);
    const saved = await this.falls.record(session.uid, results, start.level);

    // Against the previous set, if there is one worth comparing to.
    const history = await this.falls.history(session.uid);
    const previous = history.find((h) => h.at !== saved.at);
    const progress = previous
      ? progressBetween(
          previous,
          results,
          Math.max(
            1,
            Math.round(
              (Date.parse(saved.at) - Date.parse(previous.at)) / (7 * 24 * 3_600_000),
            ),
          ),
        )
      : null;

    return { ...saved, start, progress, recheckWeeks: RECHECK_WEEKS };
  }

  /** The history, and when the next re-check is due. */
  @Get('history')
  async history(@Req() req: Request) {
    const session = this.me(req);
    const history = await this.falls.history(session.uid);
    const latest = history[0] ?? null;

    const dueAt = latest
      ? new Date(Date.parse(latest.at) + RECHECK_WEEKS * 7 * 24 * 3_600_000).toISOString()
      : null;

    return {
      history,
      latest,
      start: latest ? startingPoint(latest) : startingPoint({}),
      recheckDueAt: dueAt,
      recheckWeeks: RECHECK_WEEKS,
      // Twelve weeks, because a measure repeated monthly mostly records
      // how somebody slept.
      why: `Re-check every ${RECHECK_WEEKS} weeks. More often than that and you are mostly measuring how you slept; much less and a wrong starting level goes uncorrected.`,
      notARiskScore: NOT_A_RISK_SCORE,
    };
  }
}
