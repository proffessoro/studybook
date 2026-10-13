import { Module } from '@nestjs/common';
import { EmailWorker } from './notify/email.worker.js';

/** Background jobs (design §3): started by `worker.ts`, or inside the API when WORKER_IN_PROCESS=true. */
@Module({
  providers: [EmailWorker],
})
export class WorkerModule {}
