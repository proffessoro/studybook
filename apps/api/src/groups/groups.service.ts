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

  /** GRP-02, plus categories and tags for the catalogue (GRP-04). */
  async update(group: Group, membership: Membership, input: z.output<typeof UpdateGroupInput>): Promise<GroupView> {
    const { categoryKeys, tags, ...settings } = input;

    const updated = await this.prisma.$transaction(async (tx) => {
      let categoryIds: string[] | undefined;
      if (categoryKeys) {
        const categories = await tx.category.findMany({ where: { key: { in: categoryKeys } } });
        if (categories.length !== categoryKeys.length) throw invalidField('categoryKeys', 'unknown');
        categoryIds = categories.map((c) => c.id);
        await tx.groupCategory.deleteMany({ where: { groupId: group.id } });
        await tx.groupCategory.createMany({ data: categoryIds.map((categoryId) => ({ groupId: group.id, categoryId })) });
      }
      if (tags) {
        await tx.groupTag.deleteMany({ where: { groupId: group.id } });
        await tx.groupTag.createMany({ data: tags.map((tag) => ({ groupId: group.id, tag })) });
      }

      const saved = await tx.group.update({
        where: { id: group.id },
        data: {
          ...settings,
          ...(settings.languageLabel !== undefined ? { languageLabel: settings.languageLabel || null } : {}),
        },
      });
      // GRP-04: a listed group picks one or more categories, so visitors can find it.
      if (saved.visibility === 'listed' && (await tx.groupCategory.count({ where: { groupId: group.id } })) === 0) {
        throw invalidField('categoryKeys', 'required_when_listed');
      }
      return saved;
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
    const [memberCount, categories, tags] = await Promise.all([
      this.prisma.membership.count({ where: { groupId: group.id, status: 'active' } }),
      this.prisma.groupCategory.findMany({ where: { groupId: group.id }, include: { category: true } }),
      this.prisma.groupTag.findMany({ where: { groupId: group.id }, orderBy: { tag: 'asc' } }),
    ]);
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
      categoryKeys: categories.sort((a, b) => a.category.sort - b.category.sort).map((c) => c.category.key),
      tags: tags.map((t) => t.tag),
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

function invalidField(field: string, code: string) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Invalid input', { fields: { [field]: [code] } });
}
