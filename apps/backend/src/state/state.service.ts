import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool } from '../db/pg';
import { checkDocument } from './state.logic';

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

/**
 * The member's working state: what they typed, scanned or were shown,
 * kept so that closing the phone costs nothing.
 */
@Injectable()
export class StateService implements OnModuleDestroy {
  private readonly logger = new Logger(StateService.name);
  private readonly memory = new Map<string, Map<string, unknown>>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      this.pool = makePool(url, 2);
    } else {
      this.logger.warn('member state: in-memory — drafts will not survive a restart');
    }
  }

  async save(userId: string, key: string, value: unknown): Promise<{ saved: true; at: string }> {
    const check = checkDocument(key, value);
    if (!check.ok) throw new BadRequestException(check.why);

    const at = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO member_state (user_id, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (user_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = now()`,
        [userId, key, JSON.stringify(value)],
      );
      return { saved: true, at };
    }

    const forUser = this.memory.get(userId) ?? new Map<string, unknown>();
    forUser.set(key, value);
    this.memory.set(userId, forUser);
    return { saved: true, at };
  }

  async all(userId: string): Promise<Record<string, unknown>> {
    if (this.pool) {
      try {
        const result = await this.pool.query(
          'SELECT key, value FROM member_state WHERE user_id = $1',
          [userId],
        );
        return Object.fromEntries(result.rows.map((r) => [String(r.key), r.value]));
      } catch (error) {
        this.logger.warn(`state read failed: ${(error as Error).message}`);
        return {};
      }
    }
    return Object.fromEntries(this.memory.get(userId) ?? new Map());
  }

  async clear(userId: string, key: string): Promise<{ cleared: true }> {
    if (this.pool) {
      await this.pool.query('DELETE FROM member_state WHERE user_id = $1 AND key = $2', [userId, key]);
    } else {
      this.memory.get(userId)?.delete(key);
    }
    return { cleared: true };
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
