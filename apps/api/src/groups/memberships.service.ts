import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { canAccessGroup } from './group-access.guard.js';

/**
 * Joining a group, by any path (invite link, accepted request). One function,
 * run inside the caller's transaction (design §5.7).
 */
@Injectable()
export class MembershipsService {
  /**
   * Makes `user` an active member. Already a member: nothing to do. Checks, with
   * the group row locked so concurrent joins see each other: the group is active,
   * the user is active and not banned, and the member cap isn't reached (LIM-02).
   */
  async join(tx: Prisma.TransactionClient, groupId: string, user: User): Promise<void> {
    const [group] = await tx.$queryRaw<{ member_cap: number | null; status: string }[]>`
      SELECT member_cap, status FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
    if (!group) throw new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Group not found');
    if (group.status === 'archived') {
      throw new ApiError(HttpStatus.CONFLICT, ErrorCode.GROUP_ARCHIVED, 'This group is archived (read-only)');
    }
    if (user.status !== 'active') throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Account not active');

    const existing = await tx.membership.findUnique({ where: { groupId_userId: { groupId, userId: user.id } } });
    if (existing?.status === 'banned') throw bannedError();
    if (existing && canAccessGroup(existing)) return;

    if (group.member_cap !== null) {
      const members = await tx.membership.count({ where: { groupId, status: 'active' } });
      if (members >= group.member_cap) {
        throw new ApiError(HttpStatus.CONFLICT, ErrorCode.GROUP_FULL, 'This group is full', { memberCap: group.member_cap });
      }
    }

    // Someone coming back (after leaving or being removed) starts again as a member,
    // and earlier tasks don't apply to them (TSK-07: joinedAt is now).
    const fresh = { status: 'active', role: 'member', joinedAt: new Date(), accessExpiresAt: null } as const;
    if (existing) await tx.membership.update({ where: { id: existing.id }, data: fresh });
    else await tx.membership.create({ data: { groupId, userId: user.id, ...fresh } });
  }
}

export function bannedError() {
  return new ApiError(HttpStatus.FORBIDDEN, ErrorCode.BANNED_FROM_GROUP, 'You were banned from this group');
}
