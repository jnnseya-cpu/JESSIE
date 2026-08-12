import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InstructionRefusedError } from '../ai/ai-gateway.service';

/**
 * Text written as an instruction to the system is not a server error, and
 * it is not necessarily an attack either.
 *
 * Most of what this refuses will be somebody testing the thing they just
 * signed up to, and a few will be a member who happened to phrase a
 * question in a shape the matcher recognises. Both deserve an answer that
 * tells them what to do rather than an accusation or a 500.
 *
 * What the body deliberately does not contain: which pattern fired, what
 * was matched, or how close it came. Every one of those turns a refusal
 * into a tutorial in evasion, and the person reading most carefully is the
 * one probing. The member gets one sentence and a working next step; the
 * detail goes to the security log, where a person can review it.
 */
@Catch(InstructionRefusedError)
export class InstructionFilter implements ExceptionFilter {
  catch(error: InstructionRefusedError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(400)
      .json({
        error: 'instruction_refused',
        message: error.message,
        stillWorks:
          'Nothing has been recorded against your account and nothing was charged. Everything ' +
          'else on the platform is working normally.',
        whyThisExists:
          'This platform reads what you write as content, never as a command. A message shaped ' +
          'like a command to the system is refused before it is sent anywhere, because the ' +
          'alternative is a system that can be told what to do by anybody who can type into it.',
      });
  }
}
