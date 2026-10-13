import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { FilesService } from './files.service.js';

const QUEUE = 'maintenance';
const JOB = 'release-expired-uploads';

/** Every 10 minutes, gives back the quota of uploads that were never finished (design §5.5). */
@Injectable()
export class StorageCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageCleanupWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly files: FilesService) {}

  async onModuleInit(): Promise<void> {
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE, { connection });
    // One schedule however many workers start: BullMQ keys it by name.
    await this.queue.upsertJobScheduler(JOB, { every: 10 * 60 * 1000 }, { name: JOB });
    this.worker = new Worker(
      QUEUE,
      async () => {
        const released = await this.files.releaseExpired();
        if (released > 0) this.logger.log(`Released ${released} unfinished upload(s)`);
      },
      { connection },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
