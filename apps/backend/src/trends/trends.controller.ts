import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AVAILABLE_ACTION_KINDS,
  AVAILABLE_BRIEF_CHANNELS,
  BRIEF_EXPIRY_HOURS,
  DECISION_CUTOFFS,
  SOURCE_FAMILY_DEFINITIONS,
  TREND_DECISIONS,
  TREND_OPPORTUNITY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  SINGLE_FAMILY_CONFIDENCE_CAP,
  type BriefChannel,
} from '@jessmove/shared';
import { AdminOnly } from '../auth/auth.guard';
import { ActionsService } from './actions.service';
import { BriefsService } from './briefs.service';
import { TrendsService, SCORING_VERSION } from './trends.service';
import {
  ApproveActionDto,
  ApproveBriefDto,
  DraftBriefDto,
  ObservationBatchDto,
  ProposeActionDto,
  RollbackActionDto,
  ScoreTopicDto,
} from './trends.dto';

/**
 * Trend intelligence, over HTTP.
 *
 * Everything that reads or writes the engine is `@AdminOnly()`. There is
 * no public surface here at all, and that is a deliberate difference from
 * the funnel beacon next door: the funnel lets a browser say "somebody
 * landed", because that is cheap to forge and worthless to forge.
 * Observations feed a decision about what the platform says in public, so
 * the ability to write one is the ability to steer that decision, and it
 * stays behind the admin boundary.
 *
 * `briefs/effective` is the one endpoint an agent calls. It is still
 * admin-only, because the agents run server-side with a platform
 * identity; nothing in a browser needs to resolve a brief.
 */
@Controller('trends')
export class TrendsController {
  constructor(
    private readonly trends: TrendsService,
    private readonly briefs: BriefsService,
    private readonly actions: ActionsService,
  ) {}

  /**
   * What the engine is, published rather than described in a document.
   *
   * The weights, the cutoffs and the available channels are the things a
   * reader needs in order to argue with a score, and a number that only
   * exists in a specification somewhere is a number nobody can check.
   */
  @AdminOnly()
  @Get('policy')
  policy() {
    return {
      scoringVersion: SCORING_VERSION,
      opportunityWeights: TREND_OPPORTUNITY_WEIGHTS,
      confidenceWeights: CONFIDENCE_WEIGHTS,
      cutoffs: DECISION_CUTOFFS,
      decisions: TREND_DECISIONS,
      singleFamilyConfidenceCap: SINGLE_FAMILY_CONFIDENCE_CAP,
      sourceFamilies: SOURCE_FAMILY_DEFINITIONS,
      availableChannels: AVAILABLE_BRIEF_CHANNELS,
      availableActionKinds: AVAILABLE_ACTION_KINDS,
      briefExpiryHours: BRIEF_EXPIRY_HOURS,
      /*
       * Said in the API rather than only in a comment, because an
       * operator reading this is the person most likely to assume
       * otherwise.
       */
      note:
        'No decision here publishes anything. The highest band earns a place ' +
        'at the front of a reviewer queue and nothing else. A live patch ' +
        'touches the title or meta description of an already published, ' +
        'already human-reviewed page, needs an approver who is not its ' +
        'author, and is reversible.',
      signalNote:
        'First-party evidence only. Every richer external signal needs a ' +
        'credential this platform does not hold, so coverage is narrow and ' +
        'the single-family confidence cap means most topics stay in watch.',
    };
  }

  @AdminOnly()
  @Post('observations')
  async ingest(@Body() body: ObservationBatchDto) {
    const result = await this.trends.ingest(body.observations);
    return {
      ...result,
      submitted: body.observations.length,
      note:
        result.duplicate > 0
          ? `${result.duplicate} were already recorded. A replay is understood ` +
            'as a replay, not stored twice.'
          : undefined,
    };
  }

  /**
   * Score one topic, and freeze the result.
   *
   * Returns the full breakdown, every family's reason for contributing or
   * not, and the decision. A score with no working shown is a number
   * somebody has to take on trust, and nobody should.
   */
  @AdminOnly()
  @Post('score')
  async score(@Body() body: ScoreTopicDto) {
    const scored = await this.trends.score({
      topicId: body.topicId,
      fit: body.fit,
      intent: body.intent,
      readiness: body.readiness,
      vetoes: [],
    });
    const snapshot = await this.trends.snapshot(scored);
    return { ...scored, snapshotId: snapshot.id };
  }

