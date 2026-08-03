/**
 * @jessmove/shared
 *
 * The single source of truth for the JESS MOVE domain model.
 * Both the backend (NestJS) and the frontend (Next.js) compile against
 * this package, so a change to a contract breaks the build on both
 * sides rather than at runtime.
 */

export * from './brand';
export * from './design';
export * from './core-concepts';
export * from './age-modes';
export * from './capability';
export * from './movements';
export * from './snaps';
export * from './context';
export * from './effort';
export * from './gamification';
export * from './delivery';
export * from './mova';
export * from './micromovement';
export * from './challenges';
export * from './wearables';
export * from './economics';
export * from './agents';
export * from './ai';
export * from './api';
export * from './blog';
export * from './communications';
export * from './growth';
export * from './accounts';
export * from './autosave';
export * from './billing';
export * from './conditions';
export * from './site-paths';
export * from './link-graph';
