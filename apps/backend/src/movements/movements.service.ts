import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  AGE_MODES,
  MOVEMENT_VARIANTS,
  VARIANT_LABELS,
  evaluatePublishGate,
  type Movement,
  type PublishGateFailure,
} from '@jessmove/shared';
import { makePool, type PgPoolLike } from '../db/pg';

/**
 * Library service. Enforces the five-variant publishing gate. §11.
 *
 * The gate is enforced in the API, not by process discipline. There is
 * no override flag and no admin bypass — a partial movement stays in
 * `draft` indefinitely.
 *
 * ── What this used to be ───────────────────────────────────────────────
 *
 * `new Map<string, Movement>()`, and nothing else. Which meant:
 *
 *  - `GET /movements` returned `[]` in production for as long as there has
 *    been a production, and read as "no content authored yet" when it
 *    actually meant "there is nowhere for content to live".
 *  - on serverless every cold start began with an empty library, so an
 *    author could create a movement, pass the gate, publish it, and find
 *    it gone minutes later with no error anywhere. The worst failure shape
 *    there is, because the work looks accepted.
 *  - `movements`, `movement_variants` and `movement_cue_sets` have existed
 *    since migration 0001, fully modelled, and were never read or written
 *    by anything. Including the constraint that matters most:
 *
 *        CONSTRAINT published_requires_review
 *          CHECK (state <> 'published' OR (physio_reviewer_id IS NOT NULL
 *                                          AND review_date IS NOT NULL))
 *
 *    The clinical review the public site promises was already a promise
 *    the database keeps. Nothing was asking it to.
 *
 * So the gate is now enforced twice on purpose: `evaluatePublishGate` in
 * TypeScript, for the readable failure list an author needs, and the SQL
 * CHECK underneath it, which holds whoever writes the column next.
 */
@Injectable()
export class MovementsService implements OnModuleDestroy {
  private readonly logger = new Logger(MovementsService.name);
  private readonly memory = new Map<string, Movement>();
  private pool: PgPoolLike | null = null;

