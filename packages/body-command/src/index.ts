/**
 * @jessmove/body-command
 *
 * BodyCommand AI — Autonomous Body-Balance and Healthy-BMI Operating System.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ISOLATED PENDING A GOVERNANCE DECISION.
 *
 * This package is deliberately NOT imported by @jessmove/shared, the
 * backend or the frontend. JESS MOVE Ethical Gamification Charter rule C6
 * forbids weight, BMI, appearance and calorie framing at any age, and is
 * asserted as a build gate in apps/backend/test/charter.test.ts.
 *
 * These contracts are safe to hold because they are needed under every
 * resolution of that conflict. Wiring them into JESS MOVE is not.
 *
 * See docs/BODY-BALANCE-AI.md §0.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Guiding principle, §1: the system should never assume that a lower BMI
 * is always better.
 */

export * from './pathways';
export * from './safety';
export * from './assessment';
export * from './scorecard';
export * from './plan';
export * from './acu';
export * from './agents';
