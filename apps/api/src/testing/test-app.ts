import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Redis } from 'ioredis';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { type EmailJob, Outbox } from '../notify/email-job.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { MediaQueue } from '../storage/media-queue.js';

/** Keeps the files to process in memory; tests run the processor themselves. */
export class FakeMediaQueue extends MediaQueue {
  readonly queued: string[] = [];

  async add(fileId: string): Promise<void> {
    this.queued.push(fileId);
  }
}

const STARTER_CATEGORIES = ['languages', 'tech', 'business', 'faith', 'health', 'exam-prep'];

/** Keeps emails in memory instead of queueing them. */
export class FakeOutbox extends Outbox {
  readonly sent: EmailJob[] = [];

  async send(job: EmailJob): Promise<void> {
    this.sent.push(job);
  }

  /** The latest email of this kind sent to the address. */
  last<T extends EmailJob['template']>(email: string, template: T): Extract<EmailJob, { template: T }> | undefined {
    return this.sent.findLast((job): job is Extract<EmailJob, { template: T }> => job.to === email && job.template === template);
  }
}

/** The full app against the test database and Valkey db 1 (see vitest.config.ts). */
export async function createTestApp() {
  const outbox = new FakeOutbox();
  const media = new FakeMediaQueue();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Outbox)
    .useValue(outbox)
    .overrideProvider(MediaQueue)
    .useValue(media)
    .compile();

  const app = configureApp(moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS);

  return {
    app,
    outbox,
    media,
    prisma,
    /** Empties every table and the rate-limit counters. */
    async reset() {
      outbox.sent.length = 0;
      media.queued.length = 0;
      await prisma.$executeRawUnsafe('TRUNCATE users, groups, instance_settings CASCADE');
      // Keep the starter categories from the migration; drop any a test added.
      await prisma.category.deleteMany({ where: { key: { notIn: STARTER_CATEGORIES } } });
      await redis.flushdb();
    },
  };
}
