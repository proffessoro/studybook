import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';

/** Courses, modules, and lessons (design §3.2 `content`, CNT-01…03). */
@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
