import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { EMAIL_QUEUE, type EmailJob, Outbox } from './email-job.js';

@Injectable()
export class BullmqOutbox extends Outbox implements OnModuleDestroy {
  // Opened on first use, so starting the app (e.g. to generate the OpenAPI spec) needs no Valkey.
  private queue?: Queue<EmailJob>;

  async send(job: EmailJob): Promise<void> {
    this.queue ??= new Queue<EmailJob>(EMAIL_QUEUE, { connection: { url: env.redisUrl } });
    await this.queue.add(job.template, job, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      // The job holds a one-time code: don't keep it around once sent.
      removeOnComplete: true,
      removeOnFail: { age: 24 * 3600 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
