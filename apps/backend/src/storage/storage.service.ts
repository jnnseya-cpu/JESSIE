import { Injectable, Logger, NotFoundException } from '@nestjs/common';

/**
 * Where profile media bytes live.
 *
 * Two drivers, chosen by whether BLOB_READ_WRITE_TOKEN is set:
 *
 *  - **Vercel Blob** — the real one, created in the Vercel dashboard's
 *    Storage tab; the token is injected automatically when the store is
 *    connected to the project. Objects are public-read at an unguessable
 *    URL, which is the correct model for avatars: the URL only exists in
 *    profiles the viewer was already allowed to see.
 *
 *  - **Memory** — local development. Bytes are held in the process and
 *    served back from /accounts/media/local/:key, so the whole upload
 *    flow is testable end to end with no cloud account at all.
 *
 * Uploads are keyed by a random UUID, never by user id or filename — a
 * filename is user input, and user input does not belong in a URL path on
 * a storage host.
 */

export interface StoredObject {
  readonly key: string;
  readonly url: string;
  readonly bytes: number;
  readonly driver: 'vercel-blob' | 'memory';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly memory = new Map<string, { bytes: Buffer; contentType: string }>();

  private token(): string {
    return process.env.BLOB_READ_WRITE_TOKEN ?? '';
  }

  driver(): 'vercel-blob' | 'memory' {
    return this.token() ? 'vercel-blob' : 'memory';
  }

  status() {
    return {
      driver: this.driver(),
      note:
        this.driver() === 'vercel-blob'
          ? 'Live. Objects go to Vercel Blob.'
          : 'In-memory. Connect a Blob store in the Vercel dashboard (Storage tab) — the token wires itself.',
    };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    if (this.token()) {
      // Imported lazily: the memory driver must work where @vercel/blob
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

    this.memory.set(key, { bytes, contentType });
    return {
      key,
      url: `/api/accounts/media/local/${key}`,
      bytes: bytes.length,
      driver: 'memory',
    };
  }

  /** Serves a memory-driver object. 404s under the blob driver by design. */
  local(key: string): { bytes: Buffer; contentType: string } {
    const hit = this.memory.get(key);
    if (!hit) throw new NotFoundException('no locally stored object with that key');
    return hit;
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
  }
}
