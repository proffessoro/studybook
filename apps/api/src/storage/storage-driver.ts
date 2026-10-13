import type { Readable } from 'node:stream';

/** Thrown when a stream brings more bytes than allowed. */
export class TooManyBytesError extends Error {}

/**
 * Where file bytes live (design §2, §5.5). `local` disk by default; an
 * S3-compatible driver can replace it without touching the rest of the code.
 */
export abstract class StorageDriver {
  /** Stores the stream under `key`, refusing more than `maxBytes`. Returns the bytes written. */
  abstract write(key: string, body: Readable, maxBytes: number): Promise<number>;
  /** The bytes from `start` to `end` (inclusive), or all of them. */
  abstract read(key: string, range?: { start: number; end: number }): Readable;
  /** A local path for tools that need one (type detection, media processing). */
  abstract localPath(key: string): Promise<string>;
  abstract delete(key: string): Promise<void>;
}
