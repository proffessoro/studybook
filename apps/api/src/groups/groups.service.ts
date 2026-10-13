import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  can,
  type CreateGroupInput,
  type DeleteGroupInput,
  ErrorCode,
  type GroupView,
  type MyGroup,
  type UpdateGroupInput,
} from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Group, Membership, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';

/** `Ama's Python club!` → `amas-python-club-k3x9q2`: readable, and unique thanks to the suffix. */
function makeSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const suffix = randomBytes(4).readUInt32BE().toString(36).padStart(6, '0').slice(0, 6);
  return base ? `${base}-${suffix}` : suffix;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** GRP-01: the creator becomes the leader. Quota and member cap start from the instance defaults. */
  async create(user: User, input: z.output<typeof CreateGroupInput>): Promise<GroupView> {
    // No limit on groups per user (GRP-01); this only stops scripted floods.
    await this.rateLimiter.consume({ key: `group-create:user:${user.id}`, max: 20, windowSeconds: 24 * 3600 });
    const defaults = await this.prisma.instanceSettings.findUnique({ where: { id: 1 } });

    const group = await this.prisma.group.create({
      data: {
        ownerId: user.id,
        name: input.name,
        slug: makeSlug(input.name),
        description: input.description,
        languageLabel: input.languageLabel || null,
        storageQuotaBytes: defaults?.defaultStorageQuotaBytes ?? null,
        memberCap: defaults?.defaultMemberCap ?? null,
        memberships: { create: { userId: user.id, role: 'leader' } },
      },
      include: { memberships: true },
    });
    return this.toView(group, group.memberships[0]!);
  }

  /** The groups the user can open, newest first. */
  async mine(user: User): Promise<MyGroup[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: 'active', OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] },
      include: { group: { include: { _count: { select: { memberships: { where: { status: 'active' } } } } } } },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      status: m.group.status,
      myRole: m.role,
      memberCount: m.group._count.memberships,
    }));
  }

  /** GRP-02. */
  async update(group: Group, membership: Membership, input: z.output<typeof UpdateGroupInput>): Promise<GroupView> {
    const updated = await this.prisma.group.update({
      where: { id: group.id },
      data: {
        ...input,
        ...(input.languageLabel !== undefined ? { languageLabel: input.languageLabel || null } : {}),
      },
    });
    return this.toView(updated, membership);
  }

  /** GRP-05: archived groups are read-only. Unarchiving brings them back. */
  async setArchived(group: Group, membership: Membership, archived: boolean): Promise<GroupView> {
    const updated = await this.prisma.group.update({
      where: { id: group.id },
      data: { status: archived ? 'archived' : 'active' },
    });
    return this.toView(updated, membership);
  }

  /** GRP-05: the leader types the group's name to confirm. Uploaded files are removed with file storage (step 1.4). */
  async delete(group: Group, input: z.output<typeof DeleteGroupInput>): Promise<void> {
    if (input.confirmName.trim() !== group.name) {
      throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.CONFIRMATION_MISMATCH, 'Type the group name exactly to delete it');
    }
    await this.prisma.group.delete({ where: { id: group.id } });
  }

  async toView(group: Group, membership: Membership): Promise<GroupView> {
    const memberCount = await this.prisma.membership.count({ where: { groupId: group.id, status: 'active' } });
    return {
      id: group.id,
      slug: group.slug,
      name: group.name,
      description: group.description,
      visibility: group.visibility,
      inviteRequiresApproval: group.inviteRequiresApproval,
      progressVisibility: group.progressVisibility,
      feedEnabled: group.feedEnabled,
      languageLabel: group.languageLabel,
      status: group.status,
      memberCount,
      memberCap: group.memberCap,
      myRole: membership.role,
      storage: can(membership.role, 'group.storage.view')
        ? {
            usedBytes: Number(group.storageUsedBytes),
            quotaBytes: group.storageQuotaBytes === null ? null : Number(group.storageQuotaBytes),
          }
        : null,
      createdAt: group.createdAt.toISOString(),
    };
  }
}
