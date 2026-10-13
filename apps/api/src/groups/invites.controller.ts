import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { DecideJoinRequestInput, InviteLinkView, InvitePreview, JoinRequestList, JoinResult } from '@studybook/shared';
import { CurrentUser, SessionGuard, sessionToken } from '../auth/session.guard.js';
import { Sessions } from '../auth/sessions.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Group, User } from '../generated/prisma/client.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { CurrentGroup, GroupRoute } from './group-access.guard.js';
import { InvitesService } from './invites.service.js';

/**
 * Invite links and join requests. `SessionGuard` sits on the class so it runs
 * before the per-route `GroupAccessGuard`, which needs the user.
 */
@ApiTags('invites')
@Controller()
@UseGuards(SessionGuard)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get('groups/:groupId/invite-link')
  @GroupRoute('invite.manage')
  @ApiZodResponse(200, InviteLinkView, 'The link to share, e.g. on WhatsApp')
  link(@CurrentGroup() group: Group, @CurrentUser() user: User): Promise<InviteLinkView> {
    return this.invites.currentLink(group, user);
  }

  @Post('groups/:groupId/invite-link/reset')
  @HttpCode(HttpStatus.OK)
  @GroupRoute('invite.manage')
  @ApiZodResponse(200, InviteLinkView, 'A new link; the old one stopped working')
  resetLink(@CurrentGroup() group: Group, @CurrentUser() user: User): Promise<InviteLinkView> {
    return this.invites.resetLink(group, user);
  }

  @Post('invites/:token/join')
  @ApiZodResponse(201, JoinResult, 'Joined, or a request was sent to the leader')
  join(@Param('token') token: string, @CurrentUser() user: User): Promise<JoinResult> {
    return this.invites.join(token, user);
  }

  @Get('groups/:groupId/join-requests')
  @GroupRoute('joinRequest.manage')
  @ApiZodResponse(200, JoinRequestList, 'Pending requests, oldest first')
  async requests(@CurrentGroup() group: Group): Promise<JoinRequestList> {
    return { requests: await this.invites.pendingRequests(group) };
  }

  @Patch('groups/:groupId/join-requests/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('joinRequest.manage')
  @ApiZodBody(DecideJoinRequestInput)
  @ApiResponse({ status: 204, description: 'Accepted (now a member) or rejected' })
  async decide(
    @CurrentGroup() group: Group,
    @Param('requestId') requestId: string,
    @Body(new ZodValidationPipe(DecideJoinRequestInput)) body: z.output<typeof DecideJoinRequestInput>,
  ): Promise<void> {
    await this.invites.decide(group, requestId, body.decision);
  }
}

/** The one invite endpoint that works logged out. */
@ApiTags('invites')
@Controller()
export class InvitePreviewController {
  constructor(
    private readonly invites: InvitesService,
    private readonly sessions: Sessions,
  ) {}

  /** Public: someone logged out sees the group and is asked to sign up or log in first (GRP-03). */
  @Get('invites/:token')
  @ApiZodResponse(200, InvitePreview, 'The group behind the link')
  async preview(@Param('token') token: string, @Req() request: FastifyRequest): Promise<InvitePreview> {
    const session = sessionToken(request);
    const viewer = session ? ((await this.sessions.resolve(session))?.user ?? null) : null;
    return this.invites.preview(token, viewer);
  }
}
