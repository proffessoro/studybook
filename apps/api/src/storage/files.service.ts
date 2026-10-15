import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fileTypeFromFile } from 'file-type';
import {
  ALLOWED_MIME_TYPES,
  can,
  DEFAULT_UPLOAD_LIMITS,
  ErrorCode,
  type FileKind,
  type FileView,
  type RequestUploadInput,
  type UploadTicket,
} from '@studybook/shared';
import type { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import type { File, Group, User } from '../generated/prisma/client.js';
import { canAccessGroup } from '../groups/group-access.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaQueue } from './media-queue.js';
import { StorageDriver, TooManyBytesError } from './storage-driver.js';
import { OUTPUTS } from './media-outputs.js';

/** How long the client has to send the bytes after asking to upload. */
const RESERVATION_MS = 60 * 60 * 1000;
/** How long one upload may take before its reservation is released. */
const UPLOADING_MS = 2 * 60 * 60 * 1000;

function fileNotFound() {
  return new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'File not found');
}

/** "../../My lesson.pdf" → "My lesson.pdf": a display name only, never a path. */
function cleanFilename(name: string): string {
  // Control characters would break the Content-Disposition header; removing them is the point.
  // eslint-disable-next-line no-control-regex
  return path.basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f"]/g, '').slice(0, 200) || 'file';
}

