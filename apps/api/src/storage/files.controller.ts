import type { Readable } from 'node:stream';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ErrorCode, FileView, RequestUploadInput, UploadTicket } from '@studybook/shared';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ApiError } from '../common/api-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Group, User } from '../generated/prisma/client.js';
import { CurrentGroup, GroupRoute } from '../groups/group-access.guard.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { FilesService } from './files.service.js';

/** `bytes=start-end` (one range). Undefined: send everything; null: can't be served. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    // "bytes=-500": the last 500 bytes
    start = Math.max(size - Number(match[2]), 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  return start <= end && start < size ? { start, end } : null;
}

@ApiTags('files')
@Controller()
@UseGuards(SessionGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Step 1: announce the upload. Content is managed by the leader and moderators; proof uploads come with tasks (1.5). */
  @Post('groups/:groupId/uploads')
  @GroupRoute('content.manage')
  @ApiZodBody(RequestUploadInput)
  @ApiZodResponse(201, UploadTicket, 'Quota reserved; send the bytes to uploadUrl')
  request(
    @CurrentGroup() group: Group,
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(RequestUploadInput)) body: z.output<typeof RequestUploadInput>,
  ): Promise<UploadTicket> {
    return this.files.request(group, user, body);
  }

  /** Step 2: the file itself, as the raw request body (`application/octet-stream`). */
  @Put('uploads/:fileId')
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiZodResponse(200, FileView, 'Stored and checked')
  receive(@Param('fileId') fileId: string, @CurrentUser() user: User, @Req() request: FastifyRequest): Promise<FileView> {
    const body = request.body as Readable | undefined;
    if (!body || typeof (body as Readable).pipe !== 'function') {
      throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.BAD_REQUEST, 'Send the file as application/octet-stream');
    }
    const length = request.headers['content-length'];
    return this.files.receive(fileId, user, body, length === undefined ? undefined : Number(length));
  }

  /** Members only. Supports ranges, so audio and video seek while streaming (CNT-02). */
  @Get('files/:fileId')
  @ApiResponse({ status: 200, description: 'The file' })
  @ApiResponse({ status: 206, description: 'Part of the file (Range request)' })
  async download(
    @Param('fileId') fileId: string,
    @CurrentUser() user: User,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const file = await this.files.open(fileId, user);
    const size = Number(file.sizeBytes);
    const range = parseRange(request.headers.range, size);

    reply
      .header('Content-Type', file.mime)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      // Uploaded bytes are never run as a page, whatever they contain.
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, max-age=3600');

    if (range === null) {
      await reply.status(416).header('Content-Range', `bytes */${size}`).send();
      return;
    }
    if (range) {
      await reply
        .status(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
        .header('Content-Length', range.end - range.start + 1)
        .send(this.files.read(file, range));
      return;
    }
    await reply.status(200).header('Content-Length', size).send(this.files.read(file));
  }

  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Deleted; the bytes count no more against the quota' })
  async delete(@Param('fileId') fileId: string, @CurrentUser() user: User): Promise<void> {
    await this.files.delete(fileId, user);
  }
}
