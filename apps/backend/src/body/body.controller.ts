import { BodyAssessmentDto, ProgressDto } from './body.dto';
import { alongsideFrom, trendFrom, warningsFor } from './progress.logic';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SelfOnly } from '../auth/auth.guard';
import { ActivityService } from '../activity/activity.service';
import {
  BC_AGENTS,
  BODY_PATHWAYS,
  CALIBRATION_DAYS,
  MAX_DAILY_ACTIONS,
  NON_SCALE_VICTORIES,
  PATHWAY_DEFINITIONS,
  PROHIBITED_MECHANICS,
  REWARDED_BEHAVIOURS,
  SCORE_DIMENSIONS,
  SCORE_LABELS,
  SCORE_WEIGHTS,
  TRAJECTORY_REVIEW_DAYS,
  TWIN_STATE_MEANING,
} from '@jessmove/body-command';
import {
  BODY_COMPOSITION_MIN_AGE,
  REPROFILE_CADENCE_DAYS,
} from '@jessmove/shared';
import { BodyService, type BodyAssessmentRequest } from './body.service';

/** Said identically by the stateless calculator and the member's own read. */
const HOW_PROGRESS_WORKS = [
  'You give a reading whenever you like — nothing is measured behind your back.',
  'Two readings make a direction; three make a trend worth reading.',
  'The rate is checked against what is sustainable, not against other people.',
  'What you did is shown beside the trend, never as its cause.',
] as const;

@Controller('body')
export class BodyController {
  constructor(
    private readonly body: BodyService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * A member's own trajectory, from the readings they actually recorded.
   *
   * `POST /body/progress` below is the same arithmetic over readings the
   * caller supplies. That is the right shape for a public calculator and
   * the wrong one for a member: it made `warningsFor` — which can return
   * a `stop` — a function of an array the browser had been keeping in a
   * `member_state` blob, so the same readings lived in two durable
   * places and the product read the copy it could not vouch for.
   *
   * This reads `member_activity`, where every reading was already being
   * written and then never read back. Same logic, same response shape,
   * one source.
   */
  @SelfOnly('userId')
  @Get('trajectory/:userId')
  async trajectory(
    @Param('userId') userId: string,
    @Query('age') age?: string,
    @Query('bmi') bmi?: string,
    @Query('daysMoved') daysMoved?: string,
    @Query('mealsChecked') mealsChecked?: string,
  ) {
    const readings = await this.activity.readings(userId);
    const trend = trendFrom(readings);
    const latest = readings[readings.length - 1];
    const parsedAge = Number(age);
    const parsedBmi = Number(bmi);

    return {
      readings,
      trend,
      warnings: warningsFor({
        age: Number.isFinite(parsedAge) ? parsedAge : 0,
        bmi: Number.isFinite(parsedBmi) ? parsedBmi : null,
        trend,
        latestKg: latest?.kg ?? null,
      }),
      alongside: alongsideFrom({
        daysMoved: Number(daysMoved) || 0,
        mealsChecked: Number(mealsChecked) || 0,
        windowDays: 14,
      }),
      howItWorks: HOW_PROGRESS_WORKS,
    };
  }

  /** The nine pathways and what each is for. */
  @Get('pathways')
  pathways() {
    return BODY_PATHWAYS.map((p) => PATHWAY_DEFINITIONS[p]);
  }

  /** The scorecard. Published so the weighting is inspectable. */
  /**
   * The loop: what has happened since the last reading, what to watch,
   * and what the member was doing alongside it.
   */
  @Post('progress')
  progress(@Body() body: ProgressDto) {
    const trend = trendFrom(body.readings ?? []);
    const latest = [...(body.readings ?? [])].sort((a, b) => a.day.localeCompare(b.day)).pop();
    return {
      trend,
      warnings: warningsFor({
        age: body.age,
        bmi: body.bmi ?? null,
        trend,
        latestKg: latest?.kg ?? null,
      }),
      alongside: alongsideFrom({
        daysMoved: body.daysMoved ?? 0,
        mealsChecked: body.mealsChecked ?? 0,
        windowDays: body.windowDays ?? 14,
      }),
      howItWorks: HOW_PROGRESS_WORKS,
    };
  }

  @Get('scorecard')
  scorecard() {
    return {
      dimensions: SCORE_DIMENSIONS.map((d) => ({
        key: d,
        label: SCORE_LABELS[d],
        weight: SCORE_WEIGHTS[d],
      })),
      note: 'BMI is not a dimension. It is shown separately as one assessment signal.',
      nonScaleVictories: NON_SCALE_VICTORIES,
      prohibitedMechanics: PROHIBITED_MECHANICS,
      bodyMetricsMinimumAge: BODY_COMPOSITION_MIN_AGE,
      /*
       * What the platform rewards, what a twin state means, and the two
       * cadences that govern when a plan is allowed to change. All of it
       * was specified and none of it was readable by the thing that has
       * to honour it.
       */
      rewardedBehaviours: REWARDED_BEHAVIOURS,
      twinStateMeaning: TWIN_STATE_MEANING,
      maxDailyActions: MAX_DAILY_ACTIONS,
      calibrationDays: CALIBRATION_DAYS,
      trajectoryReviewDays: TRAJECTORY_REVIEW_DAYS,
      reprofileCadenceDays: REPROFILE_CADENCE_DAYS,
    };
  }

  /** The nineteen agents, and which one supervises the rest. */
  @Get('agents')
  agents() {
    return Object.values(BC_AGENTS);
  }

  /**
   * Safety assessment and pathway selection. Runs for children and adults
   * alike; what comes back differs by age.
   */
  @Post('assess')
  assess(@Body() request: BodyAssessmentDto) {
    return this.body.assess(request);
  }

  /** The daily plan — at most six actions, guardian-approved. */
  @Post('plan')
  plan(@Body() request: BodyAssessmentDto) {
    return this.body.plan(request);
  }
}
