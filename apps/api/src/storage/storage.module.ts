import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
import { LocalStorage } from './local-storage.js';
import { StorageDriver } from './storage-driver.js';

/** Uploads, quotas, and protected downloads (design §3.2 `storage`, LIM-01, LIM-03). */
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: StorageDriver, useClass: LocalStorage }],
  exports: [FilesService, StorageDriver],
})
export class StorageModule {}
