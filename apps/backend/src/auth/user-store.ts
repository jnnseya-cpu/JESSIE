import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { AccountKind } from '@jessmove/shared';

/**
 * Where user records live.
 *
 * One port, two drivers, chosen by whether DATABASE_URL is set:
 *
 *  - **Postgres** — the real one. Registration must survive a restart, and
 *    on Vercel two function instances must see the same users; memory can
 *    do neither. Vercel's Postgres storage injects DATABASE_URL, and the
 *    identity schema is `db/migrations/0002_identity.sql`.
 *
 *  - **Memory** — local development without a database. The API says which
 *    driver is live at /auth/status rather than letting a developer
 *    mistake one for the other.
 *
 * The table enforces the same rules the service does — minor requires a
 *   guardian, kind must match age, one account per email — so a bug in
 * this layer produces a rejected write, not a corrupt user.
 */

export interface UserRecord {
  readonly userId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly kind: AccountKind;
  readonly age: number;
  readonly guardianId: string | null;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface NewUser {
  readonly userId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly kind: AccountKind;
  readonly age: number;
  readonly guardianId: string | null;
  readonly displayName: string;
}

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

const CREATE_SQL = `
  INSERT INTO app_users (user_id, email, password_hash, kind, age, guardian_id, display_name)
  VALUES ($1, lower($2), $3, $4, $5, $6, $7)
  RETURNING user_id, email, password_hash, kind, age, guardian_id, display_name, created_at
`;

const BY_EMAIL_SQL = `
  SELECT user_id, email, password_hash, kind, age, guardian_id, display_name, created_at
  FROM app_users WHERE email = lower($1)
`;

const BY_ID_SQL = `
  SELECT user_id, email, password_hash, kind, age, guardian_id, display_name, created_at
  FROM app_users WHERE user_id = $1
`;

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    userId: String(row.user_id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    kind: row.kind as AccountKind,
    age: Number(row.age),
    guardianId: row.guardian_id == null ? null : String(row.guardian_id),
    displayName: String(row.display_name),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

@Injectable()
export class UserStore implements OnModuleDestroy {
  private readonly logger = new Logger(UserStore.name);
  private readonly memory = new Map<string, UserRecord>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      // Required lazily so the memory driver works in environments where
      // the pg package cannot load at all.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => PgPoolLike };
      this.pool = new Pool({
        connectionString: url,
        max: 3, // serverless: many instances × small pools, not one big pool
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
      this.logger.log('user store: postgres');
    } else {
      this.logger.warn('user store: in-memory — users will not survive a restart');
    }
  }

  driver(): 'postgres' | 'memory' {
    return this.pool ? 'postgres' : 'memory';
  }

  async create(user: NewUser): Promise<UserRecord> {
    if (this.pool) {
      const result = await this.pool.query(CREATE_SQL, [
        user.userId,
        user.email,
        user.passwordHash,
        user.kind,
        user.age,
        user.guardianId,
        user.displayName,
      ]);
      return rowToUser(result.rows[0]!);
    }

    const record: UserRecord = { ...user, email: user.email.toLowerCase(), createdAt: new Date().toISOString() };
    this.memory.set(user.userId, record);
    return record;
  }

  async byEmail(email: string): Promise<UserRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(BY_EMAIL_SQL, [email]);
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    const lower = email.toLowerCase();
    return [...this.memory.values()].find((u) => u.email === lower) ?? null;
  }

  async byId(userId: string): Promise<UserRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(BY_ID_SQL, [userId]);
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    return this.memory.get(userId) ?? null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
