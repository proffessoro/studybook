import { Module } from '@nestjs/common';
import { BullmqOutbox } from './bullmq-outbox.js';
import { Outbox } from './email-job.js';

/** Queues emails (verification and recovery only, design §3.2). */
@Module({
  providers: [{ provide: Outbox, useClass: BullmqOutbox }],
  exports: [Outbox],
})
export class NotifyModule {}
