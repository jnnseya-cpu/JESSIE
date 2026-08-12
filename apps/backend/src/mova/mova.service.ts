import { Injectable, Logger } from '@nestjs/common';
import { MOVA_REFUSES, REGISTERS, modeForAge } from '@jessmove/shared';
import { AiGatewayService, AllowanceExhaustedError, InstructionRefusedError } from '../ai/ai-gateway.service';
import {
  MINOR_REFUSAL,
  UNAVAILABLE_NOTE,
  repeatsSampleContext,
  systemPromptFor,
  violatesMinorRules,
} from './mova.logic';

export interface AskResult {
  answer: string;
  mode: string;
  live: boolean;
  refusals: number;
}

/**
 * JESS — the coach a member actually talks to.
 *
 * Everything that makes MOVA safe is assembled here rather than trusted
 * to the model: the age register, the published refusals, and a final
 * check of the answer before it is shown to a minor. A missing provider
 * is answered honestly, never with an exception in the member's face.
 */
@Injectable()
export class MovaService {
  private readonly logger = new Logger(MovaService.name);

  constructor(private readonly ai: AiGatewayService) {}

  private async say(system: string, question: string, billTo?: string): Promise<string> {
    const response = await this.ai.complete({
      agent: 'JESS',
      billTo,
      maxTokens: 700,
      messages: [
        { role: 'system', content: system },
        /*
         * The member's own words, unedited. Marked so the gateway fences
         * them as content: the coach answers questions, and a question is
         * not a licence to redefine what the coach is.
         */
        { role: 'user', content: question, untrusted: true },
      ],
    });
    return response.text ?? '';
  }

  async ask(
    question: string,
    age: number,
    displayName?: string,
    billTo?: string,
  ): Promise<AskResult> {
    const mode = modeForAge(age);
    const base = { mode, refusals: MOVA_REFUSES.length };
    const system = systemPromptFor({ age, displayName });

    try {
      let answer = (await this.say(system, question, billTo)).trim();

      // The tone sample must never become "facts" about the member. If a
      // number from it survived into the answer, ask once more with the
      // mistake named — a second pass is far better than a coach that
      // sounds like it has been watching them.
      if (repeatsSampleContext(answer, REGISTERS[mode].opens, question)) {
        this.logger.warn('coach answer repeated tone-sample context — asking again');
        answer = (
          await this.say(
            `${system}\n\nYour previous attempt stated details about this person's day that ` +
              'you cannot know, taken from the tone sample. Answer again with no invented ' +
              'context: no durations, no clock times, no history.',
            question,
            billTo,
          )
        ).trim();
      }

      if (!answer) return { ...base, answer: UNAVAILABLE_NOTE, live: false };

      // The platform's own guarantee, not the model's good behaviour.
      if (age < 18 && violatesMinorRules(answer)) {
        this.logger.warn('a coach answer was refused by the under-18 rules');
        return { ...base, answer: MINOR_REFUSAL, live: true };
      }

      return { ...base, answer, live: true };
    } catch (error) {
      /*
       * An empty allowance is not an outage, and must not be dressed as
       * one. This catch used to swallow everything, so a member out of ACU
       * was told "nothing is wrong with your account — the coaching model
       * is temporarily unavailable", which is false in both halves: there
       * is something to fix, it is theirs to fix, and no amount of waiting
       * will fix it. It goes up to the filter, which answers 402 with the
       * wallet's own explanation.
       */
      if (error instanceof AllowanceExhaustedError) throw error;
      if (error instanceof InstructionRefusedError) throw error;
      this.logger.warn(`coach unavailable: ${(error as Error).message}`);
      return { ...base, answer: UNAVAILABLE_NOTE, live: false };
    }
  }
}