/**
 * Uploads, quotas, and downloads (design §5.5, LIM-01, LIM-03):
 * 1. `request` checks the size limit and reserves the bytes against the group's quota;
 * 2. `receive` streams the bytes to storage and checks what they really are;
 * 3. `open` serves them, to members only.
 * Every failure gives the reserved bytes back.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly media: MediaQueue,
  ) {}

  async request(group: Group, user: User, input: z.output<typeof RequestUploadInput>): Promise<UploadTicket> {
    const maxBytes = await this.limitFor(input.kind);
    if (input.sizeBytes > maxBytes) {
      throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.FILE_TOO_LARGE, 'File too large', { maxBytes, kind: input.kind });
    }

    const file = await this.prisma.$transaction(async (tx) => {
      // One statement that only succeeds if the bytes fit, so two uploads can't both pass the check.
      const reserved = await tx.$executeRaw`
        UPDATE groups SET storage_used_bytes = storage_used_bytes + ${input.sizeBytes}
        WHERE id = ${group.id}::uuid
          AND (storage_quota_bytes IS NULL OR storage_used_bytes + ${input.sizeBytes} <= storage_quota_bytes)`;
      if (reserved === 0) {
        const current = await tx.group.findUniqueOrThrow({ where: { id: group.id } });
        throw new ApiError(HttpStatus.CONFLICT, ErrorCode.STORAGE_QUOTA_EXCEEDED, 'Not enough storage left in this group', {
          usedBytes: Number(current.storageUsedBytes),
          quotaBytes: current.storageQuotaBytes === null ? null : Number(current.storageQuotaBytes),
        });
      }
      const created = await tx.file.create({
        data: {
          groupId: group.id,
          uploaderId: user.id,
          kind: input.kind,
          mime: 'application/octet-stream',
          filename: cleanFilename(input.filename),
          sizeBytes: input.sizeBytes,
          storageKey: `pending/${randomUUID()}`,
          reservedUntil: new Date(Date.now() + RESERVATION_MS),
        },
      });
      return tx.file.update({ where: { id: created.id }, data: { storageKey: `groups/${group.id}/${created.id}` } });
    });

    return { fileId: file.id, uploadUrl: `/api/v1/uploads/${file.id}`, expiresAt: file.reservedUntil!.toISOString() };
  }

  /** Receives the bytes of a reserved upload, from the person who asked for it. */
  async receive(fileId: string, user: User, body: Readable, contentLength: number | undefined): Promise<FileView> {
    const now = new Date();
    // Claim it, so a second upload to the same file can't write at the same time.
    const { count } = await this.prisma.file.updateMany({
      where: { id: fileId, uploaderId: user.id, status: 'reserved', reservedUntil: { gt: now } },
      data: { status: 'uploading', reservedUntil: new Date(now.getTime() + UPLOADING_MS) },
    });
    if (count !== 1) {
      throw new ApiError(HttpStatus.GONE, ErrorCode.UPLOAD_EXPIRED, 'This upload expired or was already sent; start again');
    }
    const file = await this.prisma.file.findUniqueOrThrow({ where: { id: fileId } });
    const size = Number(file.sizeBytes);

    try {
      if (contentLength !== undefined && contentLength !== size) throw sizeMismatch(size);
      let written: number;
      try {
        written = await this.storage.write(file.storageKey, body, size);
      } catch (error) {
        if (error instanceof TooManyBytesError) throw sizeMismatch(size);
        throw error;
      }
      if (written !== size) throw sizeMismatch(size);

      // What the bytes really are, whatever the name or the browser says.
      const detected = await fileTypeFromFile(await this.storage.localPath(file.storageKey));
      if (!detected || !ALLOWED_MIME_TYPES[file.kind].includes(detected.mime)) {
        throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.FILE_TYPE_NOT_ALLOWED, 'This file type is not accepted here', {
          kind: file.kind,
          allowed: ALLOWED_MIME_TYPES[file.kind],
        });
      }

      const process = await this.processes(file.kind);
      const ready = await this.prisma.file.update({
        where: { id: file.id },
        data: { status: 'ready', mime: detected.mime, reservedUntil: null, processingStatus: process ? 'pending' : 'ready' },
      });
      if (process) {
        // Served as uploaded until the worker is done. If Valkey is down, the worker queues it again when it starts.
        await this.media.add(ready.id, ready.kind).catch((error: unknown) => {
          this.logger.warn(`Could not queue ${ready.id} for processing: ${(error as Error).message}`);
        });
      }
      return toFileView(ready);
    } catch (error) {
      await this.discard(file);
      throw error;
    }
  }

  /** A ready file, if `user` may see it: an active member of its group. */
  async open(fileId: string, user: User): Promise<File> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.status !== 'ready') throw fileNotFound();
    const membership = await this.prisma.membership.findUnique({
      where: { groupId_userId: { groupId: file.groupId, userId: user.id } },
    });
    // Not a member: the same answer as no file, so file ids reveal nothing.
    if (!canAccessGroup(membership)) throw fileNotFound();
    return file;
  }

  read(file: File, range?: { start: number; end: number }): Readable {
    return this.storage.read(file.storageKey, range);
  }

  /** The uploader, or someone who manages the group's content, may delete. The bytes come back to the quota. */
  async delete(fileId: string, user: User): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw fileNotFound();
    const membership = await this.prisma.membership.findUnique({
      where: { groupId_userId: { groupId: file.groupId, userId: user.id } },
    });
    if (!canAccessGroup(membership)) throw fileNotFound();
    if (file.uploaderId !== user.id && !can(membership!.role, 'content.manage')) {
      throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Not allowed to delete this file');
    }
    await this.discard(file);
  }

  /** Releases reservations nobody finished (run by the worker). Returns how many. */
  async releaseExpired(): Promise<number> {
    const expired = await this.prisma.file.findMany({
      where: { status: { in: ['reserved', 'uploading'] }, reservedUntil: { lt: new Date() } },
      take: 500,
    });
    for (const file of expired) await this.discard(file);
    return expired.length;
  }

  /** Removes the row and the bytes, and gives the bytes back to the group's quota. */
  async discard(file: File): Promise<void> {
    // The row as it is now: processing may have swapped in a smaller file since `file` was read.
    const removed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ storage_key: string; size_bytes: bigint }[]>`
        DELETE FROM files WHERE id = ${file.id}::uuid RETURNING storage_key, size_bytes`;
      // Only the call that removed the row gives the bytes back, even if two run at once.
      if (rows[0]) {
        await tx.$executeRaw`
          UPDATE groups SET storage_used_bytes = GREATEST(storage_used_bytes - ${rows[0].size_bytes}, 0)
          WHERE id = ${file.groupId}::uuid`;
      }
      return rows[0];
    });
    for (const key of new Set([file.storageKey, removed?.storage_key ?? file.storageKey])) {
      await this.storage.delete(key).catch((error: unknown) => {
        this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
      });
    }
  }

  /** `instance_settings.media_processing`: "off", "images" (the default, light on CPU), or "all" (CNT-04). */
  private async processes(kind: FileKind): Promise<boolean> {
    if (!OUTPUTS[kind]) return false;
    const settings = await this.prisma.instanceSettings.findUnique({ where: { id: 1 } });
    const mode = settings?.mediaProcessing ?? 'images';
    return mode === 'all' || (mode === 'images' && kind === 'image');
  }

  private async limitFor(kind: FileKind): Promise<number> {
    const settings = await this.prisma.instanceSettings.findUnique({ where: { id: 1 } });
    const custom = (settings?.uploadLimits ?? {}) as Partial<Record<FileKind, unknown>>;
    return typeof custom[kind] === 'number' ? (custom[kind] as number) : DEFAULT_UPLOAD_LIMITS[kind];
  }
}

function sizeMismatch(expected: number) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.UPLOAD_SIZE_MISMATCH, 'The file is not the size announced', {
    expectedBytes: expected,
  });
}

export function toFileView(file: File): FileView {
  return {
    id: file.id,
    kind: file.kind,
    mime: file.mime,
    filename: file.filename,
    sizeBytes: Number(file.sizeBytes),
    url: `/api/v1/files/${file.id}`,
  };
}
