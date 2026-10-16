import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { GroupAccessGuard } from './group-access.guard.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

/** Groups and their settings (GRP-01, 02, 05). Invites, members, and the catalogue join in the next steps. */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupAccessGuard],
  exports: [GroupsService, GroupAccessGuard],
})
export class GroupsModule {}
