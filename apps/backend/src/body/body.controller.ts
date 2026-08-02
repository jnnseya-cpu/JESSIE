import { BodyAssessmentDto, ProgressDto } from './body.dto';
import { alongsideFrom, trendFrom, warningsFor } from './progress.logic';
import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  BC_AGENTS,
  BODY_PATHWAYS,
  NON_SCALE_VICTORIES,
  PATHWAY_DEFINITIONS,
  PROHIBITED_MECHANICS,
  SCORE_DIMENSIONS,
  SCORE_LABELS,
  SCORE_WEIGHTS,
} from '@jessmove/body-command';
import { BODY_COMPOSITION_MIN_AGE } from '@jessmove/shared';
import { BodyService, type BodyAssessmentRequest } from './body.service';

@Controller('body')
export class BodyController {
  constructor(private readonly body: BodyService) {}

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
      howItWorks: [
        'You give a reading whenever you like — nothing is measured behind your back.',
        'Two readings make a direction; three make a trend worth reading.',
        'The rate is checked against what is sustainable, not against other people.',
        'What you did is shown beside the trend, never as its cause.',
      ],
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
