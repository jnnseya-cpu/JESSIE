import { Injectable, Logger } from '@nestjs/common';
import { MOVA_REFUSES, modeForAge } from '@jessmove/shared';
import { AiGatewayService } from '../ai/ai-gateway.service';
import {
  MINOR_REFUSAL,
  UNAVAILABLE_NOTE,
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

  async ask(question: string, age: number, displayName?: string): Promise<AskResult> {
    const mode = modeForAge(age);
    const base = { mode, refusals: MOVA_REFUSES.length };

    try {
      const response = await this.ai.complete({
        agent: 'JESS',
        maxTokens: 700,
        messages: [
          { role: 'system', content: systemPromptFor({ age, displayName }) },
          { role: 'user', content: question },
        ],
      });

      const answer = response.text?.trim();
      if (!answer) return { ...base, answer: UNAVAILABLE_NOTE, live: false };

      // The platform's own guarantee, not the model's good behaviour.
      if (age < 18 && violatesMinorRules(answer)) {
        this.logger.warn('a coach answer was refused by the under-18 rules');
        return { ...base, answer: MINOR_REFUSAL, live: true };
      }

      return { ...base, answer, live: true };
    } catch (error) {
      this.logger.warn(`coach unavailable: ${(error as Error).message}`);
      return { ...base, answer: UNAVAILABLE_NOTE, live: false };
    }
  }
}
