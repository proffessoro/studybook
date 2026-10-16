import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
type Member = { userId: string; pseudo: string; role: string; contact: Record<string, unknown> | null };

describe('members, roles, and privacy (MEM-01, 02, 03, 05)', () => {
  let t: TestApp;
  let groupId: string;
  let token: string;
  const people: Record<'leader' | 'mod' | 'bob' | 'carol', { id: string; client: Client }> = {} as never;

  const members = async (client: Client) => (await client.get(`/groups/${groupId}/members`)).body.members as Member[];

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    for (const name of ['leader', 'mod', 'bob', 'carol'] as const) {
      const user = await createActiveUser(t.prisma, name);
      people[name] = { id: user.id, client: await loginAs(t.app, user.email) };
    }
    groupId = (await people.leader.client.post('/groups', { name: 'Python Club' })).body.id;
    token = (await people.leader.client.get(`/groups/${groupId}/invite-link`)).body.token;
    for (const name of ['mod', 'bob', 'carol'] as const) await people[name].client.post(`/invites/${token}/join`);
    await people.leader.client.patch(`/groups/${groupId}/members/${people.mod.id}`, { role: 'moderator' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('the member list (MEM-01, NFR-06)', () => {
    it('gives members and moderators pseudos and roles only, never contacts', async () => {
      for (const viewer of [people.bob, people.mod]) {
        const list = await members(viewer.client);
        expect(list.map((m) => [m.pseudo, m.role])).toEqual([
          ['leader', 'leader'],
          ['mod', 'moderator'],
          ['bob', 'member'],
          ['carol', 'member'],
        ]);
        for (const member of list) {
          expect(Object.keys(member).sort()).toEqual(['contact', 'pseudo', 'role', 'userId']);
          expect(member.contact).toBeNull();
        }
        // Not just hidden: the values aren't anywhere in the response.
        const raw = JSON.stringify((await viewer.client.get(`/groups/${groupId}/members`)).body);
        expect(raw).not.toContain('@example.cm');
        expect(raw).not.toContain('+237');
        expect(raw).not.toContain('Full Name');
      }
    });

    it('gives the leader names, emails, and phones', async () => {
      const bob = (await members(people.leader.client)).find((m) => m.pseudo === 'bob')!;
      expect(bob.contact).toEqual({
        fullName: 'bob Full Name',
        email: 'bob@example.cm',
        phone: expect.stringMatching(/^\+237/),
        joinedAt: expect.any(String),
      });
    });

    it('is only for members of the group', async () => {
      const stranger = await loginAs(t.app, (await createActiveUser(t.prisma, 'stranger')).email);
      expect((await stranger.get(`/groups/${groupId}/members`)).status).toBe(404);
    });
  });

  describe('roles (MEM-02)', () => {
    it('promotes and demotes', async () => {
      const res = await people.leader.client.patch(`/groups/${groupId}/members/${people.bob.id}`, { role: 'moderator' });
      expect(res.body).toMatchObject({ pseudo: 'bob', role: 'moderator' });
      await people.leader.client.patch(`/groups/${groupId}/members/${people.bob.id}`, { role: 'member' });
      expect((await people.bob.client.get(`/groups/${groupId}`)).body.myRole).toBe('member');
    });

    it("can't make someone leader that way, or change the leader", async () => {
      expect((await people.leader.client.patch(`/groups/${groupId}/members/${people.bob.id}`, { role: 'leader' })).status).toBe(400);
      const res = await people.leader.client.patch(`/groups/${groupId}/members/${people.leader.id}`, { role: 'member' });
      expect(res.body.code).toBe('CANNOT_MANAGE_LEADER');
    });

    it('hands over leadership; the old leader becomes a moderator', async () => {
      expect((await people.leader.client.post(`/groups/${groupId}/transfer-leadership`, { userId: people.bob.id })).status).toBe(204);

      expect((await people.bob.client.get(`/groups/${groupId}`)).body.myRole).toBe('leader');
      expect((await people.leader.client.get(`/groups/${groupId}`)).body.myRole).toBe('moderator');
      expect((await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } })).ownerId).toBe(people.bob.id);
      // The new leader sees contacts; the old one no longer does.
      expect((await members(people.bob.client))[0]!.contact).not.toBeNull();
      expect((await members(people.leader.client))[0]!.contact).toBeNull();
    });

    it("can't hand over to someone who isn't a member", async () => {
      const stranger = await createActiveUser(t.prisma, 'stranger');
      expect((await people.leader.client.post(`/groups/${groupId}/transfer-leadership`, { userId: stranger.id })).status).toBe(404);
    });
  });

  describe('removing and banning (MEM-03)', () => {
    it('removing takes someone out; they can come back with the link', async () => {
      expect((await people.leader.client.delete(`/groups/${groupId}/members/${people.bob.id}`)).status).toBe(204);

      expect((await people.bob.client.get(`/groups/${groupId}`)).status).toBe(404);
      expect((await members(people.leader.client)).map((m) => m.pseudo)).not.toContain('bob');
      expect((await people.bob.client.post(`/invites/${token}/join`)).body.status).toBe('joined');
    });

    it('banning keeps them out of the link and requests', async () => {
      await people.leader.client.delete(`/groups/${groupId}/members/${people.bob.id}`, { ban: true });

      expect((await people.bob.client.post(`/invites/${token}/join`)).body.code).toBe('BANNED_FROM_GROUP');
      await people.leader.client.patch(`/groups/${groupId}`, { inviteRequiresApproval: true });
      expect((await people.bob.client.post(`/invites/${token}/join`)).body.code).toBe('BANNED_FROM_GROUP');
    });

    it('banning refuses a waiting request, even from someone who left', async () => {
      await people.bob.client.post(`/groups/${groupId}/leave`);
      await people.leader.client.patch(`/groups/${groupId}`, { inviteRequiresApproval: true });
      await people.bob.client.post(`/invites/${token}/join`);

      await people.leader.client.delete(`/groups/${groupId}/members/${people.bob.id}`, { ban: true });

      expect((await people.leader.client.get(`/groups/${groupId}/join-requests`)).body.requests).toEqual([]);
    });

    it("can't remove the leader", async () => {
      const res = await people.leader.client.delete(`/groups/${groupId}/members/${people.leader.id}`);
      expect(res.body.code).toBe('CANNOT_MANAGE_LEADER');
    });
  });

  describe('leaving (MEM-05)', () => {
    it('a member leaves and loses access', async () => {
      expect((await people.carol.client.post(`/groups/${groupId}/leave`)).status).toBe(204);
      expect((await people.carol.client.get(`/groups/${groupId}`)).status).toBe(404);
      expect((await people.carol.client.get('/me/groups')).body.groups).toEqual([]);
    });

    it('the leader hands over first', async () => {
      expect((await people.leader.client.post(`/groups/${groupId}/leave`)).body.code).toBe('LEADER_MUST_TRANSFER');
    });

    it('a moderator who leaves comes back as a member', async () => {
      await people.mod.client.post(`/groups/${groupId}/leave`);
      await people.mod.client.post(`/invites/${token}/join`);
      expect((await people.mod.client.get(`/groups/${groupId}`)).body.myRole).toBe('member');
    });

    it('works in an archived group too', async () => {
      await people.leader.client.post(`/groups/${groupId}/archive`);
      expect((await people.carol.client.post(`/groups/${groupId}/leave`)).status).toBe(204);
    });
  });

  describe('permission matrix for member endpoints (design §8)', () => {
    const endpoints = [
      { name: 'list members', allowed: ['leader', 'moderator', 'member'], call: (c: Client) => c.get(`/groups/${groupId}/members`) },
      { name: 'change a role', allowed: ['leader'], call: (c: Client) => c.patch(`/groups/${groupId}/members/${people.carol.id}`, { role: 'member' }) },
      { name: 'remove a member', allowed: ['leader'], call: (c: Client) => c.delete(`/groups/${groupId}/members/${people.carol.id}`) },
      { name: 'hand over leadership', allowed: ['leader'], call: (c: Client) => c.post(`/groups/${groupId}/transfer-leadership`, { userId: people.leader.id }) },
    ] as const;

    for (const endpoint of endpoints) {
      it(`${endpoint.name}: only ${endpoint.allowed.join(', ')}`, async () => {
        for (const [role, person] of [['moderator', people.mod], ['member', people.bob]] as const) {
          const res = await endpoint.call(person.client);
          if ((endpoint.allowed as readonly string[]).includes(role)) expect(res.status, role).not.toBe(403);
          else expect(res.body.code, role).toBe('FORBIDDEN');
        }
        expect((await endpoint.call(people.leader.client)).status).not.toBe(403);
      });
    }
  });
});