  constructor() {
    this.pool = makePool(process.env.DATABASE_URL, 2);
    if (!this.pool) {
      this.logger.warn(
        'movement library: in-memory — authored movements will not survive a restart',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  private async query(sql: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(sql, values);
    return result.rows ?? [];
  }

  /**
   * One round trip for the whole library rather than one per movement.
   *
   * A movement is only ever read with its variants and their cue sets, so
   * the joins are assembled here instead of being N+1 queries behind a
   * tidier-looking API.
   */
  private async assemble(where: string, values: unknown[] = []): Promise<Movement[]> {
    const rows = await this.query(
      `SELECT m.id, m.slug, m.title, m.state, m.created_at, m.updated_at,
              v.id   AS variant_id,
              v.variant, v.duration_seconds, v.contraindication_tags,
              v.instruction_text, v.screening_passed, v.vector, v.environments,
              c.age_mode, c.instructions, c.safety_note
         FROM movements m
         LEFT JOIN movement_variants  v ON v.movement_id = m.id
         LEFT JOIN movement_cue_sets  c ON c.variant_id  = v.id
        ${where}
        ORDER BY m.title, v.variant, c.age_mode`,
      values,
    );

    const byId = new Map<string, Movement>();

    for (const r of rows) {
      const id = String(r.id);
      let movement = byId.get(id);
      if (!movement) {
        movement = {
          id,
          slug: String(r.slug),
          title: String(r.title),
          state: r.state as Movement['state'],
          variants: [],
          createdAt: new Date(String(r.created_at)).toISOString(),
          updatedAt: new Date(String(r.updated_at)).toISOString(),
        };
        byId.set(id, movement);
      }

      // LEFT JOIN: a movement with no variants yet is a real row, and it is
      // precisely the state the gate exists to refuse. It must survive the
      // read rather than vanish from the library.
      if (r.variant_id === null || r.variant_id === undefined) continue;

      type VariantRecord = Movement['variants'][number];
      const variantKey = String(r.variant) as VariantRecord['variant'];
      let variant = movement.variants.find((v) => v.variant === variantKey);
      if (!variant) {
        const made: VariantRecord = {
          id: String(r.variant_id),
          variant: variantKey,
          // Both columns arrived in migration 0033, which is the migration
          // that let this type and this table describe the same object.
          vector: (r.vector ?? {}) as VariantRecord['vector'],
          environments: (r.environments ?? []) as VariantRecord['environments'],
          durationSeconds: Number(r.duration_seconds),
          contraindications: (r.contraindication_tags ?? []) as VariantRecord['contraindications'],
          instructionText: String(r.instruction_text ?? ''),
          screeningPassed: r.screening_passed === true,
          cueSets: [],
        };
        movement.variants.push(made);
        variant = made;
      }

      if (r.age_mode === null || r.age_mode === undefined) continue;
      variant.cueSets.push({
        ageMode: r.age_mode as Movement['variants'][number]['cueSets'][number]['ageMode'],
        instructions: (r.instructions ?? []) as string[],
        safetyNote: (r.safety_note as string | null) ?? undefined,
      });
    }

    return [...byId.values()];
  }

  /**
   * What the public may see: published movements only.
   *
   * This returned everything, drafts included, from an unguarded route. It
   * leaked nothing only because the library was empty — the moment a
   * movement was authored, unreviewed health content would have been
   * public. The standing rule is that nothing written about health reaches
   * the public without a named human reviewer, and a draft is by
   * definition the state before that review.
   */
  async published(): Promise<Movement[]> {
    if (!this.pool) {
      return [...this.memory.values()].filter((m) => m.state === 'published');
    }
    return this.assemble(`WHERE m.state = 'published'`);
  }

  /** Everything, in every state. Admin-only at the route. */
  async all(): Promise<Movement[]> {
    if (!this.pool) return [...this.memory.values()];
    return this.assemble('');
  }

  async get(id: string): Promise<Movement | undefined> {
    if (!this.pool) return this.memory.get(id);
    // A slug is how a movement is addressed by anything but the library
    // itself, and `id` is a uuid — accept either rather than making the
    // caller know which it holds.
    const found = await this.assemble(`WHERE m.slug = $1 OR m.id::text = $1`, [id]);
    return found[0];
  }

  /**
   * Author or replace a movement, with its variants and their cue sets.
   *
   * Written as a sequence of statements rather than one transaction,
   * because the pool exposes `query` and not a checked-out connection, and
   * `BEGIN` across a pool is a transaction on whichever connection
   * happened to answer. That would be unacceptable for money and is
   * acceptable here, for one specific reason: **a partial write cannot
   * publish.** It leaves a movement missing a variant or a cue set, which
   * is exactly the state `evaluatePublishGate` and
   * `published_requires_review` both refuse. The failure mode of an
   * interrupted author is a draft that will not publish until somebody
   * finishes it — which is the correct outcome, not a corrupted one.
   *
   * `state` is never taken from the caller. It was: `upsert` wrote
   * whatever state it was handed, which is the draft-to-published edge the
   * rules say must not exist. The only route to `published` is `publish`,
   * which evaluates the gate and records a reviewer.
   */
  async upsert(movement: Movement): Promise<Movement> {
    if (!this.pool) {
      const existing = this.memory.get(movement.id);
      const next: Movement = {
        ...movement,
        state: existing?.state ?? 'draft',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.memory.set(next.id, next);
      return next;
    }

    // Addressed by slug, which is the stable human identifier. `id` is a
    // generated uuid, so a caller authoring a new movement has none to
    // send and must not have to invent one.
    const upserted = await this.query(
      `INSERT INTO movements (slug, title, category, state)
       VALUES ($1, $2, $3, 'draft')
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title,
                                        category = EXCLUDED.category,
                                        updated_at = now()
       RETURNING id`,
      [movement.slug, movement.title, (movement as { category?: string }).category ?? 'mobility'],
    );
    const movementId = String(upserted[0]?.id ?? '');
    if (!movementId) throw new BadRequestException('Could not write the movement.');

    /*
     * Variants are replaced rather than merged. A variant that the author
     * removed has to disappear, and `ON DELETE CASCADE` takes its cue sets
     * with it — a merge would leave the removed variant published-eligible
     * for ever, which is how a library ends up offering a movement nobody
     * authored.
     */
    await this.query(`DELETE FROM movement_variants WHERE movement_id = $1`, [movementId]);

    for (const variant of movement.variants ?? []) {
      const inserted = await this.query(
        `INSERT INTO movement_variants
           (movement_id, variant, duration_seconds, contraindication_tags,
            instruction_text, screening_passed,
            vector, environments)
         VALUES ($1, $2::movement_variant, $3, $4::text[], $5, $6, $7::jsonb, $8::text[])
         RETURNING id`,
        [
          movementId,
          variant.variant,
          variant.durationSeconds,
          variant.contraindications ?? [],
          variant.instructionText ?? '',
          variant.screeningPassed === true,
          JSON.stringify(variant.vector ?? {}),
          variant.environments ?? [],
        ],
      );
      const variantId = String(inserted[0]?.id ?? '');
      if (!variantId) continue;

      for (const cue of variant.cueSets ?? []) {
        await this.query(
          `INSERT INTO movement_cue_sets (variant_id, age_mode, instructions, safety_note)
           VALUES ($1, $2::age_mode, $3::text[], $4)
           ON CONFLICT (variant_id, age_mode) DO UPDATE
             SET instructions = EXCLUDED.instructions,
                 safety_note  = EXCLUDED.safety_note`,
          [variantId, cue.ageMode, cue.instructions ?? [], cue.safetyNote ?? null],
        );
      }
    }

    const saved = await this.get(movement.slug);
    if (!saved) throw new BadRequestException('The movement was written and could not be read back.');
    return saved;
  }

  /** Dry-run the gate without attempting to publish. */
  checkGate(movement: Movement): PublishGateFailure[] {
    return evaluatePublishGate(movement, AGE_MODES);
  }

  /**
   * Publishing needs a named reviewer, and the database agrees.
   *
   * `published_requires_review` refuses the row without one, so this is
   * not belt-and-braces: a publish without a reviewer fails either way.
   * Taking it as an argument means the failure is a readable 400 rather
   * than a constraint violation, and means the reviewer is recorded
   * against the movement instead of being implied by whoever held an
   * admin session.
   */
  async publish(
    id: string,
    review: { physioReviewerId: string; reviewDate: string },
  ): Promise<Movement> {
    const movement = await this.get(id);
    if (!movement) {
      throw new BadRequestException(`Movement ${id} not found.`);
    }

    const failures = this.checkGate(movement);
    if (failures.length > 0) {
      throw new BadRequestException({
        code: 'publish_gate_failed',
        message:
          'A movement cannot be published until all five variants exist, each with a cue set ' +
          'for every age mode and a passed safety screening.',
        requiredVariants: MOVEMENT_VARIANTS.map((v) => VARIANT_LABELS[v]),
        failures,
      });
    }

    const published: Movement = {
      ...movement,
      state: 'published',
      updatedAt: new Date().toISOString(),
    };

    if (!this.pool) {
      this.memory.set(published.id, published);
      return published;
    }

    await this.query(
      `UPDATE movements
          SET state = 'published',
              physio_reviewer_id = $2,
              review_date = $3::date,
              updated_at = now()
        WHERE id = $1`,
      [movement.id, review.physioReviewerId, review.reviewDate],
    );

    return published;
  }
}
