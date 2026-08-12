import { Controller, Get, Post, Query } from '@nestjs/common';
import {
  DOOR_POLICY,
  HUMAN_DOORS,
  INJECTION_PATTERNS,
  NOT_PROOF_OF_HUMANITY,
  SECURITY_NEVER_DOES,
  SECURITY_POSTURE,
} from '@jessmove/shared';
import { AdminOnly } from '../auth/auth.guard';
import { SecurityService } from './security.service';
import { SentryAgentService } from './sentry-agent.service';

/**
 * The security posture, and the queue behind it.
 *
 * Split deliberately down the middle. The *policy* is public — what is
 * checked at each door, why each limit is the number it is, what the
 * platform refuses to do, and the sentence saying none of this proves
 * anybody is human. Publishing that costs nothing an attacker could not
 * discover in ten minutes of probing, and it is the only way a buyer or a
 * member can check the claim rather than take it.
 *
 * The *queue* is not. Which patterns are firing right now, how often, and
 * from how many sources is live feedback on what is getting through, and
 * handing that to whoever is currently trying would be handing them a test
 * harness. That side is behind the admin guard.
 *
 * What is NOT published either way: the regular expressions themselves.
 * The names and descriptions are here — `override_instructions`, "telling
 * the system to drop what it was told to do" — so the approach is
 * reviewable. The exact expression is the part that turns review into
 * evasion, and a reviewer who needs it can read the source.
 */
@Controller('security')
export class SecurityController {
  constructor(
    private readonly security: SecurityService,
    private readonly sentry: SentryAgentService,
  ) {}

  /** Public: what is enforced, and the honest limits of it. */
  @Get()
  posture() {
    return {
      inOneSentence:
        'Every door checks that a person is behind it, every AI surface treats what you write ' +
        'as content rather than as a command, and neither of those is proof of anything — so ' +
        'nothing downstream assumes it is.',
      notProofOfHumanity: NOT_PROOF_OF_HUMANITY,
      doors: HUMAN_DOORS.map((door) => ({
        door,
        attemptsPerWindow: DOOR_POLICY[door].attemptsPerWindow,
        windowMinutes: DOOR_POLICY[door].windowMinutes,
        formMustBeSeconds: DOOR_POLICY[door].minTokenAgeSeconds,
        because: DOOR_POLICY[door].because,
      })),
      instructionsFromOutside: {
        what:
          'Text arriving from a member, a partner or a photograph is fenced as data before it ' +
          'reaches any model, and text shaped like a command to the system is refused before ' +
          'anything is sent or charged.',
        // Names and meanings, never the expressions.
        detects: INJECTION_PATTERNS.map((p) => ({
          id: p.id,
          what: p.what,
          refusesOnItsOwn: p.decisive,
        })),
        whyTwoLayers:
          'Matching is a filter and every filter is eventually evaded. Fencing is structural: ' +
          'the content arrives inside a boundary the prompt has already described as data, with ' +
          'a marker generated per call that the text cannot have contained. A payload nobody has ' +
          'thought of still arrives fenced.',
      },
      neverDoes: SECURITY_NEVER_DOES,
      posture: SECURITY_POSTURE,
    };
  }

  /** Admin: what is actually happening. */
  @AdminOnly()
  @Get('events')
  async events(@Query('hours') hours?: string) {
    const window = Math.min(720, Math.max(1, Number(hours) || 24));
    return {
      window: `${window} hours`,
      summary: await this.security.summary(window),
      pending: await this.security.pending(40),
      note:
        'Sources are hashed with a salt that changes daily, so the same caller correlates ' +
        'within a day and not across weeks. The text that triggered a refusal is not stored — ' +
        'only a capped fragment.',
    };
  }

  /**
   * Admin: ask the agent to read the queue.
   *
   * A POST because it spends the platform's allowance. Nothing it returns
   * changes anybody's access — see the note on the agent.
   */
  @AdminOnly()
  @Post('triage')
  async triage() {
    return this.sentry.triage(10);
  }
}
