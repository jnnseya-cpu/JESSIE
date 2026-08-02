import type { MovementCategory, MovementVariant } from '@jessmove/shared';

/**
 * The coaching layer of a prescription.
 *
 * The engine's output — dose, RPE, safety verdict — is telemetry. A
 * member needs a coach: what this movement is, how to do it, how it
 * should feel, and when to stop. Kept as a pure table so the words are
 * testable and the reading age stays low (short sentences, no anatomy
 * a twelve-year-old wouldn't know).
 */

export interface MovementGuide {
  what: string;
  steps: string[];
  feel: string;
  stopIf: string;
}

/** How to set up, per variant. Always the first step. */
const SETUP: Readonly<Record<MovementVariant, string>> = {
  standing: 'Stand tall, feet about hip-width apart.',
  seated: 'Sit tall towards the front of your chair, feet flat on the floor.',
  chair_supported: 'Stand behind a sturdy chair and rest your hands on its back.',
  bed_recliner: 'Settle on your back, or well supported in your recliner.',
  adaptive_single_limb: 'Set up on whichever side works for you today — one side is plenty.',
};

const GUIDES: Readonly<
  Record<MovementCategory, Omit<MovementGuide, 'stopIf'> & { steps: string[] }>
> = {
  mobility: {
    what: 'A gentle upper-back opener that undoes the hunch of sitting.',
    steps: [
      'Place your hands behind your head, elbows wide.',
      'Breathe in slowly, lift your chest and let your elbows drift back.',
      'Breathe out and come back to where you started.',
      'Repeat at your own pace until the time is up.',
    ],
    feel: 'A comfortable stretch across your chest and upper back.',
  },
  posture: {
    what: 'A shoulder reset that undoes the slow creep towards the screen.',
    steps: [
      'Let your arms hang loose.',
      'Roll your shoulders up towards your ears, then back and down.',
      'Gently squeeze your shoulder blades together for one breath.',
      'Release, and repeat slowly until the time is up.',
    ],
    feel: 'Your shoulders sitting lower and your neck a little longer.',
  },
  balance: {
    what: 'A quiet balance hold that trains your steadiness.',
    steps: [
      'Keep a wall or chair within reach of one hand.',
      'Bring your feet close together and fix your eyes on one point ahead.',
      'When you feel steady, lighten your hand to fingertips.',
      'Hold there, breathing normally, until the time is up.',
    ],
    feel: 'Small constant corrections in your feet and ankles — that is the training.',
  },
  strength: {
    what: 'A no-equipment strength hold you can do anywhere.',
    steps: [
      'Press your palms together in front of your chest.',
      'Press firmly — about half of what you could — and hold, breathing normally.',
      'Release slowly and shake your hands loose.',
      'Rest a moment, then repeat until the time is up.',
    ],
    feel: 'Work in your arms, chest and middle, without strain.',
  },
  breath: {
    what: 'A slow-exhale breath that settles your whole system.',
    steps: [
      'Drop your shoulders and soften your jaw.',
      'Breathe in through your nose for a count of four.',
      'Breathe out gently for a count of six.',
      'Repeat. If counting is a bother, just make every out-breath longer than the in-breath.',
    ],
    feel: 'Each out-breath a little slower, everything a notch calmer.',
  },
  cardio: {
    what: 'A short pulse-raiser to wake your whole body up.',
    steps: [
      'Start marching on the spot, arms swinging naturally.',
      'Lift your knees a little higher every few steps.',
      'Keep a pace where you could still talk, just about.',
      'Ease off gradually for the last few breaths.',
    ],
    feel: 'Warmer, breathing deeper, a light drum of a heartbeat.',
  },
  neuro: {
    what: 'A coordination game for your brain and body together.',
    steps: [
      'Tap your right hand to your left knee, then swap sides.',
      'Keep alternating, slow and accurate before fast.',
      'When it feels easy, close your eyes for a few taps.',
      'Finish with three slow taps, perfectly placed.',
    ],
    feel: 'Concentration, a few misses, and it getting easier — that is the point.',
  },
  eye: {
    what: 'A screen-break for your eyes — the muscles you never stretch.',
    steps: [
      'Look away from every screen.',
      'Fix on something as far away as you can see, for three slow breaths.',
      'Slowly trace a wide figure-of-eight with your eyes, twice each way.',
      'Finish by closing your eyes for two breaths.',
    ],
    feel: 'Your eyes unclenching. Most people only notice the strain as it leaves.',
  },
  play: {
    what: 'A playful movement burst — no technique, no scoring, just moving.',
    steps: [
      'Shake out your arms and legs like you are flicking off water.',
      'Reach as tall as you can, then flop forward like a ragdoll.',
      'Bounce gently and let your arms swing any way they like.',
      'Finish with one big, deliberately silly stretch.',
    ],
    feel: 'Looser and lighter. If it made you smile, it worked.',
  },
  skill: {
    what: 'A precision challenge — small, controlled, repeatable.',
    steps: [
      'Stand or sit with one hand resting anywhere for support.',
      'Rise slowly onto your toes — or press one heel down firmly.',
      'Lower with control, taking twice as long as the way up.',
      'Repeat, aiming for each one smoother than the last.',
    ],
    feel: 'Deliberate control. Quality over count, every time.',
  },
};

const STOP_LINE =
  'Stop if anything hurts, pinches or makes you dizzy. A Snap should never hurt.';

export function guideFor(category: MovementCategory, variant: MovementVariant): MovementGuide {
  const base = GUIDES[category];
  return {
    what: base.what,
    steps: [SETUP[variant], ...base.steps],
    feel: base.feel,
    stopIf: STOP_LINE,
  };
}
