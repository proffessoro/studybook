import { HttpStatus, Injectable } from '@nestjs/common';
import { can, ErrorCode, type MemberView } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Group, Membership, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLE_ORDER = { leader: 0, moderator: 1, member: 2 } as const;

/**
 * The one place that shapes a member for a viewer (design §5.4, MEM-01, NFR-06).
 * Contacts only for viewers allowed `member.contacts.view` (the leader); everyone
 * else gets pseudo and role, and the fields are not sent at all.
 */
export function toMemberView(viewer: Pick<Membership, 'role'>, member: Membership & { user: User }): MemberView {
  return {
    userId: member.userId,
    pseudo: member.user.pseudo,
    role: member.role,
    contact: can(viewer.role, 'member.contacts.view')
      ? {
          fullName: member.user.fullName,
          email: member.user.email,
          phone: member.user.phone,
          joinedAt: member.joinedAt.toISOString(),
        }
      : null,
  };
}

function memberNotFound() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Member not found');
}

function cannotManageLeader() {
  return new ApiError(HttpStatus.FORBIDDEN, ErrorCode.CANNOT_MANAGE_LEADER, 'The leader can only hand over leadership');
}

/** Members, roles, removing and banning, leaving (MEM-01, 02, 03, 05). */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active members: leader first, then moderators, then members, by pseudo. */
  async list(group: Group, viewer: Membership): Promise<MemberView[]> {
    const members = await this.prisma.membership.findMany({
      where: { groupId: group.id, status: 'active' },
      include: { user: true },
    });
    return members
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.user.pseudo.localeCompare(b.user.pseudo))
      .map((m) => toMemberView(viewer, m));
  }

  /** MEM-02: promote to moderator or back to member. */
  async changeRole(group: Group, viewer: Membership, userId: string, role: 'moderator' | 'member'): Promise<MemberView> {
    const target = await this.activeMember(group, userId);
    if (target.role === 'leader') throw cannotManageLeader();
    const updated = await this.prisma.membership.update({ where: { id: target.id }, data: { role }, include: { user: true } });
    return toMemberView(viewer, updated);
  }

  /** MEM-02: another member becomes the leader (and owner); the old leader stays as a moderator. */
  async transferLeadership(group: Group, leader: Membership, userId: string): Promise<void> {
    if (userId === leader.userId) return;
    const target = await this.activeMember(group, userId);
    await this.prisma.$transaction([
      this.prisma.membership.update({ where: { id: target.id }, data: { role: 'leader' } }),
      this.prisma.membership.update({ where: { id: leader.id }, data: { role: 'moderator' } }),
      this.prisma.group.update({ where: { id: group.id }, data: { ownerId: userId } }),
    ]);
  }

  /**
   * MEM-03. Removed members can come back with the link; banned ones can't,
   * and their waiting requests are refused. Their submissions stay for the leader.
   */
  async remove(group: Group, userId: string, ban: boolean): Promise<void> {
    const target = await this.prisma.membership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } });
    // A ban also works on someone who already left, so they can't rejoin.
    if (!target || target.status === 'banned' || (!ban && target.status !== 'active')) throw memberNotFound();
    if (target.role === 'leader') throw cannotManageLeader();

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { id: target.id },
        data: { status: ban ? 'banned' : 'removed', role: 'member' },
      }),
      ...(ban
        ? [this.prisma.joinRequest.updateMany({ where: { groupId: group.id, userId, status: 'pending' }, data: { status: 'rejected' } })]
        : []),
    ]);
  }

  /** MEM-05: the leader hands over first. Submissions stay visible to the leader. */
  async leave(membership: Membership): Promise<void> {
    if (membership.role === 'leader') {
      throw new ApiError(HttpStatus.CONFLICT, ErrorCode.LEADER_MUST_TRANSFER, 'Hand over leadership before leaving');
    }
    await this.prisma.membership.update({ where: { id: membership.id }, data: { status: 'left', role: 'member' } });
  }

  private async activeMember(group: Group, userId: string) {
    const target = await this.prisma.membership.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } });
    if (!target || target.status !== 'active') throw memberNotFound();
    return target;
  }
}
