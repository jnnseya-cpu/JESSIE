/**
 * Whether the Node this is running on has the security fixes.
 *
 * On 20 and 21 October 2026 Node released fixes for several high-severity
 * faults, the worst of which allows code execution on the server. The
 * patched versions are 22.23.4, 24.22.1 and 26.12.1. Node 20 and earlier
 * are end of life and will not receive a fix at all.
 *
 * ── Why this is a health check and not a boot refusal ─────────────────
 *
 * Refusing to start on an old runtime is the obvious move and the wrong
 * one here. On Vercel the Node version is the platform's to choose and
 * the platform's to patch; a hard refusal would mean a lag on their side
 * takes this API down, which trades a vulnerability for a guaranteed
 * outage. The container path is the owner's, and there the answer is to
 * rebuild rather than to crash-loop.
 *
 * So the version is reported instead, beside the commit, on an endpoint
 * that is already the first thing anybody reads. The gap becomes legible
 * in one request rather than being a thing somebody has to think to ask.
 */

/** Minimum patched release per supported major line. */
export const NODE_SECURITY_FLOOR: Readonly<Record<number, string>> = {
  22: '22.23.4',
  24: '24.22.1',
  26: '26.12.1',
};

/**
 * Lines that no longer receive security fixes.
 *
 * Listed rather than inferred from "below 22", because a future odd-numbered
 * line will reach end of life while still being numerically higher.
 */
export const NODE_UNSUPPORTED_MAJORS: readonly number[] = [18, 19, 20, 21, 23, 25];

export interface RuntimeReport {
  version: string;
  major: number;
  /** False when the line is end of life, or below its patched release. */
  patched: boolean;
  /** What would make it patched. Null when nothing is wrong. */
  says: string | null;
}

function compare(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Reads a version string rather than `process`, so it can be tested. */
export function runtimeReport(version: string): RuntimeReport {
  const clean = version.replace(/^v/, '');
  const major = Number(clean.split('.')[0] ?? 0);

  if (NODE_UNSUPPORTED_MAJORS.includes(major)) {
    return {
      version: clean,
      major,
      patched: false,
      says:
        `Node ${major} no longer receives security fixes. Move to 22, 24 or 26 — ` +
        `on a container that is the base image in the Dockerfile, and on Vercel it is the ` +
        `project's Node version setting.`,
    };
  }

  const floor = NODE_SECURITY_FLOOR[major];
  if (!floor) {
    // A line nobody here has assessed. Not called patched, because that
    // would be a claim about a version this code has never heard of.
    return {
      version: clean,
      major,
      patched: false,
      says: `Node ${major} is newer than anything this build was checked against. Confirm it carries the October 2026 fixes.`,
    };
  }

  if (compare(clean, floor) < 0) {
    return {
      version: clean,
      major,
      patched: false,
      says: `Node ${clean} is below ${floor}, which carries the October 2026 security fixes. Rebuild or upgrade.`,
    };
  }

  return { version: clean, major, patched: true, says: null };
}
