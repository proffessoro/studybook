import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FileKind } from '@studybook/shared';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const MIME: Record<FileKind, string> = { pdf: 'application/pdf', audio: 'audio/mpeg', video: 'video/mp4', image: 'image/png' };

describe('lesson files and lesson views (CNT-02, CNT-03)', () => {
  let t: TestApp;
  let leader: Client;
  let moderator: Client;
  let member: Client;
  let leaderId: string;
  let memberId: string;
  let groupId: string;
  const g = (path: string) => `/groups/${groupId}${path}`;
  const used = async () => Number((await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } })).storageUsedBytes);

  /** A stored file of the group, counted against its quota as an upload would be. */
  async function readyFile(kind: FileKind, sizeBytes = 1000, inGroup = groupId) {
    const file = await t.prisma.file.create({
      data: {
        groupId: inGroup,
        uploaderId: leaderId,
        kind,
        mime: MIME[kind],
        filename: `lesson.${kind}`,
        sizeBytes,
        storageKey: `groups/${inGroup}/${kind}-${Math.random()}`,
        status: 'ready',
      },
    });
    await t.prisma.group.update({ where: { id: inGroup }, data: { storageUsedBytes: { increment: sizeBytes } } });
    return file.id;
  }

  /** A published course with one module and one lesson (published unless asked otherwise). */
  async function lesson(published = true) {
    const courseId = (await leader.post(g('/courses'), { title: 'Python basics' })).body.id;
    const moduleId = (await leader.post(g(`/courses/${courseId}/modules`), { title: 'Week 1' })).body.id;
    const lessonId = (await leader.post(g(`/modules/${moduleId}/lessons`), { title: 'Variables' })).body.id;
    await leader.patch(g(`/courses/${courseId}`), { published: true });
    if (published) await leader.patch(g(`/lessons/${lessonId}`), { published: true });
    return { courseId, moduleId, lessonId };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    const leaderUser = await createActiveUser(t.prisma, 'leader');
    leaderId = leaderUser.id;
    leader = await loginAs(t.app, leaderUser.email);
    groupId = (await leader.post('/groups', { name: 'Python Club' })).body.id;
    const token = (await leader.get(`/groups/${groupId}/invite-link`)).body.token;
    const mod = await createActiveUser(t.prisma, 'mod');
    moderator = await loginAs(t.app, mod.email);
    const bob = await createActiveUser(t.prisma, 'bob');
    memberId = bob.id;
    member = await loginAs(t.app, bob.email);
    await moderator.post(`/invites/${token}/join`);
    await member.post(`/invites/${token}/join`);
    await leader.patch(`/groups/${groupId}/members/${mod.id}`, { role: 'moderator' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('attachments (CNT-02)', () => {
    it('attaches a PDF, audio, and video in order, and members see them', async () => {
      const { lessonId } = await lesson();
      const pdf = await readyFile('pdf');
      const audio = await readyFile('audio');
      const video = await readyFile('video');

      const res = await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: pdf });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        kind: 'pdf',
        filename: 'lesson.pdf',
        mime: 'application/pdf',
        sizeBytes: 1000,
        url: `/api/v1/files/${pdf}`,
        processing: 'ready',
      });
      await moderator.post(g(`/lessons/${lessonId}/attachments`), { fileId: audio });
      await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: video });

      const seen = (await member.get(g(`/lessons/${lessonId}`))).body.attachments;
      expect(seen.map((a: { kind: string }) => a.kind)).toEqual(['pdf', 'audio', 'video']);
    });

    it('refuses images, unfinished uploads, other groups’ files, and files already attached', async () => {
      const { lessonId } = await lesson();
      const attach = (fileId: string) => leader.post(g(`/lessons/${lessonId}/attachments`), { fileId });
      const fields = async (fileId: string) => (await attach(fileId)).body.details?.fields;

      expect(await fields(await readyFile('image'))).toEqual({ fileId: ['unknown_file'] });

      const unfinished = await readyFile('pdf');
      await t.prisma.file.update({ where: { id: unfinished }, data: { status: 'reserved' } });
      expect(await fields(unfinished)).toEqual({ fileId: ['unknown_file'] });

      const otherGroup = (await leader.post('/groups', { name: 'Other group' })).body.id;
      expect(await fields(await readyFile('pdf', 10, otherGroup))).toEqual({ fileId: ['unknown_file'] });

      const pdf = await readyFile('pdf');
      expect((await attach(pdf)).status).toBe(201);
      expect(await fields(pdf)).toEqual({ fileId: ['already_attached'] });

      expect((await attach('not-a-uuid')).status).toBe(400);
    });

    it('members only see the files of published lessons', async () => {
      const { lessonId } = await lesson(false);
      await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: await readyFile('pdf') });
      expect((await member.get(g(`/lessons/${lessonId}`))).status).toBe(404);
      expect((await leader.get(g(`/lessons/${lessonId}`))).body.attachments).toHaveLength(1);
    });

    it('reorders attachments, naming exactly the existing ones', async () => {
      const { lessonId } = await lesson();
      const a = (await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: await readyFile('pdf') })).body.id;
      const b = (await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: await readyFile('video') })).body.id;

      expect((await leader.put(g(`/lessons/${lessonId}/attachments/order`), { ids: [b, a] })).status).toBe(204);
      expect((await member.get(g(`/lessons/${lessonId}`))).body.attachments.map((x: { id: string }) => x.id)).toEqual([b, a]);
      expect((await leader.put(g(`/lessons/${lessonId}/attachments/order`), { ids: [b] })).status).toBe(400);
    });

    it('removing an attachment deletes the file and gives its bytes back', async () => {
      const { lessonId } = await lesson();
      const fileId = await readyFile('video', 5000);
      const attachmentId = (await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId })).body.id;
      expect(await used()).toBe(5000);

      expect((await leader.delete(g(`/lessons/${lessonId}/attachments/${attachmentId}`))).status).toBe(204);
      expect(await t.prisma.file.count({ where: { id: fileId } })).toBe(0);
      expect(await used()).toBe(0);
      expect((await leader.delete(g(`/lessons/${lessonId}/attachments/${attachmentId}`))).status).toBe(404);
    });

    it('deleting a lesson, module, or course gives its files’ bytes back', async () => {
      const first = await lesson();
      await leader.post(g(`/lessons/${first.lessonId}/attachments`), { fileId: await readyFile('pdf', 100) });
      await leader.delete(g(`/lessons/${first.lessonId}`));
      expect(await used()).toBe(0);

      const second = await lesson();
      await leader.post(g(`/lessons/${second.lessonId}/attachments`), { fileId: await readyFile('pdf', 200) });
      await leader.delete(g(`/modules/${second.moduleId}`));
      expect(await used()).toBe(0);

      const third = await lesson();
      await leader.post(g(`/lessons/${third.lessonId}/attachments`), { fileId: await readyFile('pdf', 300) });
      const kept = await lesson();
      await leader.post(g(`/lessons/${kept.lessonId}/attachments`), { fileId: await readyFile('audio', 400) });
      await leader.delete(g(`/courses/${third.courseId}`));
      expect(await used()).toBe(400);
      expect(await t.prisma.file.count()).toBe(1);
    });

    it('members cannot attach, reorder, or remove', async () => {
      const { lessonId } = await lesson();
      const fileId = await readyFile('pdf');
      const attachmentId = (await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId })).body.id;

      expect((await member.post(g(`/lessons/${lessonId}/attachments`), { fileId: await readyFile('pdf') })).status).toBe(403);
      expect((await member.put(g(`/lessons/${lessonId}/attachments/order`), { ids: [attachmentId] })).status).toBe(403);
      expect((await member.delete(g(`/lessons/${lessonId}/attachments/${attachmentId}`))).status).toBe(403);
    });

    it("can't touch another group's lesson files (IDOR)", async () => {
      const { lessonId } = await lesson();
      const attachmentId = (await leader.post(g(`/lessons/${lessonId}/attachments`), { fileId: await readyFile('pdf') })).body.id;
      const intruder = await loginAs(t.app, (await createActiveUser(t.prisma, 'intruder')).email);
      const theirs = (await intruder.post('/groups', { name: 'Their group' })).body.id;
      const via = (path: string) => `/groups/${theirs}${path}`;

      expect((await intruder.delete(via(`/lessons/${lessonId}/attachments/${attachmentId}`))).status).toBe(404);
      expect((await intruder.put(via(`/lessons/${lessonId}/attachments/order`), { ids: [attachmentId] })).status).toBe(404);
      expect((await intruder.get(via(`/lessons/${lessonId}/views`))).status).toBe(404);
      expect((await intruder.post(via(`/lessons/${lessonId}/view`))).status).toBe(404);
      expect(await t.prisma.lessonAttachment.count()).toBe(1);
    });
  });

  describe('lesson views (CNT-03)', () => {
    it('remembers the first time a member opened a lesson', async () => {
      const { lessonId } = await lesson();
      expect((await member.post(g(`/lessons/${lessonId}/view`))).status).toBe(204);
      const first = await t.prisma.lessonView.findFirstOrThrow({ where: { userId: memberId } });
      expect((await member.post(g(`/lessons/${lessonId}/view`))).status).toBe(204);

      const views = await t.prisma.lessonView.findMany();
      expect(views).toHaveLength(1);
      expect(views[0]!.firstViewedAt).toEqual(first.firstViewedAt);
    });

    it("doesn't count drafts", async () => {
      const { lessonId } = await lesson(false);
      expect((await member.post(g(`/lessons/${lessonId}/view`))).status).toBe(404);
      expect((await leader.post(g(`/lessons/${lessonId}/view`))).status).toBe(204);
      expect(await t.prisma.lessonView.count()).toBe(0);
    });

    it('shows the leader which members opened it, and only the leader', async () => {
      const { lessonId } = await lesson();
      const carol = await createActiveUser(t.prisma, 'carol');
      const token = (await leader.get(`/groups/${groupId}/invite-link`)).body.token;
      await (await loginAs(t.app, carol.email)).post(`/invites/${token}/join`);
      await member.post(g(`/lessons/${lessonId}/view`));
      await moderator.post(g(`/lessons/${lessonId}/view`));

      const res = await leader.get(g(`/lessons/${lessonId}/views`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        viewedCount: 1,
        memberCount: 2,
        members: [
          { userId: memberId, pseudo: 'bob', firstViewedAt: expect.any(String) },
          { userId: carol.id, pseudo: 'carol', firstViewedAt: null },
        ],
      });

      expect((await moderator.get(g(`/lessons/${lessonId}/views`))).status).toBe(403);
      expect((await member.get(g(`/lessons/${lessonId}/views`))).status).toBe(403);
    });
  });
});
