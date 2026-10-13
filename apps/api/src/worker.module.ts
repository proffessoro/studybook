import { Module } from '@nestjs/common';
import { EmailWorker } from './notify/email.worker.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageCleanupWorker } from './storage/storage-cleanup.worker.js';
import { StorageModule } from './storage/storage.module.js';

/** Background jobs (design §3): started by `worker.ts`, or inside the API when WORKER_IN_PROCESS=true. */
@Module({
  imports: [PrismaModule, RedisModule, StorageModule],
  providers: [EmailWorker, StorageCleanupWorker],
})
export class WorkerModule {}
