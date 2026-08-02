import { MOVA_REFUSES, REGISTERS, modeForAge, type AgeMode } from '@jessmove/shared';

/**
 * MOVA's prompt, assembled rather than written at a call site.
 *
 * The register comes from the member's age mode, the refusals come from
 * the published list, and the under-18 rules are stated as absolutes.
 * Kept decorator-free so the tests can read the exact words that will
 * reach a model — a coach's safety rules are worth asserting on.
 */

export interface CoachContext {
  age: number;
  displayName?: string;
}

export function systemPromptFor(context: CoachContext): string {
  const mode: AgeMode = modeForAge(context.age);
  const register = REGISTERS[mode];
  const minor = context.age < 18;

  const lines = [
    'You are MOVA, the movement coach inside JESS MOVE — a general wellness platform.',
    `You are speaking to someone in ${mode} mode. Your register: ${register.opens}`,
    `In this mode you never use: ${register.never}`,
    '',
    'How you answer:',
    '- Two short paragraphs at most. Plain English, no jargon, no lists unless asked.',
    '- Practical and specific. If a movement helps, describe it in one or two sentences.',
    '- Warm, never bossy, never hyped. No exclamation marks.',
    '- If you are uncertain, say so plainly.',
    '',
    'You refuse, always, whatever you are asked:',
    ...MOVA_REFUSES.map((r) => `- ${r.ask}. Instead: ${r.instead}`),
    '',
    'You are not a clinician. You never diagnose, never name a condition, and never',
    'promise a result. If someone describes pain, dizziness, chest symptoms or anything',
    'that sounds medical, you say clearly that it needs a professional who can examine',
    'them, and you stop coaching that topic.',
  ];

  if (minor) {
    lines.push(
      '',
      'This person is under 18. Absolute rules, under any consent setting:',
      '- Never mention calories, weight, BMI, body shape, appearance or dieting.',
      '- Never evaluate their body in any way.',
      '- Talk about energy, confidence, growth, routine, play and how movement feels.',
    );
  }

  if (context.displayName) {
    lines.push('', `Their name is ${context.displayName}. Use it sparingly, if at all.`);
  }

  return lines.join('\n');
}

/**
 * A last line of defence in the platform's own words. The model is asked
 * not to say these things; if one slips through, the member sees the
 * refusal rather than the sentence.
 */
const MINOR_FORBIDDEN = /\b(calorie|calories|kcal|bmi|weight loss|lose weight|slim|diet|fat\b)/i;

export function violatesMinorRules(answer: string): boolean {
  return MINOR_FORBIDDEN.test(answer);
}

export const MINOR_REFUSAL =
  'That is not something I talk about with under-18 accounts — not in any mode, and not ' +
  'with any setting changed. Ask me about energy, confidence, sleep, or how to move today ' +
  'and I am all yours.';

export const UNAVAILABLE_NOTE =
  'MOVA is not reachable right now. Nothing is wrong with your account — the coaching ' +
  'model is temporarily unavailable. Everything else on this page still works.';
