import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { GroupAccessGuard } from './group-access.guard.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitePreviewController, InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { MembershipsService } from './memberships.service.js';

/** Groups, settings, invites, joining, and members (GRP-01, 02, 03, 05, MEM-01…05, LIM-02). The catalogue comes next. */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [GroupsController, InvitesController, InvitePreviewController, MembersController],
  providers: [GroupsService, GroupAccessGuard, InvitesService, MembershipsService, MembersService],
  exports: [GroupsService, GroupAccessGuard, MembershipsService],
})
export class GroupsModule {}
