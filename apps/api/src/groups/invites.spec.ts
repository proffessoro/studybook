import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe('invites and joining (GRP-03, MEM-04, LIM-02)', () => {
  let t: TestApp;
  let leader: Client;
  let groupId: string;
  let token: string;

  async function newUser(name: string) {
    const user = await createActiveUser(t.prisma, name);
    return { user, client: await loginAs(t.app, user.email) };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    leader = await loginAs(t.app, (await createActiveUser(t.prisma, 'leader')).email);
    groupId = (await leader.post('/groups', { name: 'Python Club', description: 'Code together' })).body.id;
    token = (await leader.get(`/groups/${groupId}/invite-link`)).body.token;
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('the link', () => {
    it('is created once and stays the same until reset', async () => {
      expect(token).toMatch(/^[\w-]{24}$/);
      expect((await leader.get(`/groups/${groupId}/invite-link`)).body.token).toBe(token);
    });

    it('stops working once reset (GRP-03)', async () => {
      const fresh = (await leader.post(`/groups/${groupId}/invite-link/reset`)).body.token;
      const { client } = await newUser('bob');

      expect(fresh).not.toBe(token);
      expect((await client.post(`/invites/${token}/join`)).body.code).toBe('INVITE_INVALID');
      expect((await client.post(`/invites/${fresh}/join`)).body.status).toBe('joined');
    });

    it('is only for the leader', async () => {
      const { user, client } = await newUser('mod');
      await t.prisma.membership.create({ data: { groupId, userId: user.id, role: 'moderator' } });
      expect((await client.get(`/groups/${groupId}/invite-link`)).body.code).toBe('FORBIDDEN');
      expect((await client.post(`/groups/${groupId}/invite-link/reset`)).body.code).toBe('FORBIDDEN');
    });
  });

  describe('opening the link', () => {
    it('shows the group to someone logged out, so they can sign up first', async () => {
      const res = await request(t.app.getHttpServer()).get(`/api/v1/invites/${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        groupName: 'Python Club',
        description: 'Code together',
        memberCount: 1,
        requiresApproval: false,
        full: false,
        viewer: null,
        groupId: null,
      });
    });

    it('tells a logged-in visitor where they stand', async () => {
      const { client } = await newUser('bob');
      expect((await client.get(`/invites/${token}`)).body.viewer).toBe('none');
      await client.post(`/invites/${token}/join`);
      expect((await client.get(`/invites/${token}`)).body).toMatchObject({ viewer: 'member', groupId });
    });

    it('answers the same for an unknown token', async () => {
      const res = await request(t.app.getHttpServer()).get('/api/v1/invites/not-a-real-token');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVITE_INVALID');
    });
  });

  describe('joining', () => {
    it('makes a member right away when no approval is needed', async () => {
      const { client } = await newUser('bob');

      const res = await client.post(`/invites/${token}/join`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: 'joined', groupId });
      expect((await client.get(`/groups/${groupId}`)).body).toMatchObject({ myRole: 'member', memberCount: 2 });
      // Joining twice changes nothing.
      expect((await client.post(`/invites/${token}/join`)).body.status).toBe('joined');
      expect(await t.prisma.membership.count({ where: { groupId } })).toBe(2);
    });

    it('needs a logged-in, verified account', async () => {
      const res = await request(t.app.getHttpServer()).post(`/api/v1/invites/${token}/join`).set('origin', 'http://localhost:3000');
      expect(res.status).toBe(401);
    });

    it('sends a request instead when the group wants approval (GRP-02)', async () => {
      await leader.patch(`/groups/${groupId}`, { inviteRequiresApproval: true });
      const { client } = await newUser('bob');

      const res = await client.post(`/invites/${token}/join`);

      expect(res.body).toEqual({ status: 'requested', groupId });
      expect((await client.get(`/groups/${groupId}`)).status).toBe(404);
      expect((await client.get(`/invites/${token}`)).body.viewer).toBe('pending');
      // Asking again doesn't create a second request.
      await client.post(`/invites/${token}/join`);
      expect(await t.prisma.joinRequest.count()).toBe(1);
    });

    it('keeps out someone who was banned', async () => {
      const { user, client } = await newUser('bob');
      await client.post(`/invites/${token}/join`);
      await t.prisma.membership.updateMany({ where: { userId: user.id }, data: { status: 'banned' } });

      const res = await client.post(`/invites/${token}/join`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('BANNED_FROM_GROUP');
      expect((await client.get(`/invites/${token}`)).body.viewer).toBe('banned');
    });

    it('lets someone who left come back, as a new member (TSK-07)', async () => {
      const { user, client } = await newUser('bob');
      await client.post(`/invites/${token}/join`);
      const firstJoin = (await t.prisma.membership.findFirstOrThrow({ where: { userId: user.id } })).joinedAt;
      await t.prisma.membership.updateMany({ where: { userId: user.id }, data: { status: 'left', role: 'moderator' } });

      await client.post(`/invites/${token}/join`);

      const membership = await t.prisma.membership.findFirstOrThrow({ where: { userId: user.id } });
      expect(membership).toMatchObject({ status: 'active', role: 'member' });
      expect(membership.joinedAt.getTime()).toBeGreaterThan(firstJoin.getTime());
    });

    it('refuses to join an archived group', async () => {
      await leader.post(`/groups/${groupId}/archive`);
      const { client } = await newUser('bob');
      expect((await client.post(`/invites/${token}/join`)).body.code).toBe('GROUP_ARCHIVED');
    });
  });

  describe('member cap (LIM-02)', () => {
    beforeEach(async () => {
      await t.prisma.group.update({ where: { id: groupId }, data: { memberCap: 2 } });
    });

    it('says the group is full', async () => {
      await (await newUser('bob')).client.post(`/invites/${token}/join`);
      const { client } = await newUser('carol');

      expect((await client.get(`/invites/${token}`)).body.full).toBe(true);
      const res = await client.post(`/invites/${token}/join`);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'GROUP_FULL', details: { memberCap: 2 } });
    });

    it('holds when several people join at the same moment', async () => {
      await t.prisma.group.update({ where: { id: groupId }, data: { memberCap: 3 } });
      const clients = await Promise.all(['a1', 'a2', 'a3', 'a4', 'a5'].map(async (n) => (await newUser(n)).client));

      const results = await Promise.all(clients.map((c) => c.post(`/invites/${token}/join`)));

      expect(results.filter((r) => r.body.status === 'joined')).toHaveLength(2);
      expect(results.filter((r) => r.body.code === 'GROUP_FULL')).toHaveLength(3);
      expect(await t.prisma.membership.count({ where: { groupId, status: 'active' } })).toBe(3);
    });
  });

  describe('join requests (MEM-04)', () => {
    let requester: Awaited<ReturnType<typeof newUser>>;

    beforeEach(async () => {
      await leader.patch(`/groups/${groupId}`, { inviteRequiresApproval: true });
      requester = await newUser('bob');
      await requester.client.post(`/invites/${token}/join`);
    });

    const requestId = async () => (await leader.get(`/groups/${groupId}/join-requests`)).body.requests[0].id as string;

    it('lists pending requests with contacts, for the leader', async () => {
      const res = await leader.get(`/groups/${groupId}/join-requests`);
      expect(res.body.requests).toEqual([
        {
          id: expect.any(String),
          source: 'invite',
          createdAt: expect.any(String),
          user: { pseudo: 'bob', fullName: 'bob Full Name', email: 'bob@example.cm', phone: expect.stringMatching(/^\+237/) },
        },
      ]);
    });

    it('accepting makes a member', async () => {
      expect((await leader.patch(`/groups/${groupId}/join-requests/${await requestId()}`, { decision: 'accept' })).status).toBe(204);
      expect((await requester.client.get(`/groups/${groupId}`)).body.myRole).toBe('member');
      expect((await leader.get(`/groups/${groupId}/join-requests`)).body.requests).toEqual([]);
    });

    it('rejecting keeps them out, and they can ask again', async () => {
      await leader.patch(`/groups/${groupId}/join-requests/${await requestId()}`, { decision: 'reject' });

      expect((await requester.client.get(`/groups/${groupId}`)).status).toBe(404);
      expect((await requester.client.post(`/invites/${token}/join`)).body.status).toBe('requested');
    });

    it('a request is answered once', async () => {
      const id = await requestId();
      await leader.patch(`/groups/${groupId}/join-requests/${id}`, { decision: 'reject' });
      expect((await leader.patch(`/groups/${groupId}/join-requests/${id}`, { decision: 'accept' })).body.code).toBe(
        'REQUEST_ALREADY_DECIDED',
      );
    });

    it('accepting a full group fails and keeps the request waiting', async () => {
      await t.prisma.group.update({ where: { id: groupId }, data: { memberCap: 1 } });
      const id = await requestId();

      expect((await leader.patch(`/groups/${groupId}/join-requests/${id}`, { decision: 'accept' })).body.code).toBe('GROUP_FULL');
      expect((await leader.get(`/groups/${groupId}/join-requests`)).body.requests).toHaveLength(1);
    });

    it("can't touch another group's request", async () => {
      const otherGroup = (await leader.post('/groups', { name: 'Other group' })).body.id;
      const res = await leader.patch(`/groups/${otherGroup}/join-requests/${await requestId()}`, { decision: 'accept' });
      expect(res.status).toBe(404);
    });

    it('only the leader sees and answers requests', async () => {
      const { user, client } = await newUser('mod');
      await t.prisma.membership.create({ data: { groupId, userId: user.id, role: 'moderator' } });
      expect((await client.get(`/groups/${groupId}/join-requests`)).body.code).toBe('FORBIDDEN');
      expect((await client.patch(`/groups/${groupId}/join-requests/${await requestId()}`, { decision: 'accept' })).body.code).toBe(
        'FORBIDDEN',
      );
    });
  });
});
