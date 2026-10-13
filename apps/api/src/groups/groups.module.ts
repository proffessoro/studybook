import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { GroupAccessGuard } from './group-access.guard.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitePreviewController, InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { MembershipsService } from './memberships.service.js';

/** Groups, settings, invites, and joining (GRP-01, 02, 03, 05, MEM-04, LIM-02). Members and the catalogue come next. */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [GroupsController, InvitesController, InvitePreviewController],
  providers: [GroupsService, GroupAccessGuard, InvitesService, MembershipsService],
  exports: [GroupsService, GroupAccessGuard, MembershipsService],
})
export class GroupsModule {}
