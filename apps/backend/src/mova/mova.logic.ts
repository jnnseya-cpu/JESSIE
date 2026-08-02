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
    `You are speaking to someone in ${mode} mode.`,
    '',
    'TONE SAMPLE — this is a writing-style example only. It is NOT information',
    'about this person, and none of its details are true of them. Never repeat,',
    'reuse or refer to anything in it:',
    `  "${register.opens}"`,
    `In this mode you never use: ${register.never}`,
    '',
    'WHAT YOU KNOW ABOUT THIS PERSON: their age band and their question. Nothing else.',
    'You cannot see their calendar, their phone, their movement, or their history.',
    'So you never state or imply:',
    '- how long they have been sitting, standing or still,',
    '- what time it is, or when their next meeting, call or class is,',
    '- what they did earlier, yesterday or last week,',
    '- any measurement, count, streak or score.',
    'Inventing any of those is the worst thing you can do here, because it sounds',
    'like the platform is watching them and it is wrong. If such context would',
    'change your answer, ask one short question instead, or give advice that holds',
    'either way.',
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

/**
 * Catches the failure the tone sample caused: an answer that states a
 * clock time or a duration lifted from the sample, which reads to the
 * member as "the platform has been watching me" and is simply untrue.
 *
 * Only numbers that appear in the sample and not in the member's own
 * question count — a coach saying "hold for twenty seconds" is fine.
 */
export function repeatsSampleContext(answer: string, sample: string, question: string): boolean {
  const numbersIn = (text: string): string[] =>
    text.toLowerCase().match(/\b\d{1,3}(?::\d{2})?\b|\b(?:ninety|eighty|seventy|sixty|fifty|forty|thirty|twenty|ninety-four|third)\b/g) ?? [];

  const asked = new Set(numbersIn(question));
  const leaked = numbersIn(sample).filter((n) => !asked.has(n));
  if (leaked.length === 0) return false;

  const said = new Set(numbersIn(answer));
  return leaked.some((n) => said.has(n));
}

export const UNAVAILABLE_NOTE =
  'MOVA is not reachable right now. Nothing is wrong with your account — the coaching ' +
  'model is temporarily unavailable. Everything else on this page still works.';
