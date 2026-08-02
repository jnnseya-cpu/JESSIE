import { Injectable, Logger, NotFoundException } from '@nestjs/common';

/**
 * Where profile media bytes live.
 *
 * Three drivers, in order of preference:
 *
 *  - **Vercel Blob** — when BLOB_READ_WRITE_TOKEN is set. Created in the
 *    Vercel dashboard's Storage tab; the token is injected automatically
 *    when the store is connected. Objects are public-read at an
 *    unguessable URL, which is the correct model for avatars: the URL
 *    only exists in profiles the viewer was already allowed to see.
 *
 *  - **Database** — when there is no Blob token but there is a
 *    DATABASE_URL. This exists because the previous fallback was a Map in
 *    one instance's memory, and on serverless that is not storage: the
 *    upload returned a URL, the next request landed on a different
 *    instance, and the picture 404'd. Uploading something that vanishes is
 *    worse than refusing to upload it.
 *
 *  - **Memory** — local development with neither. The whole flow stays
 *    testable with no cloud account at all.
 *
 * Uploads are keyed by a random UUID, never by user id or filename — a
 * filename is user input, and user input does not belong in a URL path on
 * a storage host.
 */

export type StorageDriver = 'vercel-blob' | 'database' | 'memory';

export interface StoredObject {
  readonly key: string;
  readonly url: string;
  readonly bytes: number;
  readonly driver: StorageDriver;
}

interface PgPoolLike {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly memory = new Map<string, { bytes: Buffer; contentType: string }>();
  private pool: PgPoolLike | null = null;

  constructor() {
    const url = process.env.DATABASE_URL;
    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Pool } = require('pg') as { Pool: new (o: object) => PgPoolLike };
      this.pool = new Pool({
        connectionString: url,
        max: 2,
        ssl: url.includes('sslmode=require') || url.includes('vercel')
          ? { rejectUnauthorized: true }
          : undefined,
      });
    }
  }

  private token(): string {
    return process.env.BLOB_READ_WRITE_TOKEN ?? '';
  }

  driver(): StorageDriver {
    if (this.token()) return 'vercel-blob';
    return this.pool ? 'database' : 'memory';
  }

  status() {
    const driver = this.driver();
    return {
      driver,
      durable: driver !== 'memory',
      note:
        driver === 'vercel-blob'
          ? 'Live. Objects go to Vercel Blob.'
          : driver === 'database'
            ? 'Pictures are kept in the database and served by the API. Connecting a Blob store in the Vercel dashboard moves them to object storage, which is faster and cheaper at scale.'
            : 'In-memory, for local development only. Nothing uploaded here survives a restart.',
    };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    if (this.token()) {
      // Imported lazily: the other drivers must work where @vercel/blob
      // cannot load, and nothing else in the API needs it.
      const { put } = (await import('@vercel/blob')) as {
        put: (
          pathname: string,
          body: Buffer,
          opts: { access: 'public'; token: string; contentType: string; addRandomSuffix: boolean },
        ) => Promise<{ url: string }>;
      };
      const result = await put(`profile-media/${key}`, bytes, {
        access: 'public',
        token: this.token(),
        contentType,
        addRandomSuffix: false, // the key is already a UUID
      });
      return { key, url: result.url, bytes: bytes.length, driver: 'vercel-blob' };
    }

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO media_objects (key, content_type, bytes, byte_size)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE
           SET content_type = EXCLUDED.content_type,
               bytes = EXCLUDED.bytes,
               byte_size = EXCLUDED.byte_size`,
        [key, contentType, bytes, bytes.length],
      );
      return { key, url: this.servedAt(key), bytes: bytes.length, driver: 'database' };
    }

    this.memory.set(key, { bytes, contentType });
    return { key, url: this.servedAt(key), bytes: bytes.length, driver: 'memory' };
  }

  /** Where the API serves an object it holds itself. */
  private servedAt(key: string): string {
    return `/api/accounts/media/local/${key}`;
  }

  /** Serves an object this API holds. 404s under the blob driver by design. */
  async fetch(key: string): Promise<{ bytes: Buffer; contentType: string }> {
    const held = this.memory.get(key);
    if (held) return held;

    if (this.pool) {
      const result = await this.pool.query(
        'SELECT content_type, bytes FROM media_objects WHERE key = $1',
        [key],
      );
      const row = result.rows[0];
      if (row) {
        return {
          bytes: Buffer.from(row.bytes as Buffer),
          contentType: String(row.content_type),
        };
      }
    }

    throw new NotFoundException('no stored object with that key');
  }

  async remove(key: string): Promise<void> {
    if (this.token()) {
      const { del } = (await import('@vercel/blob')) as {
        del: (url: string, opts: { token: string }) => Promise<void>;
      };
      try {
        await del(`profile-media/${key}`, { token: this.token() });
      } catch (error) {
        // Deleting an already-deleted object is success, not an incident.
        this.logger.warn(`blob delete: ${(error as Error).message}`);
      }
      return;
    }
    this.memory.delete(key);
    if (this.pool) {
      try {
        await this.pool.query('DELETE FROM media_objects WHERE key = $1', [key]);
      } catch (error) {
        this.logger.warn(`media delete: ${(error as Error).message}`);
      }
    }
  }
}
