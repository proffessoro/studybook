import { HttpStatus, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  ATTACHMENT_KINDS,
  can,
  type CourseList,
  type CourseOutline,
  type CreateCourseInput,
  ErrorCode,
  imageFileIds,
  type LessonAttachment,
  type LessonView,
  type LessonViewers,
  RichText,
  type UpdateCourseInput,
  type UpdateLessonInput,
  type ValidationDetails,
} from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { type File, type Group, type Membership, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService } from '../storage/files.service.js';

function notFound(what: string) {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`);
}

function invalid(fields: ValidationDetails['fields']) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Invalid input', { fields });
}

/** Leaders and moderators manage content and see drafts; members see what is published (CNT-01). */
const manages = (membership: Membership) => can(membership.role, 'content.manage');

function toAttachment(id: string, file: File): LessonAttachment {
  return {
    id,
    kind: file.kind as LessonAttachment['kind'],
    filename: file.filename,
    mime: file.mime,
    sizeBytes: Number(file.sizeBytes),
    url: `/api/v1/files/${file.id}`,
  };
}

/**
 * Courses, modules, and lessons (CNT-01, CNT-02). Every lookup is scoped to the
 * group from the URL, so an id from another group is "not found" (no IDOR).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async listCourses(group: Group, membership: Membership): Promise<CourseList['courses']> {
    const all = manages(membership);
    const courses = await this.prisma.course.findMany({
      where: { groupId: group.id, ...(all ? {} : { published: true }) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { modules: { include: { _count: { select: { lessons: all ? true : { where: { published: true } } } } } } },
    });
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      published: c.published,
      lessonCount: c.modules.reduce((sum, m) => sum + m._count.lessons, 0),
    }));
  }

  async createCourse(group: Group, input: z.output<typeof CreateCourseInput>): Promise<{ id: string }> {
    const last = await this.prisma.course.aggregate({ where: { groupId: group.id }, _max: { position: true } });
    const course = await this.prisma.course.create({
      data: { groupId: group.id, title: input.title, description: input.description ?? '', position: (last._max.position ?? -1) + 1 },
    });
    return { id: course.id };
  }

  async outline(group: Group, membership: Membership, courseId: string): Promise<CourseOutline> {
    const all = manages(membership);
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, groupId: group.id, ...(all ? {} : { published: true }) },
      include: {
        modules: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          include: {
            lessons: {
              where: all ? {} : { published: true },
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              select: { id: true, title: true, published: true },
            },
          },
        },
      },
    });
    if (!course) throw notFound('Course');
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      published: course.published,
      modules: course.modules.map((m) => ({ id: m.id, title: m.title, lessons: m.lessons })),
    };
  }

  async updateCourse(group: Group, courseId: string, input: z.output<typeof UpdateCourseInput>): Promise<void> {
    const { count } = await this.prisma.course.updateMany({ where: { id: courseId, groupId: group.id }, data: input });
    if (count === 0) throw notFound('Course');
  }

  async deleteCourse(group: Group, courseId: string): Promise<void> {
    const files = await this.attachedFiles({ module: { courseId, course: { groupId: group.id } } });
    const { count } = await this.prisma.course.deleteMany({ where: { id: courseId, groupId: group.id } });
    if (count === 0) throw notFound('Course');
    await this.discardFiles(files);
  }

  async reorderCourses(group: Group, ids: string[]): Promise<void> {
    const courses = await this.prisma.course.findMany({ where: { groupId: group.id }, select: { id: true } });
    await this.reorder(courses, ids, (id, position) => this.prisma.course.update({ where: { id }, data: { position } }));
  }

  async createModule(group: Group, courseId: string, title: string): Promise<{ id: string }> {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, groupId: group.id } });
    if (!course) throw notFound('Course');
    const last = await this.prisma.courseModule.aggregate({ where: { courseId }, _max: { position: true } });
    const created = await this.prisma.courseModule.create({ data: { courseId, title, position: (last._max.position ?? -1) + 1 } });
    return { id: created.id };
  }

  async renameModule(group: Group, moduleId: string, title: string): Promise<void> {
    const { count } = await this.prisma.courseModule.updateMany({ where: { id: moduleId, course: { groupId: group.id } }, data: { title } });
    if (count === 0) throw notFound('Module');
  }

  async deleteModule(group: Group, moduleId: string): Promise<void> {
    const files = await this.attachedFiles({ moduleId, module: { course: { groupId: group.id } } });
    const { count } = await this.prisma.courseModule.deleteMany({ where: { id: moduleId, course: { groupId: group.id } } });
    if (count === 0) throw notFound('Module');
    await this.discardFiles(files);
  }

  async reorderModules(group: Group, courseId: string, ids: string[]): Promise<void> {
    const course = await this.prisma.course.findFirst({ where: { id: courseId, groupId: group.id }, include: { modules: { select: { id: true } } } });
    if (!course) throw notFound('Course');
    await this.reorder(course.modules, ids, (id, position) => this.prisma.courseModule.update({ where: { id }, data: { position } }));
  }

  async createLesson(group: Group, moduleId: string, title: string): Promise<{ id: string }> {
    const module = await this.prisma.courseModule.findFirst({ where: { id: moduleId, course: { groupId: group.id } } });
    if (!module) throw notFound('Module');
    const last = await this.prisma.lesson.aggregate({ where: { moduleId }, _max: { position: true } });
    const created = await this.prisma.lesson.create({ data: { moduleId, title, position: (last._max.position ?? -1) + 1 } });
    return { id: created.id };
  }

  async lesson(group: Group, membership: Membership, lessonId: string): Promise<LessonView> {
    const all = manages(membership);
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        module: { course: { groupId: group.id, ...(all ? {} : { published: true }) } },
        ...(all ? {} : { published: true }),
      },
      include: {
        module: { include: { course: true } },
        attachments: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: { file: true } },
      },
    });
    if (!lesson) throw notFound('Lesson');

    // "Previous" and "next" follow the course order, among the lessons this viewer may see.
    const course = await this.outline(group, membership, lesson.module.courseId);
    const order = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const index = order.indexOf(lesson.id);
    return {
      id: lesson.id,
      title: lesson.title,
      published: lesson.published,
      body: lesson.body as Record<string, unknown>,
      attachments: lesson.attachments.map((a) => toAttachment(a.id, a.file)),
      course: { id: lesson.module.course.id, title: lesson.module.course.title },
      module: { id: lesson.module.id, title: lesson.module.title },
      previousLessonId: order[index - 1] ?? null,
      nextLessonId: order[index + 1] ?? null,
    };
  }

  /** CNT-02. The body must be valid lesson text; its images must be this group's ready images. */
  async updateLesson(group: Group, lessonId: string, input: z.output<typeof UpdateLessonInput>): Promise<void> {
    const existing = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { course: { groupId: group.id } } } });
    if (!existing) throw notFound('Lesson');

    let body: Prisma.InputJsonValue | undefined;
    if (input.body !== undefined) {
      const parsed = RichText.safeParse(input.body);
      if (!parsed.success) {
        const codes = parsed.error.issues.map((i) => (i.code === 'custom' ? String(i.params?.code ?? 'custom') : i.code));
        throw invalid({ body: [...new Set(codes)] });
      }
      const fileIds = imageFileIds(parsed.data);
      if (fileIds.length > 0) {
        const found = await this.prisma.file.count({
          where: { id: { in: fileIds }, groupId: group.id, kind: 'image', status: 'ready' },
        });
        if (found !== new Set(fileIds).size) throw invalid({ body: ['unknown_image'] });
      }
      body = parsed.data as Prisma.InputJsonValue;
    }

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { title: input.title, published: input.published, ...(body !== undefined ? { body } : {}) },
    });
  }

  async deleteLesson(group: Group, lessonId: string): Promise<void> {
    const files = await this.attachedFiles({ id: lessonId, module: { course: { groupId: group.id } } });
    const { count } = await this.prisma.lesson.deleteMany({ where: { id: lessonId, module: { course: { groupId: group.id } } } });
    if (count === 0) throw notFound('Lesson');
    await this.discardFiles(files);
  }

  /** CNT-02. A ready PDF, audio, or video file of this group, not attached anywhere yet, goes at the end. */
  async attach(group: Group, lessonId: string, fileId: string): Promise<LessonAttachment> {
    const lesson = await this.findLesson(group, lessonId);
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, groupId: group.id, status: 'ready', kind: { in: [...ATTACHMENT_KINDS] } },
      include: { lessonAttachment: true },
    });
    if (!file) throw invalid({ fileId: ['unknown_file'] });
    if (file.lessonAttachment) throw invalid({ fileId: ['already_attached'] });

    const last = await this.prisma.lessonAttachment.aggregate({ where: { lessonId: lesson.id }, _max: { position: true } });
    try {
      const created = await this.prisma.lessonAttachment.create({
        data: { lessonId: lesson.id, fileId: file.id, position: (last._max.position ?? -1) + 1 },
      });
      return toAttachment(created.id, file);
    } catch (error) {
      // Two requests attaching the same file at once: the unique file id lets only one win.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw invalid({ fileId: ['already_attached'] });
      }
      throw error;
    }
  }

  async reorderAttachments(group: Group, lessonId: string, ids: string[]): Promise<void> {
    const lesson = await this.findLesson(group, lessonId);
    const attachments = await this.prisma.lessonAttachment.findMany({ where: { lessonId: lesson.id }, select: { id: true } });
    await this.reorder(attachments, ids, (id, position) => this.prisma.lessonAttachment.update({ where: { id }, data: { position } }));
  }

  /** Removing an attachment deletes its file, so the bytes come back to the group's quota. */
  async detach(group: Group, lessonId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.lessonAttachment.findFirst({
      where: { id: attachmentId, lessonId, lesson: { module: { course: { groupId: group.id } } } },
      include: { file: true },
    });
    if (!attachment) throw notFound('Attachment');
    await this.files.discard(attachment.file);
  }

  /**
   * CNT-03. Remembers the first time someone opened a published lesson; opening
   * it again changes nothing. Drafts opened by leaders or moderators don't count.
   */
  async recordView(group: Group, membership: Membership, lessonId: string): Promise<void> {
    const all = manages(membership);
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        id: lessonId,
        module: { course: { groupId: group.id, ...(all ? {} : { published: true }) } },
        ...(all ? {} : { published: true }),
      },
      include: { module: { include: { course: { select: { published: true } } } } },
    });
    if (!lesson) throw notFound('Lesson');
    if (!lesson.published || !lesson.module.course.published) return;
    await this.prisma.lessonView.createMany({ data: [{ lessonId: lesson.id, userId: membership.userId }], skipDuplicates: true });
  }

  /** CNT-03, leader only: each current member, and when they first opened the lesson (pseudos only, MEM-01). */
  async viewers(group: Group, lessonId: string): Promise<LessonViewers> {
    const lesson = await this.findLesson(group, lessonId);
    const [members, views] = await Promise.all([
      this.prisma.membership.findMany({
        where: { groupId: group.id, status: 'active', role: 'member' },
        select: { userId: true, user: { select: { pseudo: true } } },
      }),
      this.prisma.lessonView.findMany({ where: { lessonId: lesson.id } }),
    ]);
    const firstViewed = new Map(views.map((v) => [v.userId, v.firstViewedAt.toISOString()]));
    const rows = members.map((m) => ({ userId: m.userId, pseudo: m.user.pseudo, firstViewedAt: firstViewed.get(m.userId) ?? null }));
    // Who opened it, earliest first; then everyone else by pseudo.
    rows.sort((a, b) => {
      if (a.firstViewedAt && b.firstViewedAt) return a.firstViewedAt.localeCompare(b.firstViewedAt);
      if (a.firstViewedAt || b.firstViewedAt) return a.firstViewedAt ? -1 : 1;
      return a.pseudo.localeCompare(b.pseudo);
    });
    return { viewedCount: rows.filter((r) => r.firstViewedAt).length, memberCount: rows.length, members: rows };
  }

  /** Any lesson of the group, draft or not (for people who manage content). */
  private async findLesson(group: Group, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { course: { groupId: group.id } } } });
    if (!lesson) throw notFound('Lesson');
    return lesson;
  }

  private async attachedFiles(lesson: Prisma.LessonWhereInput): Promise<File[]> {
    const attachments = await this.prisma.lessonAttachment.findMany({ where: { lesson }, include: { file: true } });
    return attachments.map((a) => a.file);
  }

  /** After content is deleted, its files go too and their bytes come back to the quota. */
  private async discardFiles(files: File[]): Promise<void> {
    for (const file of files) await this.files.discard(file);
  }

  async reorderLessons(group: Group, moduleId: string, ids: string[]): Promise<void> {
    const module = await this.prisma.courseModule.findFirst({
      where: { id: moduleId, course: { groupId: group.id } },
      include: { lessons: { select: { id: true } } },
    });
    if (!module) throw notFound('Module');
    await this.reorder(module.lessons, ids, (id, position) => this.prisma.lesson.update({ where: { id }, data: { position } }));
  }

  /** `ids` must list exactly the existing items, so a reorder can't move items in from elsewhere. */
  private async reorder(
    existing: { id: string }[],
    ids: string[],
    update: (id: string, position: number) => Prisma.PrismaPromise<unknown>,
  ): Promise<void> {
    const known = new Set(existing.map((e) => e.id));
    if (ids.length !== known.size || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
      throw invalid({ ids: ['mismatch'] });
    }
    await this.prisma.$transaction(ids.map((id, position) => update(id, position)));
  }
}
