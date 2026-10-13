import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CatalogueGroupDetail, CataloguePage, CategoryList, JoinResult } from '@studybook/shared';
import { CurrentUser, SessionGuard, sessionToken } from '../auth/session.guard.js';
import { Sessions } from '../auth/sessions.js';
import type { User } from '../generated/prisma/client.js';
import { ApiZodResponse } from '../openapi/zod-openapi.js';
import { CatalogueService } from './catalogue.service.js';

/** Public: visitors browse without an account (GRP-04). */
@ApiTags('catalogue')
@Controller()
export class CatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly sessions: Sessions,
  ) {}

  @Get('categories')
  @ApiZodResponse(200, CategoryList, 'Interest categories, in display order')
  async categories(): Promise<CategoryList> {
    return { categories: await this.catalogue.categories() };
  }

  @Get('catalogue')
  @ApiQuery({ name: 'category', required: false, description: 'A category key' })
  @ApiQuery({ name: 'q', required: false, description: 'Matches group names and tags' })
  @ApiQuery({ name: 'cursor', required: false, description: '`nextCursor` from the previous page' })
  @ApiZodResponse(200, CataloguePage, 'Listed groups, newest first')
  list(@Query('category') category?: string, @Query('q') q?: string, @Query('cursor') cursor?: string): Promise<CataloguePage> {
    return this.catalogue.list({ category, q, cursor });
  }

  @Get('catalogue/:slug')
  @ApiZodResponse(200, CatalogueGroupDetail, 'A listed group, and where the visitor stands')
  async detail(@Param('slug') slug: string, @Req() request: FastifyRequest): Promise<CatalogueGroupDetail> {
    const token = sessionToken(request);
    const viewer = token ? ((await this.sessions.resolve(token))?.user ?? null) : null;
    return this.catalogue.detail(slug, viewer);
  }
}

@ApiTags('catalogue')
@Controller()
@UseGuards(SessionGuard)
export class CatalogueRequestController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Post('catalogue/:slug/request')
  @ApiZodResponse(201, JoinResult, 'A request was sent to the leader (or you are already a member)')
  request(@Param('slug') slug: string, @CurrentUser() user: User): Promise<JoinResult> {
    return this.catalogue.requestToJoin(slug, user);
  }
}
