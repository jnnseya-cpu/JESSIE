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
  /** Set by the guardian confirmation link. Minors start unconfirmed. */
  readonly guardianConfirmed: boolean;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly coverUrl: string | null;
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

const COLUMNS =
  'user_id, email, password_hash, kind, age, guardian_id, guardian_confirmed, display_name, avatar_url, cover_url, created_at';

const CREATE_SQL = `
  INSERT INTO app_users (user_id, email, password_hash, kind, age, guardian_id, display_name)
  VALUES ($1, lower($2), $3, $4, $5, $6, $7)
  RETURNING ${COLUMNS}
`;

const BY_EMAIL_SQL = `SELECT ${COLUMNS} FROM app_users WHERE email = lower($1)`;

const BY_ID_SQL = `SELECT ${COLUMNS} FROM app_users WHERE user_id = $1`;

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    userId: String(row.user_id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    kind: row.kind as AccountKind,
    age: Number(row.age),
    guardianId: row.guardian_id == null ? null : String(row.guardian_id),
    guardianConfirmed: Boolean(row.guardian_confirmed),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
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

    const record: UserRecord = {
      ...user,
      email: user.email.toLowerCase(),
      guardianConfirmed: false,
      avatarUrl: null,
      coverUrl: null,
      createdAt: new Date().toISOString(),
    };
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

  /**
   * The guardian confirmation link's write: resolves a pending guardian
   * email to a real account when one now exists, and marks the link
   * confirmed. Idempotent — clicking the link twice changes nothing.
   */
  async confirmGuardian(minorId: string): Promise<UserRecord | null> {
    const minor = await this.byId(minorId);
    if (!minor) return null;

    let guardianId = minor.guardianId;
    if (guardianId?.startsWith('pending:')) {
      const guardian = await this.byEmail(guardianId.slice('pending:'.length));
      if (guardian) guardianId = guardian.userId;
    }

    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE app_users SET guardian_id = $2, guardian_confirmed = true
         WHERE user_id = $1 RETURNING ${COLUMNS}`,
        [minorId, guardianId],
      );
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    const updated: UserRecord = { ...minor, guardianId, guardianConfirmed: true };
    this.memory.set(minorId, updated);
    return updated;
  }

  /**
   * Changes an account's kind. Only the ADMIN_EMAILS bootstrap calls
   * this; the database's own constraints still apply, so an under-18
   * can never be promoted to anything.
   */
  async setKind(userId: string, kind: AccountKind): Promise<UserRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE app_users SET kind = $2 WHERE user_id = $1 RETURNING ${COLUMNS}`,
        [userId, kind],
      );
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    const existing = this.memory.get(userId);
    if (!existing) return null;
    const updated: UserRecord = { ...existing, kind };
    this.memory.set(userId, updated);
    return updated;
  }

  async updateDisplayName(userId: string, displayName: string): Promise<UserRecord | null> {
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE app_users SET display_name = $2 WHERE user_id = $1 RETURNING ${COLUMNS}`,
        [userId, displayName],
      );
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    const existing = this.memory.get(userId);
    if (!existing) return null;
    const updated: UserRecord = { ...existing, displayName };
    this.memory.set(userId, updated);
    return updated;
  }

  async setMedia(
    userId: string,
    media: { avatarUrl?: string | null; coverUrl?: string | null },
  ): Promise<UserRecord | null> {
    const existing = await this.byId(userId);
    if (!existing) return null;
    const avatarUrl = media.avatarUrl !== undefined ? media.avatarUrl : existing.avatarUrl;
    const coverUrl = media.coverUrl !== undefined ? media.coverUrl : existing.coverUrl;
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE app_users SET avatar_url = $2, cover_url = $3 WHERE user_id = $1 RETURNING ${COLUMNS}`,
        [userId, avatarUrl, coverUrl],
      );
      return result.rows[0] ? rowToUser(result.rows[0]) : null;
    }
    const updated: UserRecord = { ...existing, avatarUrl, coverUrl };
    this.memory.set(userId, updated);
    return updated;
  }

  /** The danger zone's write. Gone means gone. */
  async delete(userId: string): Promise<boolean> {
    if (this.pool) {
      const result = await this.pool.query(
        'DELETE FROM app_users WHERE user_id = $1 RETURNING user_id',
        [userId],
      );
      return result.rows.length > 0;
    }
    return this.memory.delete(userId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
