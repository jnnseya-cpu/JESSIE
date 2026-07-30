import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service';

/**
 * Browser-openable database health. Like /auth/status, these report
 * configuration and proof, never data: no rows, no connection string,
 * no table contents ever appear in a response.
 */
@Controller('db')
export class DbController {
  constructor(private readonly db: DbService) {}

  @Get('status')
  status(): Promise<Record<string, unknown>> {
    return this.db.status();
  }

  @Get('verify')
  verify(): Promise<Record<string, unknown>> {
    return this.db.verify();
  }
}
