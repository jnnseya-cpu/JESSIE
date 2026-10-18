import { IsISO8601, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Who reviewed a movement, and when.
 *
 * Required rather than optional because the database requires it:
 * `published_requires_review` in migration 0001 refuses any published row
 * without both. Validating here turns a constraint violation into a
 * readable 400, and means the reviewer is recorded against the movement
 * rather than inferred from whoever was holding an admin session.
 *
 * Not an enum of staff ids, because the reviewer is a clinician outside
 * this system — a physiotherapy registration number, a name, whatever the
 * organisation can later be held to. The point is that it is *somebody*,
 * and that the record says who.
 */
export class PublishReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  physioReviewerId!: string;

  /** The date of the review, not the date of the publish. */
  @IsISO8601()
  reviewDate!: string;
}
