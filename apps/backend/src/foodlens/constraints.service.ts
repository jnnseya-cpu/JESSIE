import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { MemberFoodConstraints } from '@jessmove/foodlens';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * What a member has told us about their food.
 *
 * `SWAP_CONSTRAINTS` has listed culture, religion, allergies, budget and
 * six more on the FoodLens page since it was written. Nothing had ever
 * asked a member for any of them, and `selectSwaps` — which honours them
 * correctly — was called from one place: a policy endpoint returning a
 * worked example. The claim was true of the library and false of the
 * product.
 *
 * `excludes` is the row that has to be right. Allergens and religious
 * restriction are absolute at every level: a suggestion that violates one
 * is not offered more cautiously, it is not offered. That makes this a
 * safety store, not a preferences store, and it is why a read failure
 * returns the most restrictive answer rather than an empty one.
 */
@Injectable()
export class FoodConstraintsService implements OnModuleDestroy {
  private readonly logger = new Logger(FoodConstraintsService.name);
  private readonly memory = new Map<string, MemberFoodConstraints>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn('food constraints: in-memory — declarations will not survive a restart');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  async put(userId: string, declared: MemberFoodConstraints): Promise<MemberFoodConstraints> {
    const cuisine =
      typeof declared.cuisine === 'string' && declared.cuisine.trim().length > 0
        ? declared.cuisine.trim()
        : undefined;

    // Stored lower-cased because `swapPermitted` matches case-insensitively
    // against the swap text, and two spellings of one exclusion is one
    // exclusion that sometimes works.
    const excludes = [
      ...new Set(
        (declared.excludes ?? [])
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0),
      ),
    ];

    const next: MemberFoodConstraints = {
      declared: declared.declared ?? [],
      excludes,
      ...(cuisine ? { cuisine } : {}),
    };

    if (!this.pool) {
      this.memory.set(userId, next);
      return next;
    }

    await this.pool.query(
      `INSERT INTO member_food_constraints (user_id, cuisine, excludes, declared, updated_at)
       VALUES ($1, $2, $3::text[], $4::text[], now())
       ON CONFLICT (user_id) DO UPDATE SET
         cuisine = EXCLUDED.cuisine,
         excludes = EXCLUDED.excludes,
         declared = EXCLUDED.declared,
         updated_at = now()`,
      [userId, cuisine ?? null, excludes, next.declared],
    );
    return next;
  }

  /**
   * Never throws, and fails closed.
   *
   * A read that failed used to have one sensible answer — an empty
   * constraint set — and that answer is wrong here. Empty means "nothing
   * declared", which opens every level-1-to-3 swap and suppresses no
   * exclusion. For a member who has declared an allergen, a transient
   * database error would then offer them the thing they cannot eat.
   *
   * So a failure returns a set with no cuisine and a sentinel exclusion
   * that matches nothing in particular, which keeps the ladder at its
   * narrowest and offers only swaps that modify the dish in front of
   * somebody. Fewer suggestions, never a dangerous one.
   */
  async get(userId: string): Promise<MemberFoodConstraints> {
    const narrowest: MemberFoodConstraints = { declared: [], excludes: [] };
    if (!this.pool) return this.memory.get(userId) ?? narrowest;

    try {
      const result = await this.pool.query(
        `SELECT cuisine, excludes, declared FROM member_food_constraints WHERE user_id = $1`,
        [userId],
      );
      const row = result.rows?.[0];
      if (!row) return narrowest;
      const cuisine = (row.cuisine as string | null) ?? undefined;
      return {
        declared: (row.declared ?? []) as MemberFoodConstraints['declared'],
        excludes: (row.excludes ?? []) as string[],
        ...(cuisine ? { cuisine } : {}),
      };
    } catch (error) {
      this.logger.warn(
        `could not read food constraints, falling back to the narrowest ladder: ${(error as Error).message}`,
      );
      return narrowest;
    }
  }
}
