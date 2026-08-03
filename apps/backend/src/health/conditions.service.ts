import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { type ConditionId } from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';
import { cleanConditions } from './conditions.logic';

/**
 * What somebody has told us they live with.
 *
 * This is the most sensitive thing the platform stores, and the code is
 * deliberately the least clever in the repository. It holds a list of
 * catalogue identifiers against a member id. It does not hold severity,
 * dates, medication, test results or free text, because none of those are
 * needed to read a food ledger properly and all of them would turn a
 * preference into a medical record.
 *
 * Three properties matter more than anything else here:
 *
 *  * **It is only ever written by the member themselves.** Nothing infers
 *    a condition from a basket, and no staff route sets one.
 *  * **Unknown identifiers are dropped, not stored.** The catalogue is the
 *    only vocabulary, so a client cannot smuggle free text into this table
 *    by putting it where an identifier goes.
 *  * **Clearing it is one call and leaves nothing behind.** The row is
 *    deleted rather than emptied, and the database takes it with the
 *    account.
 *
 * Unlike the food ledger, a write failure here is *not* swallowed. A
 * ledger row that quietly went missing is a gap in a total; a condition
 * that quietly failed to save means somebody believes the platform knows
 * something it does not, and then reads a page written for people who do
 * not have it.
 */
@Injectable()
export class ConditionsService implements OnModuleDestroy {
  private readonly logger = new Logger(ConditionsService.name);
  private readonly memory = new Map<string, ConditionId[]>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('conditions: in-memory — declarations will not survive a restart');
    }
  }

  async forUser(userId: string): Promise<ConditionId[]> {
    if (!this.pool) return this.memory.get(userId) ?? [];
    try {
      const result = await this.pool.query(
        'SELECT conditions FROM member_conditions WHERE user_id = $1',
        [userId],
      );
      const raw = result.rows[0]?.conditions;
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : [];
      return cleanConditions(list.map(String));
    } catch (error) {
      // A read that failed is not an empty list. Saying "you have declared
      // nothing" when the database is unreachable would hand somebody the
      // general advice their condition exists to override.
      this.logger.error(`conditions read: ${(error as Error).message}`);
      throw error;
    }
  }

  async set(userId: string, values: readonly string[]): Promise<ConditionId[]> {
    const clean = cleanConditions(values);
    if (clean.length === 0) {
      await this.clear(userId);
      return [];
    }
    if (!this.pool) {
      this.memory.set(userId, clean);
      return clean;
    }
    await this.pool.query(
      `INSERT INTO member_conditions (user_id, conditions, updated_at)
            VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id)
       DO UPDATE SET conditions = EXCLUDED.conditions, updated_at = now()`,
      [userId, JSON.stringify(clean)],
    );
    return clean;
  }

  /** Gone. Not emptied, not archived, not kept for analytics. */
  async clear(userId: string): Promise<{ cleared: true }> {
    if (!this.pool) {
      this.memory.delete(userId);
      return { cleared: true };
    }
    await this.pool.query('DELETE FROM member_conditions WHERE user_id = $1', [userId]);
    return { cleared: true };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
