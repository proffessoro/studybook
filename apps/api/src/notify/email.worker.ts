import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createTransport } from 'nodemailer';
import { env } from '../config/env.js';
import { EMAIL_QUEUE, type EmailJob } from './email-job.js';
import { renderEmail } from './templates.js';

/** Sends queued emails over SMTP (design §2: Nodemailer, run by the worker). */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<EmailJob>;
  private readonly transport = createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
  });

  onModuleInit(): void {
    this.worker = new Worker<EmailJob>(
      EMAIL_QUEUE,
      async (job) => {
        const { subject, text, html } = renderEmail(job.data);
        await this.transport.sendMail({ from: env.smtp.from, to: job.data.to, subject, text, html });
      },
      { connection: { url: env.redisUrl, maxRetriesPerRequest: null }, concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Email ${job?.name} failed (attempt ${job?.attemptsMade}): ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.transport.close();
  }
}
