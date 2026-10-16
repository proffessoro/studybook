import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs } from '../testing/users.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const text = (value: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] });

describe('courses, modules, and lessons (CNT-01, CNT-02)', () => {
  let t: TestApp;
  let leader: Client;
  let moderator: Client;
  let member: Client;
  let groupId: string;
  const g = (path: string) => `/groups/${groupId}${path}`;

  /** A course with one module and two lessons; returns their ids. */
  async function course(publish = true) {
    const courseId = (await leader.post(g('/courses'), { title: 'Python basics', description: 'From zero' })).body.id;
    const moduleId = (await leader.post(g(`/courses/${courseId}/modules`), { title: 'Week 1' })).body.id;
    const first = (await leader.post(g(`/modules/${moduleId}/lessons`), { title: 'Variables' })).body.id;
    const second = (await leader.post(g(`/modules/${moduleId}/lessons`), { title: 'Loops' })).body.id;
    if (publish) {
      await leader.patch(g(`/courses/${courseId}`), { published: true });
      await leader.patch(g(`/lessons/${first}`), { published: true });
      await leader.patch(g(`/lessons/${second}`), { published: true });
    }
    return { courseId, moduleId, first, second };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    leader = await loginAs(t.app, (await createActiveUser(t.prisma, 'leader')).email);
    groupId = (await leader.post('/groups', { name: 'Python Club' })).body.id;
    const token = (await leader.get(`/groups/${groupId}/invite-link`)).body.token;
    const mod = await createActiveUser(t.prisma, 'mod');
    moderator = await loginAs(t.app, mod.email);
    member = await loginAs(t.app, (await createActiveUser(t.prisma, 'bob')).email);
    await moderator.post(`/invites/${token}/join`);
    await member.post(`/invites/${token}/join`);
    await leader.patch(`/groups/${groupId}/members/${mod.id}`, { role: 'moderator' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('drafts and publishing (CNT-01)', () => {
    it('keeps new courses and lessons as drafts that members never see', async () => {
      const { courseId, first } = await course(false);

      expect((await member.get(g('/courses'))).body.courses).toEqual([]);
      expect((await member.get(g(`/courses/${courseId}`))).status).toBe(404);
      expect((await member.get(g(`/lessons/${first}`))).status).toBe(404);
      // Managers see the drafts.
      expect((await moderator.get(g('/courses'))).body.courses).toMatchObject([{ title: 'Python basics', published: false, lessonCount: 2 }]);
    });

    it('shows a published course with its published lessons only', async () => {
      const { courseId, moduleId, second } = await course();
      await leader.patch(g(`/lessons/${second}`), { published: false });

      const outline = (await member.get(g(`/courses/${courseId}`))).body;

      expect(outline).toEqual({
        id: courseId,
        title: 'Python basics',
        description: 'From zero',
        published: true,
        modules: [{ id: moduleId, title: 'Week 1', lessons: [{ id: expect.any(String), title: 'Variables', published: true }] }],
      });
      expect((await member.get(g('/courses'))).body.courses[0].lessonCount).toBe(1);
      expect((await member.get(g(`/lessons/${second}`))).status).toBe(404);
    });

    it('hides a published lesson while its course is a draft', async () => {
      const { courseId, first } = await course();
      await leader.patch(g(`/courses/${courseId}`), { published: false });
      expect((await member.get(g(`/lessons/${first}`))).status).toBe(404);
    });
  });

  describe('lessons (CNT-02)', () => {
    it('saves text and gives previous and next lessons', async () => {
      const { first, second } = await course();
      expect((await leader.patch(g(`/lessons/${first}`), { body: text('x = 1') })).status).toBe(204);

      const lesson = (await member.get(g(`/lessons/${first}`))).body;
      expect(lesson).toMatchObject({
        title: 'Variables',
        body: text('x = 1'),
        course: { title: 'Python basics' },
        module: { title: 'Week 1' },
        previousLessonId: null,
        nextLessonId: second,
      });
      expect((await member.get(g(`/lessons/${second}`))).body.previousLessonId).toBe(first);
    });

    it('refuses text that is not plain lesson content', async () => {
      const { first } = await course();
      const res = await leader.patch(g(`/lessons/${first}`), {
        body: { type: 'doc', content: [{ type: 'html', content: '<script>alert(1)</script>' }] },
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields)).toEqual(['body']);
    });

    it("refuses an image that isn't one of this group's files", async () => {
      const { first } = await course();
      const otherGroup = (await leader.post('/groups', { name: 'Other group' })).body.id;
      const file = await t.prisma.file.create({
        data: {
          groupId: otherGroup,
          uploaderId: (await t.prisma.user.findFirstOrThrow({ where: { pseudo: 'leader' } })).id,
          kind: 'image',
          mime: 'image/png',
          filename: 'x.png',
          sizeBytes: 10,
          storageKey: 'groups/other/x',
          status: 'ready',
        },
      });
      const body = { type: 'doc', content: [{ type: 'image', attrs: { src: `/api/v1/files/${file.id}` } }] };

      expect((await leader.patch(g(`/lessons/${first}`), { body })).body.details.fields).toEqual({ body: ['unknown_image'] });

      await t.prisma.file.update({ where: { id: file.id }, data: { groupId } });
      expect((await leader.patch(g(`/lessons/${first}`), { body })).status).toBe(204);
    });
  });

  describe('ordering (CNT-01)', () => {
    it('reorders lessons, modules, and courses', async () => {
      const { courseId, moduleId, first, second } = await course();
      const week2 = (await leader.post(g(`/courses/${courseId}/modules`), { title: 'Week 2' })).body.id;
      const other = (await leader.post(g('/courses'), { title: 'Second course' })).body.id;

      await leader.put(g(`/modules/${moduleId}/lessons/order`), { ids: [second, first] });
      await leader.put(g(`/courses/${courseId}/modules/order`), { ids: [week2, moduleId] });
      await leader.put(g('/courses/order'), { ids: [other, courseId] });

      const outline = (await leader.get(g(`/courses/${courseId}`))).body;
      expect(outline.modules.map((m: { title: string }) => m.title)).toEqual(['Week 2', 'Week 1']);
      expect(outline.modules[1].lessons.map((l: { title: string }) => l.title)).toEqual(['Loops', 'Variables']);
      expect((await leader.get(g('/courses'))).body.courses.map((c: { title: string }) => c.title)).toEqual(['Second course', 'Python basics']);
    });

    it('needs exactly the existing items', async () => {
      const { moduleId, first } = await course();
      expect((await leader.put(g(`/modules/${moduleId}/lessons/order`), { ids: [first] })).body.details.fields).toEqual({ ids: ['mismatch'] });
    });
  });

  describe('permissions', () => {
    it('lets moderators create and edit content, but not members', async () => {
      expect((await moderator.post(g('/courses'), { title: 'By a moderator' })).status).toBe(201);
      expect((await member.post(g('/courses'), { title: 'By a member' })).body.code).toBe('FORBIDDEN');
      const { first } = await course();
      expect((await member.patch(g(`/lessons/${first}`), { title: 'Hacked' })).body.code).toBe('FORBIDDEN');
      expect((await member.delete(g(`/lessons/${first}`))).body.code).toBe('FORBIDDEN');
    });

    it('freezes content in an archived group', async () => {
      const { first } = await course();
      await leader.post(`/groups/${groupId}/archive`);
      expect((await leader.patch(g(`/lessons/${first}`), { title: 'x' })).body.code).toBe('GROUP_ARCHIVED');
      expect((await member.get(g(`/lessons/${first}`))).status).toBe(200);
    });
  });

  describe("another group's content (IDOR)", () => {
    it("can't be read or changed through a group you lead", async () => {
      const { courseId, moduleId, first } = await course();
      // Someone else leads their own group and tries our ids through it.
      const intruder = await loginAs(t.app, (await createActiveUser(t.prisma, 'intruder')).email);
      const theirs = (await intruder.post('/groups', { name: 'Their group' })).body.id;
      const via = (path: string) => `/groups/${theirs}${path}`;

      expect((await intruder.get(via(`/courses/${courseId}`))).status).toBe(404);
      expect((await intruder.get(via(`/lessons/${first}`))).status).toBe(404);
      expect((await intruder.patch(via(`/courses/${courseId}`), { title: 'Mine now' })).status).toBe(404);
      expect((await intruder.patch(via(`/lessons/${first}`), { title: 'Mine now' })).status).toBe(404);
      expect((await intruder.post(via(`/modules/${moduleId}/lessons`), { title: 'Planted' })).status).toBe(404);
      expect((await intruder.delete(via(`/modules/${moduleId}`))).status).toBe(404);
      expect((await intruder.put(via(`/courses/${courseId}/modules/order`), { ids: [moduleId] })).status).toBe(404);

      expect((await leader.get(g(`/lessons/${first}`))).body.title).toBe('Variables');
    });
  });

  it('deleting a course removes its modules and lessons', async () => {
    const { courseId, first } = await course();
    expect((await leader.delete(g(`/courses/${courseId}`))).status).toBe(204);
    expect((await leader.get(g(`/lessons/${first}`))).status).toBe(404);
    expect(await t.prisma.lesson.count()).toBe(0);
  });
});
