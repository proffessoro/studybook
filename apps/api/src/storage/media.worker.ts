import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MEDIA_QUEUES, type MediaJob, MediaQueue } from './media-queue.js';
import { MediaProcessor } from './media-processor.js';

/**
 * Processes uploaded media (design §5.5): images two at a time, audio and video
 * one at a time so transcoding can't starve the server (design §7).
 */
@Injectable()
export class MediaWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaWorker.name);
  private workers: Worker<MediaJob>[] = [];

  constructor(
    private readonly processor: MediaProcessor,
    private readonly queue: MediaQueue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = { url: env.redisUrl, maxRetriesPerRequest: null };
    const run = (job: { data: MediaJob }) => this.processor.process(job.data.fileId);
    this.workers = [
      new Worker<MediaJob>(MEDIA_QUEUES.images, run, { connection, concurrency: 2 }),
      // Long jobs: renew the lock well before a long video could lose it.
      new Worker<MediaJob>(MEDIA_QUEUES.av, run, { connection, concurrency: 1, lockDuration: 5 * 60 * 1000 }),
    ];
    for (const worker of this.workers) {
      worker.on('failed', (job, error) => {
        if (!job) return;
        this.logger.warn(`Processing ${job.data.fileId} failed (attempt ${job.attemptsMade}): ${error.message}`);
        if (job.attemptsMade >= (job.opts.attempts ?? 1)) void this.processor.markFailed(job.data.fileId);
      });
    }

    // Files left waiting (the API couldn't queue them, or jobs were lost): queue them again.
    // A file already in the queue keeps its job, since jobs are keyed by file id.
    const pending = await this.prisma.file.findMany({ where: { status: 'ready', processingStatus: 'pending' }, select: { id: true, kind: true } });
    for (const file of pending) await this.queue.add(file.id, file.kind);
    if (pending.length > 0) this.logger.log(`Queued ${pending.length} file(s) still waiting for processing`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
