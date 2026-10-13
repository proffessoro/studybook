import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  CourseList,
  CourseOutline,
  CreateCourseInput,
  CreatedId,
  LessonView,
  ReorderInput,
  TitleInput,
  UpdateCourseInput,
  UpdateLessonInput,
} from '@studybook/shared';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Group, Membership } from '../generated/prisma/client.js';
import { CurrentGroup, CurrentMembership, GroupRoute } from '../groups/group-access.guard.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { ContentService } from './content.service.js';

const done = { status: 204, description: 'Done' };

/** CNT-01, CNT-02. Reading needs membership; changes need `content.manage` (leader, moderators). */
@ApiTags('content')
@Controller('groups/:groupId')
@UseGuards(SessionGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('courses')
  @GroupRoute('group.view')
  @ApiZodResponse(200, CourseList, 'Courses in order; members see published ones')
  async courses(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership): Promise<CourseList> {
    return { courses: await this.content.listCourses(group, membership) };
  }

  @Post('courses')
  @GroupRoute('content.manage')
  @ApiZodBody(CreateCourseInput)
  @ApiZodResponse(201, CreatedId, 'Course created, as a draft')
  createCourse(
    @CurrentGroup() group: Group,
    @Body(new ZodValidationPipe(CreateCourseInput)) body: z.output<typeof CreateCourseInput>,
  ): Promise<CreatedId> {
    return this.content.createCourse(group, body);
  }

  @Put('courses/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiZodBody(ReorderInput)
  @ApiResponse(done)
  async reorderCourses(@CurrentGroup() group: Group, @Body(new ZodValidationPipe(ReorderInput)) body: z.output<typeof ReorderInput>) {
    await this.content.reorderCourses(group, body.ids);
  }

  @Get('courses/:courseId')
  @GroupRoute('group.view')
  @ApiParam({ name: 'courseId', type: String })
  @ApiZodResponse(200, CourseOutline, 'The course with its modules and lessons')
  outline(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership, @Param('courseId') courseId: string) {
    return this.content.outline(group, membership, courseId);
  }

  @Patch('courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'courseId', type: String })
  @ApiZodBody(UpdateCourseInput)
  @ApiResponse(done)
  async updateCourse(
    @CurrentGroup() group: Group,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(UpdateCourseInput)) body: z.output<typeof UpdateCourseInput>,
  ) {
    await this.content.updateCourse(group, courseId, body);
  }

  @Delete('courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'courseId', type: String })
  @ApiResponse(done)
  async deleteCourse(@CurrentGroup() group: Group, @Param('courseId') courseId: string) {
    await this.content.deleteCourse(group, courseId);
  }

  @Post('courses/:courseId/modules')
  @GroupRoute('content.manage')
  @ApiParam({ name: 'courseId', type: String })
  @ApiZodBody(TitleInput)
  @ApiZodResponse(201, CreatedId, 'Module created')
  createModule(
    @CurrentGroup() group: Group,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(TitleInput)) body: z.output<typeof TitleInput>,
  ): Promise<CreatedId> {
    return this.content.createModule(group, courseId, body.title);
  }

  @Put('courses/:courseId/modules/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'courseId', type: String })
  @ApiZodBody(ReorderInput)
  @ApiResponse(done)
  async reorderModules(
    @CurrentGroup() group: Group,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(ReorderInput)) body: z.output<typeof ReorderInput>,
  ) {
    await this.content.reorderModules(group, courseId, body.ids);
  }

  @Patch('modules/:moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'moduleId', type: String })
  @ApiZodBody(TitleInput)
  @ApiResponse(done)
  async renameModule(
    @CurrentGroup() group: Group,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(TitleInput)) body: z.output<typeof TitleInput>,
  ) {
    await this.content.renameModule(group, moduleId, body.title);
  }

  @Delete('modules/:moduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'moduleId', type: String })
  @ApiResponse(done)
  async deleteModule(@CurrentGroup() group: Group, @Param('moduleId') moduleId: string) {
    await this.content.deleteModule(group, moduleId);
  }

  @Post('modules/:moduleId/lessons')
  @GroupRoute('content.manage')
  @ApiParam({ name: 'moduleId', type: String })
  @ApiZodBody(TitleInput)
  @ApiZodResponse(201, CreatedId, 'Lesson created, as a draft')
  createLesson(
    @CurrentGroup() group: Group,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(TitleInput)) body: z.output<typeof TitleInput>,
  ): Promise<CreatedId> {
    return this.content.createLesson(group, moduleId, body.title);
  }

  @Put('modules/:moduleId/lessons/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'moduleId', type: String })
  @ApiZodBody(ReorderInput)
  @ApiResponse(done)
  async reorderLessons(
    @CurrentGroup() group: Group,
    @Param('moduleId') moduleId: string,
    @Body(new ZodValidationPipe(ReorderInput)) body: z.output<typeof ReorderInput>,
  ) {
    await this.content.reorderLessons(group, moduleId, body.ids);
  }

  @Get('lessons/:lessonId')
  @GroupRoute('group.view')
  @ApiParam({ name: 'lessonId', type: String })
  @ApiZodResponse(200, LessonView, 'The lesson')
  lesson(@CurrentGroup() group: Group, @CurrentMembership() membership: Membership, @Param('lessonId') lessonId: string) {
    return this.content.lesson(group, membership, lessonId);
  }

  @Patch('lessons/:lessonId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'lessonId', type: String })
  @ApiZodBody(UpdateLessonInput)
  @ApiResponse(done)
  async updateLesson(
    @CurrentGroup() group: Group,
    @Param('lessonId') lessonId: string,
    @Body(new ZodValidationPipe(UpdateLessonInput)) body: z.output<typeof UpdateLessonInput>,
  ) {
    await this.content.updateLesson(group, lessonId, body);
  }

  @Delete('lessons/:lessonId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @GroupRoute('content.manage')
  @ApiParam({ name: 'lessonId', type: String })
  @ApiResponse(done)
  async deleteLesson(@CurrentGroup() group: Group, @Param('lessonId') lessonId: string) {
    await this.content.deleteLesson(group, lessonId);
  }
}
