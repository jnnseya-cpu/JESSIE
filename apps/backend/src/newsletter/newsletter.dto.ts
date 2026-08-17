import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Request bodies as classes, for the same reason as everywhere else in
 * this application: an interface is erased before the global
 * ValidationPipe can see it, so an interface-typed body is an unvalidated
 * body wearing a type.
 */

export class IssueStatusDto {
  @IsIn(['in_review', 'approved', 'draft', 'archived'])
  to!: 'in_review' | 'approved' | 'draft' | 'archived';

  /**
   * Required in practice when `to` is 'approved' — the service refuses
   * without it and the database refuses after that. Optional here because
   * the other transitions genuinely do not need a name.
   */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reviewer?: string;
}

export class ComposeDto {
  /** Defaults to the current ISO week when absent. */
  @IsOptional()
  @Matches(/^\d{4}-W\d{2}$/, { message: 'issueKey must look like 2026-W34' })
  issueKey?: string;
}

export class ConsentDto {
  @IsIn(['on', 'off'])
  set!: 'on' | 'off';
}
