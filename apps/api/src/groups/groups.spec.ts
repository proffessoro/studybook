import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe('groups (GRP-01, GRP-02, GRP-05)', () => {
  let t: TestApp;
  let leader: Client;

  /** Adds a user to the group directly; invites come in the next step. */
  async function addMember(groupId: string, role: 'moderator' | 'member', name: string) {
    const user = await createActiveUser(t.prisma, name);
    await t.prisma.membership.create({ data: { groupId, userId: user.id, role } });
    return loginAs(t.app, user.email);
  }

  async function createGroup(body: object = {}) {
    const res = await leader.post('/groups', { name: 'Python Club', ...body });
    expect(res.status).toBe(201);
    return res.body as { id: string; slug: string };
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

  describe('creating', () => {
    it('makes the creator the leader, with private defaults', async () => {
      const res = await leader.post('/groups', { name: '  Club de Python  ', description: 'On code ensemble', languageLabel: 'Français' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'Club de Python',
        description: 'On code ensemble',
        languageLabel: 'Français',
        visibility: 'private',
        inviteRequiresApproval: false,
        progressVisibility: 'own',
        feedEnabled: true,
        status: 'active',
        myRole: 'leader',
        memberCount: 1,
        memberCap: null,
        storage: { usedBytes: 0, quotaBytes: null },
      });
      expect(res.body.slug).toMatch(/^club-de-python-[a-z0-9]{6}$/);
    });

    it('copies the instance limits, as on hosted (LIM-04)', async () => {
      await t.prisma.instanceSettings.create({ data: { id: 1, defaultStorageQuotaBytes: 1024n ** 3n, defaultMemberCap: 500 } });

      const res = await leader.post('/groups', { name: 'Hosted group' });

      expect(res.body).toMatchObject({ memberCap: 500, storage: { usedBytes: 0, quotaBytes: 1024 ** 3 } });
    });

    it('checks the name', async () => {
      const res = await leader.post('/groups', { name: 'ab' });
      expect(res.body.details.fields).toEqual({ name: ['too_small'] });
    });

    it('lists my groups', async () => {
      await createGroup({ name: 'First' });
      await createGroup({ name: 'Second' });

      const res = await leader.get('/me/groups');

      expect(res.body.groups.map((g: { name: string }) => g.name).sort()).toEqual(['First', 'Second']);
      expect(res.body.groups[0]).toMatchObject({ myRole: 'leader', memberCount: 1, status: 'active' });
    });
  });

  describe('access', () => {
    it("hides a group from people who aren't members, with the same answer as a missing group", async () => {
      const { id } = await createGroup();
      const stranger = await loginAs(t.app, (await createActiveUser(t.prisma, 'stranger')).email);

      const hidden = await stranger.get(`/groups/${id}`);
      const missing = await stranger.get('/groups/00000000-0000-4000-8000-000000000000');

      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      expect((await stranger.get('/groups/not-a-uuid')).status).toBe(404);
    });

    it('hides the group from someone who left, was removed, or was banned', async () => {
      const { id } = await createGroup();
      const member = await addMember(id, 'member', 'bob');
      for (const status of ['left', 'removed', 'banned'] as const) {
        await t.prisma.membership.updateMany({ where: { groupId: id, role: 'member' }, data: { status } });
        expect((await member.get(`/groups/${id}`)).status).toBe(404);
      }
    });

    it('honours an access end date (the Phase 2 subscription seam)', async () => {
      const { id } = await createGroup();
      const member = await addMember(id, 'member', 'bob');
      await t.prisma.membership.updateMany({ where: { groupId: id, role: 'member' }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });

      expect((await member.get(`/groups/${id}`)).status).toBe(404);
      expect((await member.get('/me/groups')).body.groups).toEqual([]);
    });

    it('shows storage use to the leader only (LIM-01)', async () => {
      const { id } = await createGroup();
      const member = await addMember(id, 'member', 'bob');
      expect((await member.get(`/groups/${id}`)).body).toMatchObject({ myRole: 'member', storage: null, memberCount: 2 });
    });
  });

  describe('permission matrix: every role against every group endpoint (design §8)', () => {
    const endpoints = [
      { name: 'view', allowed: ['leader', 'moderator', 'member'], call: (c: Client, id: string) => c.get(`/groups/${id}`) },
      { name: 'update settings', allowed: ['leader'], call: (c: Client, id: string) => c.patch(`/groups/${id}`, { description: 'x' }) },
      { name: 'archive', allowed: ['leader'], call: (c: Client, id: string) => c.post(`/groups/${id}/archive`) },
      { name: 'unarchive', allowed: ['leader'], call: (c: Client, id: string) => c.post(`/groups/${id}/unarchive`) },
      { name: 'delete', allowed: ['leader'], call: (c: Client, id: string) => c.delete(`/groups/${id}`, { confirmName: 'Wrong name' }) },
    ] as const;

    for (const endpoint of endpoints) {
      it(`${endpoint.name}: only ${endpoint.allowed.join(', ')}`, async () => {
        const { id } = await createGroup();
        const clients = {
          leader,
          moderator: await addMember(id, 'moderator', 'mod'),
          member: await addMember(id, 'member', 'mem'),
        };
        for (const [role, client] of Object.entries(clients)) {
          const res = await endpoint.call(client, id);
          const allowed = (endpoint.allowed as readonly string[]).includes(role);
          // Allowed roles get past the guard (delete then fails on the wrong name, on purpose).
          if (allowed) expect(res.status, `${role} should be allowed`).not.toBe(403);
          else expect(res.body.code, `${role} should be refused`).toBe('FORBIDDEN');
        }
      });
    }
  });

  describe('settings (GRP-02)', () => {
    it('changes only the fields sent', async () => {
      const { id } = await createGroup({ languageLabel: 'Français' });

      const res = await leader.patch(`/groups/${id}`, {
        visibility: 'listed',
        categoryKeys: ['tech', 'languages'],
        tags: ['Python', ' BEPC ', 'python'],
        inviteRequiresApproval: true,
        progressVisibility: 'all',
        feedEnabled: false,
        languageLabel: '',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Python Club',
        visibility: 'listed',
        inviteRequiresApproval: true,
        progressVisibility: 'all',
        feedEnabled: false,
        languageLabel: null,
        categoryKeys: ['languages', 'tech'],
        tags: ['bepc', 'python'],
      });
    });

    it('needs a category before the group can be listed (GRP-04)', async () => {
      const { id } = await createGroup();

      const res = await leader.patch(`/groups/${id}`, { visibility: 'listed' });
      expect(res.body.details.fields).toEqual({ categoryKeys: ['required_when_listed'] });
      expect((await leader.get(`/groups/${id}`)).body.visibility).toBe('private');

      await leader.patch(`/groups/${id}`, { visibility: 'listed', categoryKeys: ['tech'] });
      const emptied = await leader.patch(`/groups/${id}`, { categoryKeys: [] });
      expect(emptied.body.details.fields).toEqual({ categoryKeys: ['required_when_listed'] });
    });

    it('refuses unknown categories and bad tags', async () => {
      const { id } = await createGroup();
      expect((await leader.patch(`/groups/${id}`, { categoryKeys: ['astrology'] })).body.details.fields).toEqual({
        categoryKeys: ['unknown'],
      });
      expect((await leader.patch(`/groups/${id}`, { tags: ['x'] })).body.details.fields).toEqual({ 'tags.0': ['too_small'] });
      const tooMany = await leader.patch(`/groups/${id}`, { tags: Array.from({ length: 11 }, (_, i) => `tag${i}`) });
      expect(tooMany.body.details.fields).toEqual({ tags: ['too_big'] });
    });

    it('rejects unknown values', async () => {
      const { id } = await createGroup();
      const res = await leader.patch(`/groups/${id}`, { visibility: 'public' });
      expect(res.body.details.fields).toEqual({ visibility: ['invalid_value'] });
    });
  });

  describe('archiving and deleting (GRP-05)', () => {
    it('makes an archived group read-only until it is unarchived', async () => {
      const { id } = await createGroup();
      const member = await addMember(id, 'member', 'bob');

      expect((await leader.post(`/groups/${id}/archive`)).body.status).toBe('archived');
      expect((await member.get(`/groups/${id}`)).status).toBe(200);
      const blocked = await leader.patch(`/groups/${id}`, { description: 'x' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('GROUP_ARCHIVED');

      expect((await leader.post(`/groups/${id}/unarchive`)).body.status).toBe('active');
      expect((await leader.patch(`/groups/${id}`, { description: 'x' })).status).toBe(200);
    });

    it('deletes only when the name is typed exactly', async () => {
      const { id } = await createGroup();

      const wrong = await leader.delete(`/groups/${id}`, { confirmName: 'python club' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('CONFIRMATION_MISMATCH');

      expect((await leader.delete(`/groups/${id}`, { confirmName: 'Python Club' })).status).toBe(204);
      expect((await leader.get(`/groups/${id}`)).status).toBe(404);
      expect(await t.prisma.membership.count()).toBe(0);
    });
  });
});
