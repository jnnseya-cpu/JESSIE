/**
 * Plain helpers for SQL text — kept free of Nest decorators so tests can
 * import them under --experimental-strip-types.
 */

/** Lines like `\set QUIET on` are psql instructions, not SQL — drop them. */
export function stripPsqlMetaCommands(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
}

/**
 * Count of `ok — …` lines the constraint suite emits when every rule holds.
 *
 * Pinned so a rule cannot leave the suite quietly: a check that stops
 * running reports nothing, and the suite still says "all passed" with one
 * fewer promise behind it. Raising this is ordinary work; lowering it
 * means a constraint was removed, and that belongs in the commit message.
 *
 * `scripts/db-apply.mjs` reads this value out of this file rather than
 * keeping its own copy, because two numbers that must agree eventually do
 * not.
 */
export const EXPECTED_CHECKS = 37;
