import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, type InviteLinkView, type InvitePreview, type JoinRequestView, type JoinResult } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { type Group, Prisma, type User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { canAccessGroup } from './group-access.guard.js';
import { bannedError, MembershipsService } from './memberships.service.js';

function invalidInvite() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.INVITE_INVALID, 'This invite link no longer works');
}

/** Invite links (GRP-03) and join requests (MEM-04). */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** The group's active link, created the first time the leader asks for it. */
  async currentLink(group: Group, leader: User): Promise<InviteLinkView> {
    const active = await this.prisma.inviteLink.findFirst({ where: { groupId: group.id, active: true } });
    return toView(active ?? (await this.prisma.inviteLink.create({ data: newLink(group, leader) })));
  }

  /** GRP-03: a new link; the old one stops working. */
  async resetLink(group: Group, leader: User): Promise<InviteLinkView> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.inviteLink.updateMany({ where: { groupId: group.id, active: true }, data: { active: false } }),
      this.prisma.inviteLink.create({ data: newLink(group, leader) }),
    ]);
    return toView(created);
  }

  /** What the person opening the link sees. Works logged out, so they can decide to sign up. */
  async preview(token: string, viewer: User | null): Promise<InvitePreview> {
    const link = await this.activeLink(token);
    const group = link.group;
    const memberCount = await this.prisma.membership.count({ where: { groupId: group.id, status: 'active' } });

    let state: InvitePreview['viewer'] = null;
    if (viewer) {
      const [membership, pending] = await Promise.all([
        this.prisma.membership.findUnique({ where: { groupId_userId: { groupId: group.id, userId: viewer.id } } }),
        this.prisma.joinRequest.findFirst({ where: { groupId: group.id, userId: viewer.id, status: 'pending' } }),
      ]);
      state = membership?.status === 'banned' ? 'banned' : canAccessGroup(membership) ? 'member' : pending ? 'pending' : 'none';
    }

    return {
      groupName: group.name,
      description: group.description,
      memberCount,
      requiresApproval: group.inviteRequiresApproval,
      full: group.memberCap !== null && memberCount >= group.memberCap,
      viewer: state,
      groupId: state === 'member' ? group.id : null,
    };
  }

  /** Joins right away, or asks the leader when the group wants approval (GRP-02). */
  async join(token: string, user: User): Promise<JoinResult> {
    await this.rateLimiter.consume({ key: `join:user:${user.id}`, max: 30, windowSeconds: 3600 });
    const { group } = await this.activeLink(token);

    if (!group.inviteRequiresApproval) {
      await this.prisma.$transaction((tx) => this.memberships.join(tx, group.id, user));
      return { status: 'joined', groupId: group.id };
    }

    const membership = await this.prisma.membership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
    });
    if (membership?.status === 'banned') throw bannedError();
    if (canAccessGroup(membership)) return { status: 'joined', groupId: group.id };
    if (group.status === 'archived') {
      throw new ApiError(HttpStatus.CONFLICT, ErrorCode.GROUP_ARCHIVED, 'This group is archived (read-only)');
    }
    try {
      await this.prisma.joinRequest.create({ data: { groupId: group.id, userId: user.id, source: 'invite' } });
    } catch (error) {
      // Already waiting: the partial unique index allows one pending request per person.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
    return { status: 'requested', groupId: group.id };
  }

  /** MEM-04: pending requests, oldest first. */
  async pendingRequests(group: Group): Promise<JoinRequestView[]> {
    const requests = await this.prisma.joinRequest.findMany({
      where: { groupId: group.id, status: 'pending' },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return requests.map((r) => ({
      id: r.id,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      user: { pseudo: r.user.pseudo, fullName: r.user.fullName, email: r.user.email, phone: r.user.phone },
    }));
  }

  /** MEM-04: accepting runs the same join checks (ban, member cap). A full group keeps the request pending. */
  async decide(group: Group, requestId: string, decision: 'accept' | 'reject'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.joinRequest.findFirst({ where: { id: requestId, groupId: group.id }, include: { user: true } });
      if (!request) throw new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Request not found');
      if (request.status !== 'pending') {
        throw new ApiError(HttpStatus.CONFLICT, ErrorCode.REQUEST_ALREADY_DECIDED, 'This request was already answered');
      }
      if (decision === 'accept') await this.memberships.join(tx, group.id, request.user);
      await tx.joinRequest.update({ where: { id: request.id }, data: { status: decision === 'accept' ? 'accepted' : 'rejected' } });
    });
  }

  private async activeLink(token: string) {
    const link = await this.prisma.inviteLink.findUnique({ where: { token }, include: { group: true } });
    if (!link?.active) throw invalidInvite();
    return link;
  }
}

function newLink(group: Group, leader: User) {
  return { groupId: group.id, createdById: leader.id, token: randomBytes(18).toString('base64url') };
}

function toView(link: { token: string; createdAt: Date }): InviteLinkView {
  return { token: link.token, createdAt: link.createdAt.toISOString() };
}
