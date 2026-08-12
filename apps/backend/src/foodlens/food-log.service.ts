import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { makePool, type PgPoolLike } from '../db/pg';
import {
  RETENTION_DAYS,
  summarise,
  type FoodLogEntry,
  type FoodLogSummary,
  type LogWindow,
} from './food-log.logic';

/**
 * The ledger behind FoodLens.
 *
 * Every scan and every analysed photograph is kept, without the member
 * having to press save — which is the only way a food record ever survives
 * contact with a real week. Three years, then it goes, and a member can
 * clear the lot in one action.
 *
 * Writes are best-effort on purpose. A ledger that cannot be written must
 * never take down the analysis the member is waiting for; a missing row is
 * a gap in a total, not a failed scan.
 */
@Injectable()
export class FoodLogService implements OnModuleDestroy {
  private readonly logger = new Logger(FoodLogService.name);
  private readonly memory = new Map<string, FoodLogEntry[]>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('food ledger: in-memory — scans will not survive a restart');
    }
  }

  async record(
    userId: string,
    entry: Omit<FoodLogEntry, 'id' | 'at'> & { at?: string; detail?: Record<string, unknown> },
  ): Promise<FoodLogEntry | null> {
    // A row with no figures in it is a row nobody can total. It is not an
    // error — a photograph that named a food and no numbers is a real
    // outcome — it is simply not ledger material.
    const hasFigures = [
      entry.kcal,
      entry.fatG,
      entry.saturatesG,
      entry.sugarsG,
      entry.saltG,
      entry.proteinG,
      entry.carbohydrateG,
      entry.fibreG,
    ].some(
      (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    if (!hasFigures) return null;

    const row: FoodLogEntry = {
      ...entry,
      id: `fl_${randomUUID().slice(0, 12)}`,
      at: entry.at ?? new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO food_log
             (id, user_id, at, kind, name, barcode, grams, kcal, fat_g, saturates_g, sugars_g, salt_g,
              protein_g, carbohydrate_g, fibre_g, basis, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb)`,
          [
            row.id,
            userId,
            row.at,
            row.kind,
            row.name,
            row.barcode ?? null,
            row.grams ?? null,
            row.kcal ?? null,
            row.fatG ?? null,
            row.saturatesG ?? null,
            row.sugarsG ?? null,
            row.saltG ?? null,
            /*
             * Null rather than zero, every time. A barcode record with no
             * protein figure and a photograph the model would not put a
             * number on are both "nobody measured this", and writing a 0
             * would make them indistinguishable from a food that genuinely
             * has none — which is how a protein total ends up understated
             * and somebody gets told to eat more of it.
             */
            row.proteinG ?? null,
            row.carbohydrateG ?? null,
            row.fibreG ?? null,
            row.basis,
            JSON.stringify(entry.detail ?? {}),
          ],
        );
      } catch (error) {
        this.logger.warn(`food ledger write: ${(error as Error).message}`);
        return null;
      }
      return row;
    }

    const held = this.memory.get(userId) ?? [];
    held.push(row);
    this.memory.set(userId, held);
    return row;
  }

  async entries(userId: string): Promise<FoodLogEntry[]> {
    if (this.pool) {
      try {
        const result = await this.pool.query(
          `SELECT id, at, kind, name, barcode, grams, kcal, fat_g, saturates_g, sugars_g, salt_g,
                  protein_g, carbohydrate_g, fibre_g, basis
             FROM food_log
            WHERE user_id = $1 AND at > now() - ($2 || ' days')::interval
            ORDER BY at DESC
            LIMIT 20000`,
          [userId, String(RETENTION_DAYS)],
        );
        return result.rows.map((r) => ({
          id: String(r.id),
          at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
          kind: r.kind as FoodLogEntry['kind'],
          name: String(r.name),
          barcode: r.barcode == null ? null : String(r.barcode),
          grams: num(r.grams),
          kcal: num(r.kcal),
          fatG: num(r.fat_g),
          saturatesG: num(r.saturates_g),
          sugarsG: num(r.sugars_g),
          saltG: num(r.salt_g),
          proteinG: num(r.protein_g),
          carbohydrateG: num(r.carbohydrate_g),
          fibreG: num(r.fibre_g),
          basis: r.basis as FoodLogEntry['basis'],
        }));
      } catch (error) {
        this.logger.warn(`food ledger read: ${(error as Error).message}`);
        return [];
      }
    }
    return this.memory.get(userId) ?? [];
  }

  async summary(userId: string, window: LogWindow): Promise<FoodLogSummary & { recent: FoodLogEntry[] }> {
    const all = await this.entries(userId);
    return { ...summarise(all, window), recent: all.slice(0, 40) };
  }

  /** Everything, gone. No soft delete, no thirty-day grace, no copy. */
  async clear(userId: string): Promise<{ cleared: number }> {
    if (this.pool) {
      try {
        const before = await this.pool.query(
          'SELECT count(*)::int AS n FROM food_log WHERE user_id = $1',
          [userId],
        );
        await this.pool.query('DELETE FROM food_log WHERE user_id = $1', [userId]);
        return { cleared: Number(before.rows[0]?.n ?? 0) };
      } catch (error) {
        this.logger.warn(`food ledger clear: ${(error as Error).message}`);
        return { cleared: 0 };
      }
    }
    const held = this.memory.get(userId) ?? [];
    this.memory.delete(userId);
    return { cleared: held.length };
  }

  /**
   * Drops anything past the retention period. Called opportunistically on
   * read rather than on a schedule, because there is no scheduler on a
   * serverless deployment and a cron nobody runs is a promise nobody keeps.
   */
  async prune(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `DELETE FROM food_log WHERE at < now() - ($1 || ' days')::interval`,
        [String(RETENTION_DAYS)],
      );
    } catch (error) {
      this.logger.warn(`food ledger prune: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
