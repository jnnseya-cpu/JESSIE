import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service';
import { AdminOnly } from '../auth/auth.guard';

/**
 * Browser-openable database health. Like /auth/status, these report
 * configuration and proof, never data: no rows, no connection string,
 * no table contents ever appear in a response.
 */
@Controller('db')
export class DbController {
  constructor(private readonly db: DbService) {}

  /**
   * Reachable without a session on purpose. When a deployment is broken this
   * is where somebody looks to find out why, and requiring a login to read
   * it means requiring the thing that is failing. It lists migration ids and
   * whether the database answers — no rows, no credentials.
   */
  @Get('status')
  status(): Promise<Record<string, unknown>> {
    return this.db.status();
  }

  /**
   * Staff only, unlike status, because this one is not a read.
   *
   * Verifying executes the whole constraint suite — twenty-one statements
   * the schema must reject — against the live database on every call. That
   * is real work, and an endpoint that does real work for anonymous callers
   * is a way to make the database busy from the outside. The answer it gives
   * changes only when a migration does, so nobody needs it on demand.
   */
  @AdminOnly()
  @Get('verify')
  verify(): Promise<Record<string, unknown>> {
    return this.db.verify();
  }
}
