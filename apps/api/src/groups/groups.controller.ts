import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { CreateGroupInput, DeleteGroupInput, GroupView, MyGroups, UpdateGroupInput } from '@studybook/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Group, Membership, User } from '../generated/prisma/client.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { CurrentGroup, CurrentMembership, GroupRoute } from './group-access.guard.js';
import { GroupsService } from './groups.service.js';

@ApiTags('groups')
@Controller()
@UseGuards(SessionGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post('groups')
  @ApiZodBody(CreateGroupInput)
  @ApiZodResponse(201, GroupView, 'Group created; you are its leader')
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(CreateGroupInput)) body: z.output<typeof CreateGroupInput>,
  ): Promise<GroupView> {
    return this.groups.create(user, body);
  }

  @Get('me/groups')
  @ApiZodResponse(200, MyGroups, 'The groups you belong to')
  async mine(@CurrentUser() user: User): Promise<MyGroups> {
    return { groups: await this.groups.mine(user) };
  }

  @Get('groups/:groupId')
  @GroupRoute('group.view')
  @ApiZodResponse(200, GroupView, 'The group, as you see it')
  view(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership): Promise<GroupView> {
    return this.groups.toView(group, membership);
  }

  @Patch('groups/:groupId')
  @GroupRoute('group.update')
  @ApiZodBody(UpdateGroupInput)
  @ApiZodResponse(200, GroupView, 'Settings saved')
  update(
    @CurrentGroup() group: Group,
    @CurrentMembership() membership: Membership,
    @Body(new ZodValidationPipe(UpdateGroupInput)) body: z.output<typeof UpdateGroupInput>,
  ): Promise<GroupView> {
    return this.groups.update(group, membership, body);
  }

  @Post('groups/:groupId/archive')
  @HttpCode(HttpStatus.OK)
  @GroupRoute('group.archive')
  @ApiZodResponse(200, GroupView, 'The group is read-only')
  archive(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership): Promise<GroupView> {
    return this.groups.setArchived(group, membership, true);
  }

  @Post('groups/:groupId/unarchive')
  @HttpCode(HttpStatus.OK)
  @GroupRoute('group.archive')
  @ApiZodResponse(200, GroupView, 'The group is active again')
  unarchive(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership): Promise<GroupView> {
    return this.groups.setArchived(group, membership, false);
  }

  @Delete('groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('group.delete')
  @ApiZodBody(DeleteGroupInput)
  @ApiResponse({ status: 204, description: 'Group deleted' })
  async delete(
    @CurrentGroup() group: Group,
    @Body(new ZodValidationPipe(DeleteGroupInput)) body: z.output<typeof DeleteGroupInput>,
  ): Promise<void> {
    await this.groups.delete(group, body);
  }
}
