import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { makePool, type PgPoolLike } from '../db/pg';

/** The band as it is held between computations. */
export interface StoredBand {
  floorKcal: number;
  ceilingKcal: number;
  observedKcalPerDay: number;
  recordedDays: number;
  reviewAfterDays: number;
  computedAt: string;
}

/**
 * The band a member holds, so that anything can ask.
 *
 * The daily energy band is derived from age, pathway, consent, declared
 * conditions, BMI and seven confirmed days of food ledger. A photograph
 * upload carries none of those, and the client is deliberately not
 * trusted to assert them — which is why the day colour, the thing most
 * worth having, could not appear on a food scan.
 *
 * So the band is stored when it is computed. That is also the more honest
 * model: it is reviewed every fourteen days, not recalculated per
 * request, and treating it as a standing fact about the member says so.
 *
 * Only eligible bands are kept. A refusal is a fact about this moment —
 * one more day of record changes it — and a stored refusal invites being
 * read as a standing verdict.
 */
@Injectable()
export class BandStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(BandStoreService.name);
  private readonly memory = new Map<string, StoredBand>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('energy band: in-memory — the day colour will not survive a restart');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  /**
   * Best-effort on purpose. A band that could not be stored must never
   * fail the request that produced it — the member still gets their
   * range; the scan simply will not colour the day until the next
   * assessment writes one.
   */
  async put(userId: string, band: StoredBand): Promise<void> {
    if (!this.pool) {
      this.memory.set(userId, band);
      return;
    }
    try {
      await this.pool.query(
        `INSERT INTO member_energy_band
           (user_id, floor_kcal, ceiling_kcal, observed_kcal_per_day,
            recorded_days, review_after_days, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (user_id) DO UPDATE SET
           floor_kcal = EXCLUDED.floor_kcal,
           ceiling_kcal = EXCLUDED.ceiling_kcal,
           observed_kcal_per_day = EXCLUDED.observed_kcal_per_day,
           recorded_days = EXCLUDED.recorded_days,
           review_after_days = EXCLUDED.review_after_days,
           computed_at = now()`,
        [
          userId,
          Math.round(band.floorKcal),
          Math.round(band.ceilingKcal),
          Math.round(band.observedKcalPerDay),
          band.recordedDays,
          band.reviewAfterDays,
        ],
      );
    } catch (error) {
      this.logger.warn(`could not store the energy band: ${(error as Error).message}`);
    }
  }

  async get(userId: string): Promise<StoredBand | null> {
    if (!this.pool) return this.memory.get(userId) ?? null;
    try {
      const result = await this.pool.query(
        `SELECT floor_kcal, ceiling_kcal, observed_kcal_per_day,
                recorded_days, review_after_days, computed_at
           FROM member_energy_band WHERE user_id = $1`,
        [userId],
      );
      const row = result.rows?.[0];
      if (!row) return null;
      return {
        floorKcal: Number(row.floor_kcal),
        ceilingKcal: Number(row.ceiling_kcal),
        observedKcalPerDay: Number(row.observed_kcal_per_day),
        recordedDays: Number(row.recorded_days),
        reviewAfterDays: Number(row.review_after_days),
        computedAt: new Date(String(row.computed_at)).toISOString(),
      };
    } catch (error) {
      this.logger.warn(`could not read the energy band: ${(error as Error).message}`);
      return null;
    }
  }

  /** Removed when a member withdraws from body metrics. */
  async clear(userId: string): Promise<void> {
    if (!this.pool) {
      this.memory.delete(userId);
      return;
    }
    await this.pool
      .query(`DELETE FROM member_energy_band WHERE user_id = $1`, [userId])
      .catch(() => undefined);
  }
}
