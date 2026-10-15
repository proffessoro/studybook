import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { LocalStorage } from './local-storage.js';
import { MediaProcessor } from './media-processor.js';
import { BullmqMediaQueue, MediaQueue } from './media-queue.js';
import { StorageDriver } from './storage-driver.js';

/** Uploads, quotas, protected downloads, and media processing (design §3.2 `storage`, LIM-01, LIM-03, CNT-04). */
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [FilesController],
  providers: [FilesService, MediaProcessor, { provide: StorageDriver, useClass: LocalStorage }, { provide: MediaQueue, useClass: BullmqMediaQueue }],
  exports: [FilesService, MediaProcessor, StorageDriver, MediaQueue],
})
export class StorageModule {}
