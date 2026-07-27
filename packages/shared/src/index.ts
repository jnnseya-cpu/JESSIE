/**
 * @jessie-os/shared
 *
 * The single source of truth for the JESSIE-OS™ domain model.
 * Both the backend (NestJS) and the frontend (Next.js) compile against
 * this package, so a change to a contract breaks the build on both
 * sides rather than at runtime.
 */

export * from './brand';
export * from './design';
export * from './age-modes';
export * from './capability';
export * from './movements';
export * from './snaps';
export * from './context';
export * from './effort';
export * from './gamification';
export * from './delivery';
export * from './agents';
export * from './ai';
export * from './api';
