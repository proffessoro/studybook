import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';

/** Courses, modules, lessons, their files, and lesson views (design §3.2 `content`, CNT-01…03). */
@Module({
  imports: [AuthModule, GroupsModule, StorageModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
