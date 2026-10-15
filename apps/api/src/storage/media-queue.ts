import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { FileKind } from '@studybook/shared';
import { env } from '../config/env.js';

/** Images are quick; audio and video take CPU, so they have their own queue, one at a time (design §7). */
export const MEDIA_QUEUES = { images: 'media-images', av: 'media-av' } as const;
export const queueFor = (kind: FileKind) => (kind === 'image' ? MEDIA_QUEUES.images : MEDIA_QUEUES.av);

export type MediaJob = { fileId: string };

/** Where the API puts files to process. Tests swap in a fake. */
export abstract class MediaQueue {
  abstract add(fileId: string, kind: FileKind): Promise<void>;
}

@Injectable()
export class BullmqMediaQueue extends MediaQueue implements OnModuleDestroy {
  // Opened on first use, so starting the app (e.g. to generate the OpenAPI spec) needs no Valkey.
  private readonly queues = new Map<string, Queue<MediaJob>>();

  async add(fileId: string, kind: FileKind): Promise<void> {
    const name = queueFor(kind);
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue<MediaJob>(name, { connection: { url: env.redisUrl } });
      this.queues.set(name, queue);
    }
    await queue.add('process', { fileId }, {
      // One job per file, even if it is queued again after a restart.
      jobId: fileId,
      attempts: 2,
      backoff: { type: 'fixed', delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
