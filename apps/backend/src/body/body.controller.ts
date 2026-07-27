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
} from '@jessie-os/body-command';
import { BODY_COMPOSITION_MIN_AGE } from '@jessie-os/shared';
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
  assess(@Body() request: BodyAssessmentRequest) {
    return this.body.assess(request);
  }

  /** The daily plan — at most six actions, guardian-approved. */
  @Post('plan')
  plan(@Body() request: BodyAssessmentRequest) {
    return this.body.plan(request);
  }
}
