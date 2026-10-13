import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe('catalogue (GRP-04)', () => {
  let t: TestApp;
  let leader: Client;
  const anonymous = (path: string) => request(t.app.getHttpServer()).get(`/api/v1${path}`);

  /** A group, listed unless `listed: false`. */
  async function group(name: string, settings: object = {}, listed = true) {
    const { id, slug } = (await leader.post('/groups', { name, description: `About ${name}` })).body;
    if (listed) await leader.patch(`/groups/${id}`, { visibility: 'listed', categoryKeys: ['tech'], ...settings });
    return { id, slug: slug as string };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    leader = await loginAs(t.app, (await createActiveUser(t.prisma, 'leader')).email);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('lists the starter categories, for anyone', async () => {
    const res = await anonymous('/categories');
    expect(res.body.categories.map((c: { key: string }) => c.key)).toEqual(['languages', 'tech', 'business', 'faith', 'health', 'exam-prep']);
    expect(res.body.categories[0]).toEqual({ key: 'languages', nameFr: 'Langues', nameEn: 'Languages' });
  });

  describe('browsing', () => {
    it('shows listed groups only, never private or archived ones', async () => {
      await group('Listed one');
      await group('Private one', {}, false);
      const archived = await group('Archived one');
      await leader.post(`/groups/${archived.id}/archive`);

      const res = await anonymous('/catalogue');

      expect(res.status).toBe(200);
      expect(res.body.groups.map((g: { name: string }) => g.name)).toEqual(['Listed one']);
      expect(res.body.groups[0]).toEqual({
        slug: expect.any(String),
        name: 'Listed one',
        description: 'About Listed one',
        memberCount: 1,
        languageLabel: null,
        categoryKeys: ['tech'],
        tags: [],
        full: false,
      });
    });

    it('filters by category', async () => {
      await group('Code club', { categoryKeys: ['tech'] });
      await group('English club', { categoryKeys: ['languages'] });

      const res = await anonymous('/catalogue?category=languages');

      expect(res.body.groups.map((g: { name: string }) => g.name)).toEqual(['English club']);
    });

    it('searches names and tags, ignoring case', async () => {
      await group('Club de Python', { tags: ['programmation'] });
      await group('Révisions', { tags: ['bepc', 'maths'] });
      await group('Autre chose');

      const byName = await anonymous(`/catalogue?q=${encodeURIComponent('python')}`);
      const byTag = await anonymous('/catalogue?q=BEPC');

      expect(byName.body.groups.map((g: { name: string }) => g.name)).toEqual(['Club de Python']);
      expect(byTag.body.groups.map((g: { name: string }) => g.name)).toEqual(['Révisions']);
    });

    it('pages through results with a cursor, newest first', async () => {
      // Straight into the database: the API limits how many groups one person creates per day.
      const owner = await t.prisma.user.findFirstOrThrow({ where: { pseudo: 'leader' } });
      const tech = await t.prisma.category.findUniqueOrThrow({ where: { key: 'tech' } });
      for (let i = 0; i < 22; i++) {
        await t.prisma.group.create({
          data: {
            ownerId: owner.id,
            name: `Group ${String(i).padStart(2, '0')}`,
            slug: `group-${i}`,
            visibility: 'listed',
            categories: { create: { categoryId: tech.id } },
          },
        });
      }

      const first = await anonymous('/catalogue');
      const second = await anonymous(`/catalogue?cursor=${first.body.nextCursor}`);

      expect(first.body.groups).toHaveLength(20);
      expect(first.body.groups[0].name).toBe('Group 21');
      expect(second.body.groups.map((g: { name: string }) => g.name)).toEqual(['Group 01', 'Group 00']);
      expect(second.body.nextCursor).toBeNull();
    });
  });

  describe('a group page', () => {
    it('shows a listed group to visitors, with no viewer state', async () => {
      const { slug } = await group('Python Club');
      const res = await anonymous(`/catalogue/${slug}`);
      expect(res.body).toMatchObject({ name: 'Python Club', viewer: null, groupId: null });
    });

    it('answers a private group exactly like a missing one', async () => {
      const { slug } = await group('Secret', {}, false);
      const hidden = await anonymous(`/catalogue/${slug}`);
      const missing = await anonymous('/catalogue/no-such-group');
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
    });
  });

  describe('asking to join', () => {
    it('always goes to the leader, even when invite links join instantly', async () => {
      const { id, slug } = await group('Open group', { inviteRequiresApproval: false });
      const visitor = await loginAs(t.app, (await createActiveUser(t.prisma, 'visitor')).email);

      const res = await visitor.post(`/catalogue/${slug}/request`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: 'requested', groupId: id });
      expect((await visitor.get(`/catalogue/${slug}`)).body.viewer).toBe('pending');
      const requests = (await leader.get(`/groups/${id}/join-requests`)).body.requests;
      expect(requests).toMatchObject([{ source: 'catalogue', user: { pseudo: 'visitor' } }]);

      await leader.patch(`/groups/${id}/join-requests/${requests[0].id}`, { decision: 'accept' });
      expect((await visitor.get(`/catalogue/${slug}`)).body).toMatchObject({ viewer: 'member', groupId: id });
    });

    it('needs an account', async () => {
      const { slug } = await group('Open group');
      const res = await request(t.app.getHttpServer()).post(`/api/v1/catalogue/${slug}/request`).set('origin', 'http://localhost:3000');
      expect(res.status).toBe(401);
    });

    it("can't be used on a private group", async () => {
      const { slug } = await group('Secret', {}, false);
      const visitor = await loginAs(t.app, (await createActiveUser(t.prisma, 'visitor')).email);
      expect((await visitor.post(`/catalogue/${slug}/request`)).status).toBe(404);
    });
  });

  it('is off when the instance turns it off', async () => {
    const { slug } = await group('Listed');
    await t.prisma.instanceSettings.create({ data: { id: 1, catalogueEnabled: false } });

    expect((await anonymous('/catalogue')).status).toBe(404);
    expect((await anonymous(`/catalogue/${slug}`)).status).toBe(404);
    expect((await anonymous('/instance')).body.features.catalogue).toBe(false);
  });

  describe('managing categories (instance admin)', () => {
    it('is for instance admins only', async () => {
      expect((await leader.post('/admin/categories', { key: 'arts', nameFr: 'Arts', nameEn: 'Arts' })).body.code).toBe('FORBIDDEN');
    });

    it('adds, renames, and deletes categories', async () => {
      const adminUser = await createActiveUser(t.prisma, 'admin');
      await t.prisma.user.update({ where: { id: adminUser.id }, data: { isInstanceAdmin: true } });
      const admin = await loginAs(t.app, adminUser.email);

      expect((await admin.post('/admin/categories', { key: 'arts', nameFr: 'Arts', nameEn: 'Arts', sort: 70 })).status).toBe(201);
      expect((await admin.post('/admin/categories', { key: 'arts', nameFr: 'Arts', nameEn: 'Arts' })).body.details.fields).toEqual({
        key: ['taken'],
      });
      expect((await admin.patch('/admin/categories/arts', { nameEn: 'Arts and crafts' })).body.nameEn).toBe('Arts and crafts');
      expect((await anonymous('/categories')).body.categories.at(-1).key).toBe('arts');

      expect((await admin.delete('/admin/categories/arts')).status).toBe(204);
      expect((await admin.delete('/admin/categories/arts')).status).toBe(404);
    });
  });
});
