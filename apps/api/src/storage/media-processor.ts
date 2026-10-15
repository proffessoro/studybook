import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { File } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageDriver } from './storage-driver.js';
import { OUTPUTS } from './media-outputs.js';
import { transcode } from './transcode.js';

/** "Cours 1.MOV" → "Cours 1.mp4" */
function renamed(filename: string, extension: string): string {
  const { name } = path.parse(filename);
  return `${name || 'file'}.${extension}`;
}

/**
 * Makes stored files cheaper to download (design §5.5, CNT-04): images to WebP,
 * audio to 64 kbps AAC, video to 480p H.264. The smaller file replaces the
 * original and the group's quota counts its real size. The original stays
 * whenever processing fails or doesn't make the file smaller.
 */
@Injectable()
export class MediaProcessor {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
  ) {}

  async process(fileId: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    // Deleted, or already handled (e.g. queued twice): nothing to do.
    if (!file || file.status !== 'ready' || file.processingStatus !== 'pending') return;
    const target = OUTPUTS[file.kind];
    if (!target) {
      await this.finish(file.id);
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'studybook-media-'));
    try {
      const output = path.join(dir, `out.${target.extension}`);
      await transcode(file.kind, await this.storage.localPath(file.storageKey), output);
      const size = (await stat(output)).size;
      if (size >= Number(file.sizeBytes)) {
        this.logger.log(`Kept ${file.id} as uploaded: processing would not make it smaller`);
        await this.finish(file.id);
        return;
      }
      await this.replace(file, output, size, target);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** After the last attempt fails: members keep getting the original. */
  async markFailed(fileId: string): Promise<void> {
    await this.prisma.file.updateMany({ where: { id: fileId, processingStatus: 'pending' }, data: { processingStatus: 'failed' } });
  }

  private async replace(file: File, output: string, size: number, target: { extension: string; mime: string }): Promise<void> {
    const newKey = `${file.storageKey}.${target.extension}`;
    await this.storage.write(newKey, createReadStream(output), size);

    const swapped = await this.prisma.$transaction(async (tx) => {
      // Only if the file is still the one we read: not deleted or replaced meanwhile.
      const { count } = await tx.file.updateMany({
        where: { id: file.id, storageKey: file.storageKey, processingStatus: 'pending' },
        data: {
          storageKey: newKey,
          mime: target.mime,
          filename: renamed(file.filename, target.extension),
          sizeBytes: size,
          processingStatus: 'ready',
        },
      });
      if (count === 1) {
        await tx.$executeRaw`
          UPDATE groups SET storage_used_bytes = GREATEST(storage_used_bytes + ${BigInt(size) - file.sizeBytes}, 0)
          WHERE id = ${file.groupId}::uuid`;
      }
      return count === 1;
    });

    // Whichever bytes no row points to any more go.
    await this.storage.delete(swapped ? file.storageKey : newKey).catch((error: unknown) => {
      this.logger.warn(`Could not delete ${swapped ? file.storageKey : newKey}: ${(error as Error).message}`);
    });
    if (swapped) this.logger.log(`Processed ${file.id}: ${file.sizeBytes} → ${size} bytes`);
  }

  private async finish(fileId: string): Promise<void> {
    await this.prisma.file.updateMany({ where: { id: fileId, processingStatus: 'pending' }, data: { processingStatus: 'ready' } });
  }
}
