import { HttpStatus, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  can,
  type CourseList,
  type CourseOutline,
  type CreateCourseInput,
  ErrorCode,
  imageFileIds,
  type LessonView,
  RichText,
  type UpdateCourseInput,
  type UpdateLessonInput,
  type ValidationDetails,
} from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { Group, Membership, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function notFound(what: string) {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`);
}

function invalid(fields: ValidationDetails['fields']) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Invalid input', { fields });
}

/** Leaders and moderators manage content and see drafts; members see what is published (CNT-01). */
const manages = (membership: Membership) => can(membership.role, 'content.manage');

/**
 * Courses, modules, and lessons (CNT-01, CNT-02). Every lookup is scoped to the
 * group from the URL, so an id from another group is "not found" (no IDOR).
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { count } = await this.prisma.course.deleteMany({ where: { id: courseId, groupId: group.id } });
    if (count === 0) throw notFound('Course');
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
    const { count } = await this.prisma.courseModule.deleteMany({ where: { id: moduleId, course: { groupId: group.id } } });
    if (count === 0) throw notFound('Module');
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
      include: { module: { include: { course: true } } },
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
    const { count } = await this.prisma.lesson.deleteMany({ where: { id: lessonId, module: { course: { groupId: group.id } } } });
    if (count === 0) throw notFound('Lesson');
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
