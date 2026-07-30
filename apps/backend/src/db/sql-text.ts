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

/** Count of `ok — …` lines the constraint suite emits when every rule holds. */
export const EXPECTED_CHECKS = 21;
