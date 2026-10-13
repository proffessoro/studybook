import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiParam } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { can, ErrorCode, type GroupAction, permissions } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Group, Membership, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const GROUP_ACTION = 'groupAction';

/**
 * A route under `/groups/:groupId` performing `action`: runs `GroupAccessGuard`
 * (behind `SessionGuard`) and documents the path parameter.
 */
export function GroupRoute(action: GroupAction) {
  return applyDecorators(
    SetMetadata(GROUP_ACTION, action),
    UseGuards(GroupAccessGuard),
    ApiParam({ name: 'groupId', type: String, format: 'uuid' }),
  );
}

type GroupRequest = FastifyRequest & { user?: User; group?: Group; membership?: Membership };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a membership currently gives access. Every group endpoint goes through
 * this one check, so Phase 2 subscriptions only need to set `accessExpiresAt` (design §9).
 */
export function canAccessGroup(membership: Pick<Membership, 'status' | 'accessExpiresAt'> | null): boolean {
  if (!membership || membership.status !== 'active') return false;
  return membership.accessExpiresAt === null || membership.accessExpiresAt > new Date();
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Group not found');
}

/**
 * For routes with `:groupId`, behind `SessionGuard`. Loads the group and the
 * user's membership and enforces the permission matrix (design §5.4):
 * - not a member (or no access): 404, so a private group's existence isn't revealed;
 * - a member without the permission: 403;
 * - a change to an archived group: 409 `GROUP_ARCHIVED` (GRP-05, read-only).
 */
@Injectable()
export class GroupAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.get<GroupAction | undefined>(GROUP_ACTION, context.getHandler());
    if (!action) throw new Error('GroupAccessGuard needs @GroupRoute(action) on the handler');

    const request = context.switchToHttp().getRequest<GroupRequest>();
    const groupId = (request.params as Record<string, string>).groupId ?? '';
    if (!request.user || !UUID.test(groupId)) throw notFound();

    const membership = await this.prisma.membership.findUnique({
      where: { groupId_userId: { groupId, userId: request.user.id } },
      include: { group: true },
    });
    if (!membership || !canAccessGroup(membership)) throw notFound();

    if (!can(membership.role, action)) {
      throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Not allowed in this group');
    }
    if (permissions[action].writes && membership.group.status === 'archived') {
      throw new ApiError(HttpStatus.CONFLICT, ErrorCode.GROUP_ARCHIVED, 'This group is archived (read-only)');
    }

    request.group = membership.group;
    request.membership = membership;
    return true;
  }
}

/** The group from `:groupId`. Only behind `GroupAccessGuard`. */
export const CurrentGroup = createParamDecorator((_data: unknown, context: ExecutionContext): Group => {
  const group = context.switchToHttp().getRequest<GroupRequest>().group;
  if (!group) throw new Error('CurrentGroup used without GroupAccessGuard');
  return group;
});

/** The user's membership in that group. Only behind `GroupAccessGuard`. */
export const CurrentMembership = createParamDecorator((_data: unknown, context: ExecutionContext): Membership => {
  const membership = context.switchToHttp().getRequest<GroupRequest>().membership;
  if (!membership) throw new Error('CurrentMembership used without GroupAccessGuard');
  return membership;
});
