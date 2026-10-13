import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CatalogueGroup,
  type CatalogueGroupDetail,
  type CataloguePage,
  type CategoryView,
  ErrorCode,
  type JoinResult,
} from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { MembershipsService } from '../groups/memberships.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const include = {
  categories: { include: { category: true } },
  tags: { orderBy: { tag: 'asc' } },
  _count: { select: { memberships: { where: { status: 'active' } } } },
} satisfies Prisma.GroupInclude;

type ListedGroup = Prisma.GroupGetPayload<{ include: typeof include }>;

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Group not found');
}

/** Only what anyone may see of a listed group (GRP-04): never members or content. */
function toCatalogueGroup(group: ListedGroup): CatalogueGroup {
  const memberCount = group._count.memberships;
  return {
    slug: group.slug,
    name: group.name,
    description: group.description,
    memberCount,
    languageLabel: group.languageLabel,
    categoryKeys: group.categories.sort((a, b) => a.category.sort - b.category.sort).map((c) => c.category.key),
    tags: group.tags.map((t) => t.tag),
    full: group.memberCap !== null && memberCount >= group.memberCap,
  };
}

/** The public catalogue of listed groups (GRP-04). Off when the instance turns it off. */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberships: MembershipsService,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async enabled(): Promise<boolean> {
    const settings = await this.prisma.instanceSettings.findUnique({ where: { id: 1 } });
    return settings?.catalogueEnabled ?? true;
  }

  async categories(): Promise<CategoryView[]> {
    const categories = await this.prisma.category.findMany({ orderBy: [{ sort: 'asc' }, { key: 'asc' }] });
    return categories.map(({ key, nameFr, nameEn }) => ({ key, nameFr, nameEn }));
  }

  /** Listed, active groups, newest first. Search matches names and tags. */
  async list(query: { category?: string; q?: string; cursor?: string }): Promise<CataloguePage> {
    await this.assertEnabled();
    const q = query.q?.trim().slice(0, 100);
    const groups = await this.prisma.group.findMany({
      where: {
        visibility: 'listed',
        status: 'active',
        ...(query.category ? { categories: { some: { category: { key: query.category } } } } : {}),
        ...(q
          ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { tags: { some: { tag: { contains: q.toLowerCase() } } } }] }
          : {}),
        // Ids are UUIDv7, so they sort by creation time.
        ...(query.cursor && UUID.test(query.cursor) ? { id: { lt: query.cursor } } : {}),
      },
      include,
      orderBy: { id: 'desc' },
      take: PAGE_SIZE + 1,
    });
    const page = groups.slice(0, PAGE_SIZE);
    return {
      groups: page.map(toCatalogueGroup),
      nextCursor: groups.length > PAGE_SIZE ? page[page.length - 1]!.id : null,
    };
  }

  /** A listed group's public page. Private groups answer exactly like missing ones. */
  async detail(slug: string, viewer: User | null): Promise<CatalogueGroupDetail> {
    const group = await this.listedGroup(slug);
    const state = await this.memberships.viewerState(group.id, viewer);
    return { ...toCatalogueGroup(group), viewer: state, groupId: state === 'member' ? group.id : null };
  }

  /** GRP-04: from the catalogue, people can only ask; the leader accepts or refuses (MEM-04). */
  async requestToJoin(slug: string, user: User): Promise<JoinResult> {
    await this.rateLimiter.consume({ key: `join:user:${user.id}`, max: 30, windowSeconds: 3600 });
    const group = await this.listedGroup(slug);
    const status = await this.memberships.requestToJoin(group, user, 'catalogue');
    return { status, groupId: group.id };
  }

  private async listedGroup(slug: string): Promise<ListedGroup> {
    await this.assertEnabled();
    const group = await this.prisma.group.findUnique({ where: { slug }, include });
    if (!group || group.visibility !== 'listed' || group.status !== 'active') throw notFound();
    return group;
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.enabled())) throw new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'The catalogue is off on this server');
  }
}
