import { Injectable, Logger } from '@nestjs/common';
import { PLATFORM_PAYERS, SECURITY_NEVER_DOES, SECURITY_POSTURE } from '@jessmove/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { SecurityService } from './security.service';

/**
 * The security agent, and the narrow thing it is allowed to do.
 *
 * The obvious build is an AI that watches traffic and bans people. It is
 * also the wrong build, and on this platform it would be the most harmful
 * component in the system. Consider what a false positive costs here: a
 * person locked out of their own health record, by a model, with no rule
 * they can read and nobody to appeal to. That is a harm we would have
 * caused, and it is worse than most of what an intruder could do.
 *
 * So the split is:
 *
 *   **Deterministic code decides.** Every block on this platform comes
 *   from a rule in `humanity.ts` or `DOOR_POLICY` — a reviewer can read
 *   the rule, a member can be told which one fired, and every limit is a
 *   window that expires on its own. No block anywhere waits on a model.
 *
 *   **The agent explains.** It reads the queue of things already refused
 *   and writes the paragraph a person needs to decide whether the rules
 *   are working: is this one campaign or fifteen unrelated people, is it
 *   worth a rule change, is anything here a false positive we should
 *   loosen. It has no tools, no write access to anything but its own
 *   triage note, and cannot block, ban or unblock anybody.
 *
 * By the time this runs, the attack is already stopped. That is what makes
 * it safe to let a model near it at all — and it is why the agent running
 * out of allowance degrades nothing: the queue is still blocked, still
 * there, waiting for a person.
 */
@Injectable()
export class SentryAgentService {
  private readonly logger = new Logger(SentryAgentService.name);

  constructor(
    private readonly gateway: AiGatewayService,
    private readonly security: SecurityService,
  ) {}

  /**
   * Read the queue, write one paragraph per event.
   *
   * Metered against the platform's own security budget, so an attacker who
   * works out that attacking us makes us spend hits a daily cap rather
   * than a bill.
   */
  async triage(limit = 10): Promise<{
    reviewed: number;
    summary: string;
    posture: string;
    neverDoes: readonly string[];
  }> {
    const pending = await this.security.pending(limit);
    if (pending.length === 0) {
      return {
        reviewed: 0,
        summary: 'Nothing refused that has not already been reviewed.',
        posture: SECURITY_POSTURE,
        neverDoes: SECURITY_NEVER_DOES,
      };
    }

    /*
     * What the agent is given, and what it is not.
     *
     * It sees the kind, the severity, the surface and the hashed source —
     * enough to spot one campaign against fifteen unrelated events. It
     * does not see who the member is, and it never sees the payload: the
     * `detail` field already holds a capped fragment rather than the
     * message, so there is nothing here to leak even if the model were
     * persuaded to repeat its input.
     */
    const rows = pending.map((row) => ({
      id: row.id,
      kind: row.kind,
      severity: row.severity,
      surface: row.surface ?? 'unknown',
      source: String(row.source ?? '').slice(0, 8),
      detail: String(row.detail ?? '').slice(0, 200),
    }));

    let text = '';
    try {
      const response = await this.gateway.complete({
        agent: 'FRAUD',
        billTo: PLATFORM_PAYERS.security,
        maxTokens: 700,
        messages: [
          {
            role: 'system',
            content: [
              'You review a queue of security refusals that have ALREADY been blocked by',
              'deterministic rules. Nothing you write changes anybody’s access — you cannot',
              'block, ban or unblock, and no part of this system will act on a judgement you make.',
              '',
              'Write for one on-call engineer deciding what, if anything, needs a human today.',
              'For the queue as a whole, say: whether these look like one coordinated attempt or',
              'unrelated events; which if any look like ordinary members caught by a rule that is',
              'too tight; and what a person should actually do next, including "nothing".',
              '',
              'Say plainly when you cannot tell. A confident story built from eight log lines is',
              'worse than "not enough here to say", because somebody will act on it.',
              'Never identify or speculate about who any of these people are.',
            ].join('\n'),
          },
          {
            /*
             * Marked untrusted, because it is. The queue contains fragments
             * of text somebody wrote specifically to manipulate a model —
             * that is why the rows are there. Feeding them to an agent
             * unfenced would make this the easiest surface on the platform
             * to attack, and the attacker would have been handed a queue of
             * their own previous attempts to refine against.
             */
            role: 'user',
            content: `Queue of already-blocked events:\n${JSON.stringify(rows, null, 1)}`,
            untrusted: true,
          },
        ],
      });
      text = response.text ?? '';
    } catch (error) {
      /*
       * Every failure mode here is the same failure mode: no triage note.
       * The queue stays visible and unreviewed, which is the honest state
       * and the one that gets a person to look at it.
       */
      this.logger.warn(`triage unavailable: ${(error as Error).message}`);
      return {
        reviewed: 0,
        summary:
          'The queue could not be triaged automatically — no allowance, no provider, or the ' +
          'agent declined. Everything in it is still blocked and still listed for review.',
        posture: SECURITY_POSTURE,
        neverDoes: SECURITY_NEVER_DOES,
      };
    }

    // One note against the newest event, rather than a fabricated
    // per-row note the agent was never asked to produce.
    const newest = rows[0];
    if (newest && text) await this.security.triage(Number(newest.id), text);

    return {
      reviewed: rows.length,
      summary: text,
      posture: SECURITY_POSTURE,
      neverDoes: SECURITY_NEVER_DOES,
    };
  }
}
