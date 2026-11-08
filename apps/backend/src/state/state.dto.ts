import { IsDefined } from 'class-validator';

/**
 * `PUT /state/:key` had no DTO.
 *
 * Its body was typed inline as `{ value: unknown }`. TypeScript erases an
 * inline type, so the global ValidationPipe — `whitelist`,
 * `forbidNonWhitelisted`, `transform` — had no class to validate against
 * and the body arrived unexamined. Same root cause as the basket
 * endpoint that read a string as a two-hundred-item shop, and as the
 * movement library's write route: a type is not a validator.
 *
 * What this restores is the pipe, not a schema for the draft. `value`
 * stays `unknown` on purpose — this route stores a client's work in
 * progress, and the six allowed keys hold genuinely different documents.
 * Constraining its shape here would mean this file had to know about
 * every form in the product, which is how a validator becomes a second
 * source of truth and then a wrong one.
 *
 * The protections that matter are already in `state.logic.ts` and run on
 * every save: the key must be one of six, the serialised document is
 * capped at 24,000 bytes, and a consent, date-of-birth, clinical,
 * credential or guardian field found anywhere inside it is refused
 * outright so a draft cannot be used to smuggle one. What a DTO adds is
 * that the body must actually carry `value`, and that any other
 * top-level key is rejected rather than quietly ignored — an autosave
 * that accepts a misspelled field and reports success is an autosave
 * that loses work.
 */
export class SaveStateDto {
  /**
   * The draft document. Deliberately unconstrained in shape, and
   * deliberately required: `undefined` is refused here rather than
   * reaching `checkDocument` to be refused as "nothing to save".
   */
  @IsDefined({ message: 'a save must carry a value' })
  value!: unknown;
}
