import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { env } from '../config/env.js';
import { StorageDriver, TooManyBytesError } from './storage-driver.js';

/** Files on the server's disk (a Docker volume in production). The default for self-hosters. */
@Injectable()
export class LocalStorage extends StorageDriver {
  private readonly root = path.resolve(env.storageDir);

  async write(key: string, body: Readable, maxBytes: number): Promise<number> {
    const target = this.pathOf(key);
    const temporary = `${target}.part`;
    await mkdir(path.dirname(target), { recursive: true });

    let written = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        written += chunk.length;
        callback(written > maxBytes ? new TooManyBytesError() : null, chunk);
      },
    });
    try {
      await pipeline(body, counter, createWriteStream(temporary));
      // Only complete files get their real name, so a broken upload never looks finished.
      await rename(temporary, target);
      return written;
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  read(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.pathOf(key), range);
  }

  async localPath(key: string): Promise<string> {
    return this.pathOf(key);
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  /** Keys are made by the API (groups/<id>/<id>); this also refuses anything leaving the root. */
  private pathOf(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Storage key outside the storage root: ${key}`);
    return full;
  }
}
