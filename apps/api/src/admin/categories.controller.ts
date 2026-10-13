import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { CategoryView, CreateCategoryInput, ErrorCode, UpdateCategoryInput } from '@studybook/shared';
import { SessionGuard } from '../auth/session.guard.js';
import { ApiError } from '../common/api-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InstanceAdminGuard } from './admin.guard.js';

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Category not found');
}

/**
 * GRP-04: the instance admin manages the category list (the screens come with
 * the admin panel, step 1.8). Deleting a category takes it off its groups.
 */
@ApiTags('admin')
@Controller('admin/categories')
@UseGuards(SessionGuard, InstanceAdminGuard)
export class CategoriesAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiZodBody(CreateCategoryInput)
  @ApiZodResponse(201, CategoryView, 'Category created')
  async create(@Body(new ZodValidationPipe(CreateCategoryInput)) body: z.output<typeof CreateCategoryInput>): Promise<CategoryView> {
    try {
      const { key, nameFr, nameEn } = await this.prisma.category.create({ data: body });
      return { key, nameFr, nameEn };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Key already used', { fields: { key: ['taken'] } });
      }
      throw error;
    }
  }

  @Patch(':key')
  @ApiZodBody(UpdateCategoryInput)
  @ApiZodResponse(200, CategoryView, 'Category updated')
  async update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateCategoryInput)) body: z.output<typeof UpdateCategoryInput>,
  ): Promise<CategoryView> {
    const { count } = await this.prisma.category.updateMany({ where: { key }, data: body });
    if (count === 0) throw notFound();
    const { nameFr, nameEn } = await this.prisma.category.findUniqueOrThrow({ where: { key } });
    return { key, nameFr, nameEn };
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Category deleted' })
  async delete(@Param('key') key: string): Promise<void> {
    const { count } = await this.prisma.category.deleteMany({ where: { key } });
    if (count === 0) throw notFound();
  }
}
