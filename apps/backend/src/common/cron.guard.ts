import { timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Whether this request really came from the scheduler.
 *
 * A scheduled job has no session, so it cannot come through the admin
 * guard — which leaves an endpoint that starts paid model work reachable
 * by anybody who guesses the path. The shared secret is what closes that,
 * and three details about how it is checked matter more than the check:
 *
 * **An unset secret refuses everything.** The tempting default is to skip
 * the check when nothing is configured, so it "works out of the box". On
 * an endpoint that spends money that default means a deployment which
 * forgot the variable is an open door, and it fails silently — the job
 * runs, so nobody looks.
 *
 * **The comparison is timing-safe.** A plain `===` on a secret leaks its
 * length and then its content to somebody patient. It costs one function
 * call not to.
 *
 * **The refusal says nothing.** Not whether the secret was missing, wrong
 * or the right length. A scheduler does not read error messages and an
 * attacker does.
 */
export function assertScheduler(req: Request): void {
  const expected = process.env.CRON_SECRET ?? '';
  const flat = new UnauthorizedException('not available');

  if (expected.length < 16) throw flat;

  const header = req.headers.authorization ?? '';
  const offered = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (offered.length !== expected.length) throw flat;

  if (!timingSafeEqual(Buffer.from(offered), Buffer.from(expected))) throw flat;
}