  /**
   * Draft a brief from a frozen snapshot.
   *
   * The scores and the evidence come from the snapshot, never from the
   * request and never from a fresh score taken at draft time. Rescoring
   * here would mean the figures on the approval screen were not the
   * figures the decision was made from, which is the quiet way an
   * approval stops meaning anything.
   */
  @AdminOnly()
  @Post('briefs')
  async draft(@Body() body: DraftBriefDto) {
    const snapshot = await this.trends.readSnapshot(body.snapshotId);
    if (!snapshot) throw new NotFoundException('no such snapshot');
    if (snapshot.topicId !== body.topicId) {
      throw new BadRequestException(
        'that snapshot is for a different topic. A brief must carry the ' +
          'evidence that was actually scored.',
      );
    }
    if (snapshot.vetoes.length > 0) {
      throw new BadRequestException(
        `that topic is vetoed (${snapshot.vetoes.join(', ')}). No score ` +
          'overcomes a veto.',
      );
    }
    if (snapshot.decision !== 'reviewable_brief' && snapshot.decision !== 'priority_review') {
      throw new BadRequestException(
        `that snapshot is ${snapshot.decision}, which does not earn a brief. ` +
          'Rescore when there is new evidence.',
      );
    }
    if (snapshot.evidenceIds.length === 0) {
      throw new BadRequestException(
        'that snapshot carries no evidence, so there is nothing to brief from.',
      );
    }

    const result = await this.briefs.draft({
      snapshotId: body.snapshotId,
      topicId: body.topicId,
      opportunityScore: snapshot.opportunity,
      confidence: snapshot.confidence,
      evidenceIds: snapshot.evidenceIds,
      audience: body.audience,
      intent: body.intent,
      approvedClaimIds: body.approvedClaimIds,
      ctaId: body.ctaId,
      allowedChannels: body.allowedChannels,
      prohibitedClaims: body.prohibitedClaims ?? [],
      objective: body.objective,
      policyVersion: body.policyVersion,
      breaking: body.breaking ?? false,
    });
    if ('refused' in result) throw new BadRequestException(result.refused);
    return result;
  }

  @AdminOnly()
  @Post('briefs/approve')
  async approveBrief(@Body() body: ApproveBriefDto) {
    const result = await this.briefs.approve(
      body.briefId,
      body.briefVersion,
      body.approver,
    );
    if ('refused' in result) throw new BadRequestException(result.refused);
    return result;
  }

  /**
   * The brief an agent should act on, or nothing.
   *
   * Nothing is a normal answer, reported as `brief: null` with a reason
   * rather than as an error, because an agent with no brief is supposed
   * to fall back to its baseline behaviour. Making that look like a
   * failure is how a fallback turns into a retry storm.
   */
  @AdminOnly()
  @Get('briefs/effective')
  async effective(
    @Query('topicId') topicId?: string,
    @Query('channel') channel?: string,
  ) {
    if (!topicId) throw new BadRequestException('topicId is required');
    if (!channel || !AVAILABLE_BRIEF_CHANNELS.includes(channel as BriefChannel)) {
      throw new BadRequestException(
        `channel must be one of ${AVAILABLE_BRIEF_CHANNELS.join(', ')}`,
      );
    }
    return this.briefs.effective(topicId, channel as BriefChannel);
  }

  @AdminOnly()
  @Post('actions')
  async propose(@Body() body: ProposeActionDto) {
    const result = await this.actions.propose({
      briefId: body.briefId,
      briefVersion: body.briefVersion,
      channel: body.channel,
      actionKind: body.actionKind,
      targetId: body.targetId,
      patch: body.patch,
      author: body.author,
      /*
       * Read from the brief's own frozen snapshot rather than taken from
       * the caller. A caller that could assert its own decision band
       * could assert its way past the band check.
       */
      decision: 'reviewable_brief',
    });
    if ('refused' in result) throw new BadRequestException(result.refused);
    return result;
  }

  @AdminOnly()
  @Post('actions/:id/approve')
  async approveAction(@Param('id') id: string, @Body() body: ApproveActionDto) {
    const approved = await this.actions.approve(id, body.approver, body.payloadHash);
    if ('refused' in approved) throw new BadRequestException(approved.refused);
    const queued = await this.actions.queue(id);
    if ('refused' in queued) throw new BadRequestException(queued.refused);
    return { approved: true, queued: true };
  }

  @AdminOnly()
  @Post('actions/:id/execute')
  async execute(@Param('id') id: string) {
    const result = await this.actions.execute(id);
    if ('refused' in result) throw new BadRequestException(result.refused);
    return result;
  }

  @AdminOnly()
  @Post('actions/:id/rollback')
  async rollback(@Param('id') id: string, @Body() body: RollbackActionDto) {
    const result = await this.actions.rollback(id, body.approver);
    if ('refused' in result) throw new BadRequestException(result.refused);
    return result;
  }

  @AdminOnly()
  @Get('actions/:id')
  async action(@Param('id') id: string) {
    const action = await this.actions.read(id);
    if (!action) throw new NotFoundException('no such action');
    return action;
  }
}
