import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { ChangeRoleInput, MemberList, MemberView, RemoveMemberInput, TransferLeadershipInput } from '@studybook/shared';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Group, Membership } from '../generated/prisma/client.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { CurrentGroup, CurrentMembership, GroupRoute } from './group-access.guard.js';
import { MembersService } from './members.service.js';

@ApiTags('members')
@Controller('groups/:groupId')
@UseGuards(SessionGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @GroupRoute('member.list')
  @ApiZodResponse(200, MemberList, 'Active members; contacts only for the leader')
  async list(@CurrentGroup() group: Group, @CurrentMembership() viewer: Membership): Promise<MemberList> {
    return { members: await this.members.list(group, viewer) };
  }

  @Patch('members/:userId')
  @GroupRoute('member.manage')
  @ApiParam({ name: 'userId', type: String })
  @ApiZodBody(ChangeRoleInput)
  @ApiZodResponse(200, MemberView, 'Role changed')
  changeRole(
    @CurrentGroup() group: Group,
    @CurrentMembership() viewer: Membership,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(ChangeRoleInput)) body: z.output<typeof ChangeRoleInput>,
  ): Promise<MemberView> {
    return this.members.changeRole(group, viewer, userId, body.role);
  }

  @Delete('members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('member.manage')
  @ApiParam({ name: 'userId', type: String })
  @ApiZodBody(RemoveMemberInput)
  @ApiResponse({ status: 204, description: 'Removed (or banned)' })
  async remove(
    @CurrentGroup() group: Group,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(RemoveMemberInput)) body: z.output<typeof RemoveMemberInput>,
  ): Promise<void> {
    await this.members.remove(group, userId, body.ban);
  }

  @Post('transfer-leadership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('leadership.transfer')
  @ApiZodBody(TransferLeadershipInput)
  @ApiResponse({ status: 204, description: 'The member is the new leader; you are now a moderator' })
  async transfer(
    @CurrentGroup() group: Group,
    @CurrentMembership() leader: Membership,
    @Body(new ZodValidationPipe(TransferLeadershipInput)) body: z.output<typeof TransferLeadershipInput>,
  ): Promise<void> {
    await this.members.transferLeadership(group, leader, body.userId);
  }

  @Post('leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('group.leave')
  @ApiResponse({ status: 204, description: 'You left the group' })
  async leave(@CurrentMembership() membership: Membership): Promise<void> {
    await this.members.leave(membership);
  }
}
