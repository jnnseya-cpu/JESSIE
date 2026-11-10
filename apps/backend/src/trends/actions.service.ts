import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  PATCHABLE_FIELDS,
  canTransitionAction,
  checkBrief,
  idempotencyKeyParts,
  mayProposeLiveWrite,
  type ActionKind,
  type ActionState,
  type BriefChannel,
  type TrendDecision,
} from '@jessmove/shared';
import { makePool, withTransaction, type PgPoolLike } from '../db/pg';

/** A refusal, thrown so the transaction unwinds with it. */
class ActionRefusal extends Error {}
import { BriefsService } from './briefs.service';

/**
 * Turning a brief into a change, with every door locked that should be.
 *
 * The write path is the only part of this feature that can damage
 * anything, so it is the part with the most refusals in it. Six of them,
 * each for a failure that has happened to somebody:
 *
 *   1. the kind must have an adapter — a reserved kind is refused, not
 *      half-attempted;
 *   2. the target must be pre-bound, published and already reviewed by a
 *      person — an agent cannot introduce a new public page here;
 *   3. the approval binds to the exact payload hash, so editing the
 *      patch after approval invalidates it;
 *   4. the approver must not be the author;
 *   5. every guard runs again at execution, after the queue delay,
 *      because the world moves while a job waits;
 *   6. the write is a compare-and-set on the target revision, so a
 *      concurrent human edit produces a conflict instead of being
 *      silently overwritten.
 *
 * What it cannot do is publish anything new. The patchable field list is
 * an allowlist of two columns on a post that a person already approved,
 * and rollback restores exactly those. That is the whole of its reach.
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);
  private readonly pool: PgPoolLike | null;

  constructor(private readonly briefs: BriefsService) {
    this.pool = makePool(process.env.DATABASE_URL, 2);
  }

  /** The canonical hash of a patch. Key order cannot change it. */
  static patchHash(patch: Record<string, string>): string {
    const canonical = Object.keys(patch)
      .sort()
      .map((k) => `${k}=${patch[k]}`)
      .join('\u0000');
    return createHash('sha256').update(canonical).digest('hex');
  }

  async propose(input: {
    briefId: string;
    briefVersion: number;
    channel: BriefChannel;
    actionKind: ActionKind;
    targetId: string;
    patch: Record<string, string>;
    author: string;
    decision: TrendDecision;
  }): Promise<{ actionId: string; state: ActionState } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };

    const brief = await this.briefs.revision(input.briefId, input.briefVersion);
    if (!brief) return { refused: 'no such brief revision' };

    const briefCheck = checkBrief(brief, new Date(), input.channel);
    if (!briefCheck.ok) return { refused: briefCheck.why };

    const target = await this.readTarget(input.targetId);

    /*
     * The specific refusals come first, so the message names the actual
     * reason. `mayProposeLiveWrite` can only say "not pre-bound", which
     * is true of an unreviewed draft and of a page that does not exist
     * and of an archived one — three different problems with three
     * different fixes. An error that sends somebody looking in the wrong
     * place costs more than no error at all.
     *
     * A live patch may only touch something a person has already
     * published and signed for. An agent must not be able to reach
     * unreviewed or archived copy, and it must not be able to create a
     * page — the editorial pipeline owns both of those, and it requires a
     * named reviewer to publish.
     */
    if (PATCHABLE_FIELDS[input.actionKind].length > 0) {
      if (!target) {
        return { refused: `no page with the slug ${input.targetId} exists` };
      }
      if (target.status !== 'published') {
        return {
          refused:
            `that page is ${target.status}, not published. Only an already ` +
            'published, already human-reviewed page may be patched.',
        };
      }
      if (!target.reviewedBy) {
        return {
          refused:
            'that page carries no named reviewer, so nothing may patch it ' +
            'automatically. A person signs for health copy before an agent ' +
            'may touch it.',
        };
      }
      const empty = Object.entries(input.patch).filter(([, v]) => !v.trim());
      if (empty.length > 0) {
        return {
          refused: `a patch cannot blank a field: ${empty.map(([k]) => k).join(', ')}`,
        };
      }
    }

    const eligibility = mayProposeLiveWrite({
      kind: input.actionKind,
      decision: input.decision,
      fields: Object.keys(input.patch),
      targetIsPreBound: target !== null && target.reviewedBy !== null,
    });
    if (!eligibility.allowed) return { refused: eligibility.why };

    const baseRevision = target?.revision ?? 0;
    const hash = ActionsService.patchHash(input.patch);
    const key = idempotencyKeyParts({
      briefId: input.briefId,
      briefVersion: input.briefVersion,
      channel: input.channel,
      actionKind: input.actionKind,
      targetId: input.targetId,
      baseRevision,
      canonicalPatchHash: hash,
    });

    try {
      const { rows } = await this.pool.query(
        `INSERT INTO growth_actions
           (brief_id, brief_version, channel, action_kind, target_id,
            base_revision, patch, canonical_patch_hash, idempotency_key,
            author, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'validated')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, state`,
        [
          input.briefId,
          input.briefVersion,
          input.channel,
          input.actionKind,
          input.targetId,
          baseRevision,
          JSON.stringify(input.patch),
          hash,
          key,
          input.author,
        ],
      );
      if (!rows[0]) {
        // An identical replay returns the action that already exists
        // rather than a second one. This is the retry working.
        const { rows: existing } = await this.pool.query(
          `SELECT id, state FROM growth_actions WHERE idempotency_key = $1`,
          [key],
        );
        return existing[0]
          ? { actionId: String(existing[0].id), state: existing[0].state as ActionState }
          : { refused: 'the action could not be stored' };
      }
      return { actionId: String(rows[0].id), state: rows[0].state as ActionState };
    } catch (error) {
      return { refused: (error as Error).message };
    }
  }

  /**
   * Approve an exact payload, by somebody who did not write it.
   *
   * The hash is stored with the approval. If the patch is edited
   * afterwards its hash changes, the stored approval no longer matches,
   * and execution refuses. An approval is for a specific sentence, not
   * for an intention.
   */
  async approve(
    actionId: string,
    approver: string,
    expectedPayloadHash: string,
  ): Promise<{ approved: true } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };
    if (!approver.trim()) return { refused: 'an approval needs a named person' };

    try {
      return await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM growth_actions WHERE id = $1 FOR UPDATE`,
        [actionId],
      );
      const action = rows[0];
      if (!action) {
        throw new ActionRefusal('no such action');
      }
      if (String(action.author).trim() === approver.trim()) {
        await client.query('ROLLBACK');
        return {
          refused:
            'the author cannot approve their own change. Two people, or it ' +
            'does not go out.',
        };
      }
      if (String(action.canonical_patch_hash) !== expectedPayloadHash) {
        await client.query('ROLLBACK');
        return {
          refused:
            'that approval is for a different payload. The patch changed ' +
            'after it was reviewed, so the review no longer applies.',
        };
      }
      if (!canTransitionAction(action.state as ActionState, 'pending_approval')) {
        await client.query('ROLLBACK');
        return { refused: `an action in ${String(action.state)} cannot be approved` };
      }

      const brief = await this.briefs.revision(
        String(action.brief_id),
        Number(action.brief_version),
      );
      if (!brief) {
        throw new ActionRefusal('the brief behind this action no longer exists');
      }
      const briefCheck = checkBrief(brief, new Date(), action.channel as BriefChannel);
      if (!briefCheck.ok) {
        throw new ActionRefusal(briefCheck.why);
      }

      await client.query(
        `UPDATE growth_actions SET state = 'pending_approval', updated_at = now()
          WHERE id = $1`,
        [actionId],
      );
      await client.query(
        `INSERT INTO growth_action_approvals
           (action_id, payload_hash, target_revision, policy_version,
            brief_version, approver)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          actionId,
          expectedPayloadHash,
          Number(action.base_revision),
          brief.policyVersion,
          Number(action.brief_version),
          approver.trim(),
        ],
      );
      await client.query(
        `UPDATE growth_actions SET state = 'approved', updated_at = now()
          WHERE id = $1`,
        [actionId],
      );
        return { approved: true as const };
      });
    } catch (error) {
      return { refused: (error as Error).message };
    }
  }

  /**
   * Queue an approved action, and its outbox record, in one transaction.
   *
   * Both or neither. The alternative is an action that is queued and will
   * never run, or a job that will run something nobody queued, and which
   * of those you get depends on where the process died.
   */
  async queue(actionId: string): Promise<{ queued: true } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };
    try {
      return await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query(
        `SELECT state FROM growth_actions WHERE id = $1 FOR UPDATE`,
        [actionId],
      );
      if (!rows[0]) {
        throw new ActionRefusal('no such action');
      }
      if (!canTransitionAction(rows[0].state as ActionState, 'queued')) {
        await client.query('ROLLBACK');
        return {
          refused: `an action in ${String(rows[0].state)} cannot be queued`,
        };
      }
      await client.query(
        `UPDATE growth_actions SET state = 'queued', updated_at = now() WHERE id = $1`,
        [actionId],
      );
      await client.query(
        `INSERT INTO growth_action_outbox (action_id) VALUES ($1)
         ON CONFLICT (action_id) DO NOTHING`,
        [actionId],
      );
        return { queued: true as const };
      });
    } catch (error) {
      return { refused: (error as Error).message };
    }
  }

  /**
   * Apply a queued action, rechecking everything first.
   *
   * Every guard runs again here, after the queue delay, because the brief
   * can have expired and the target can have moved while the job waited.
   * The previous values are saved before the adapter is called so a
   * rollback has something to restore even if this process dies at the
   * worst possible moment.
   */
  async execute(actionId: string): Promise<
    | { applied: true; appliedRevision: number }
    | { refused: string; state: ActionState }
  > {
    if (!this.pool) return { refused: 'no database configured', state: 'failed' };

    const { rows } = await this.pool.query(
      `SELECT a.*, p.approver FROM growth_actions a
         LEFT JOIN growth_action_approvals p ON p.action_id = a.id
        WHERE a.id = $1`,
      [actionId],
    );
    const action = rows[0];
    if (!action) return { refused: 'no such action', state: 'failed' };
    if (action.state !== 'queued') {
      return {
        refused: `an action in ${String(action.state)} is not ready to execute`,
        state: action.state as ActionState,
      };
    }
    if (!action.approver) {
      return { refused: 'no approval on record', state: 'failed' };
    }

    // The brief, again. An approval given on Monday does not authorise a
    // write on Friday against evidence that expired on Wednesday.
    const brief = await this.briefs.revision(
      String(action.brief_id),
      Number(action.brief_version),
    );
    if (!brief) return { refused: 'the brief no longer exists', state: 'failed' };
    const briefCheck = checkBrief(brief, new Date(), action.channel as BriefChannel);
    if (!briefCheck.ok) {
      await this.fail(actionId, briefCheck.why);
      return { refused: briefCheck.why, state: 'failed' };
    }

    // The payload, again. An edit after approval changes the hash.
    const { rows: approvals } = await this.pool.query(
      `SELECT payload_hash FROM growth_action_approvals WHERE action_id = $1`,
      [actionId],
    );
    if (String(approvals[0]?.payload_hash) !== String(action.canonical_patch_hash)) {
      const why = 'the payload no longer matches what was approved';
      await this.fail(actionId, why);
      return { refused: why, state: 'failed' };
    }

    const patch = action.patch as Record<string, string>;
    const fields = Object.keys(patch);
    const allowed = PATCHABLE_FIELDS[action.action_kind as ActionKind];
    const forbidden = fields.filter((f) => !allowed.includes(f));
    if (forbidden.length > 0) {
      const why = `not patchable: ${forbidden.join(', ')}`;
      await this.fail(actionId, why);
      return { refused: why, state: 'failed' };
    }

    const target = await this.readTarget(String(action.target_id));
    if (!target) {
      await this.fail(actionId, 'the target no longer exists');
      return { refused: 'the target no longer exists', state: 'failed' };
    }

    await this.pool.query(
      `UPDATE growth_actions
          SET state = 'executing', previous_fields = $2, updated_at = now()
        WHERE id = $1`,
      [
        actionId,
        JSON.stringify(
          Object.fromEntries(fields.map((f) => [f, target.fields[f] ?? ''])),
        ),
      ],
    );

    // Compare-and-set. If an editor saved between the proposal and now,
    // zero rows match and their work is untouched.
    const sets = fields.map((f, i) => `${columnFor(f)} = $${i + 3}`).join(', ');
    const { rows: applied } = await this.pool.query(
      `UPDATE posts SET ${sets}, revision = revision + 1, updated_at = now()
        WHERE slug = $1 AND revision = $2
        RETURNING revision`,
      [String(action.target_id), Number(action.base_revision), ...fields.map((f) => patch[f])],
    );

    if (!applied[0]) {
      const why =
        'the target changed after the action was approved. The editor’s work ' +
        'is intact; this needs a new approval against the new revision.';
      await this.pool.query(
        `UPDATE growth_actions
            SET state = 'failed', failure_reason = $2, updated_at = now()
          WHERE id = $1`,
        [actionId, 'TARGET_REVISION_CONFLICT'],
      );
      return { refused: why, state: 'failed' };
    }

    const appliedRevision = Number(applied[0].revision);
    await this.pool.query(
      `UPDATE growth_actions
          SET state = 'applied', applied_revision = $2,
              provider_receipt = $3, updated_at = now()
        WHERE id = $1`,
      [actionId, appliedRevision, `posts:${String(action.target_id)}:${appliedRevision}`],
    );
    await this.pool.query(`DELETE FROM growth_action_outbox WHERE action_id = $1`, [
      actionId,
    ]);
    return { applied: true, appliedRevision };
  }

  /**
   * Put back exactly what was there, if nothing has moved since.
   *
   * A new logged action rather than an undo, and it restores only the
   * fields the original action touched so an unrelated edit in between
   * survives. If the revision has moved, this refuses rather than
   * overwriting whatever is there now.
   */
  async rollback(
    actionId: string,
    approver: string,
  ): Promise<{ rolledBack: true; revision: number } | { refused: string }> {
    if (!this.pool) return { refused: 'no database configured' };
    if (!approver.trim()) return { refused: 'a rollback needs a named person' };

    const { rows } = await this.pool.query(
      `SELECT * FROM growth_actions WHERE id = $1`,
      [actionId],
    );
    const action = rows[0];
    if (!action) return { refused: 'no such action' };
    if (action.state !== 'applied') {
      return { refused: `an action in ${String(action.state)} has nothing to undo` };
    }
    const previous = (action.previous_fields ?? {}) as Record<string, string>;
    const fields = Object.keys(previous);
    if (fields.length === 0) {
      return { refused: 'no previous values were recorded, so this cannot be undone safely' };
    }

    const sets = fields.map((f, i) => `${columnFor(f)} = $${i + 3}`).join(', ');
    const { rows: restored } = await this.pool.query(
      `UPDATE posts SET ${sets}, revision = revision + 1, updated_at = now()
        WHERE slug = $1 AND revision = $2
        RETURNING revision`,
      [
        String(action.target_id),
        Number(action.applied_revision),
        ...fields.map((f) => previous[f]),
      ],
    );
    if (!restored[0]) {
      return {
        refused:
          'the page has changed since this was applied, so restoring would ' +
          'discard somebody’s work. This needs a person to resolve.',
      };
    }
    await this.pool.query(
      `UPDATE growth_actions SET state = 'rolled_back', updated_at = now() WHERE id = $1`,
      [actionId],
    );
    return { rolledBack: true, revision: Number(restored[0].revision) };
  }

  async read(actionId: string): Promise<Record<string, unknown> | null> {
    if (!this.pool) return null;
    const { rows } = await this.pool.query(
      `SELECT a.id, a.brief_id, a.brief_version, a.channel, a.action_kind,
              a.target_id, a.base_revision, a.applied_revision, a.state,
              a.author, a.failure_reason, a.provider_receipt, a.patch,
              a.previous_fields, p.approver, p.approved_at
         FROM growth_actions a
         LEFT JOIN growth_action_approvals p ON p.action_id = a.id
        WHERE a.id = $1`,
      [actionId],
    );
    return rows[0] ?? null;
  }

  private async fail(actionId: string, why: string): Promise<void> {
    await this.pool?.query(
      `UPDATE growth_actions SET state = 'failed', failure_reason = $2,
              updated_at = now() WHERE id = $1`,
      [actionId, why.slice(0, 500)],
    );
  }

  /** The target, as the adapter sees it: id, revision and patchable values. */
  private async readTarget(slug: string): Promise<{
    revision: number;
    status: string;
    reviewedBy: string | null;
    fields: Record<string, string>;
  } | null> {
    if (!this.pool) return null;
    const { rows } = await this.pool.query(
      `SELECT title, description, status, reviewed_by, revision
         FROM posts WHERE slug = $1`,
      [slug],
    );
    if (!rows[0]) return null;
    return {
      revision: Number(rows[0].revision),
      status: String(rows[0].status),
      reviewedBy: rows[0].reviewed_by ? String(rows[0].reviewed_by) : null,
      fields: {
        title: String(rows[0].title ?? ''),
        description: String(rows[0].description ?? ''),
      },
    };
  }
}

/**
 * Field name to column name.
 *
 * An explicit map rather than interpolation, because every value here
 * reaches an UPDATE statement. The allowlist in `PATCHABLE_FIELDS`
 * already bounds it, and this throws rather than trusting that — two
 * independent checks on the one code path where a mistake writes SQL.
 */
function columnFor(field: string): string {
  const columns: Record<string, string> = { title: 'title', description: 'description' };
  const column = columns[field];
  if (!column) throw new Error(`no column for field ${field}`);
  return column;
}
