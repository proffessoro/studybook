import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileKind } from '@studybook/shared';
import { env } from '../config/env.js';
import { createTestApp } from '../testing/test-app.js';
import { createActiveUser, ORIGIN, TEST_PASSWORD } from '../testing/users.js';
import { FilesService } from './files.service.js';
import { MediaProcessor } from './media-processor.js';
import { StorageDriver } from './storage-driver.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;
const run = promisify(execFile);

/** Makes a test file with the same ffmpeg the worker uses. */
async function ffmpeg(dir: string, name: string, args: string[]): Promise<Buffer> {
  const out = path.join(dir, name);
  await run(env.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return readFile(out);
}

/** "h264 … 854x480" from ffmpeg's description of a file (no ffprobe needed). */
async function describeMedia(bytes: Buffer, dir: string): Promise<string> {
  const file = path.join(dir, `probe-${Math.random()}`);
  await writeFile(file, bytes);
  const result = await run(env.ffmpegPath, ['-hide_banner', '-i', file]).catch((error: { stderr: string }) => error);
  return (result as { stderr: string }).stderr;
}

describe('media processing in the worker (design §5.5, CNT-04)', () => {
  let t: TestApp;
  let storage: StorageDriver;
  let processor: MediaProcessor;
  let dir: string;
  let groupId: string;
  let leaderId: string;
  const fixtures: Record<string, Buffer> = {};

  const used = async () => Number((await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } })).storageUsedBytes);
  const read = async (key: string) => {
    const chunks: Buffer[] = [];
    for await (const chunk of storage.read(key)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };

  /** A stored file waiting for processing, counted against the quota as an upload is. */
  async function pendingFile(kind: FileKind, bytes: Buffer, mime: string, filename: string) {
    const file = await t.prisma.file.create({
      data: {
        groupId,
        uploaderId: leaderId,
        kind,
        mime,
        filename,
        sizeBytes: bytes.length,
        storageKey: `groups/${groupId}/${kind}-${Math.random().toString(36).slice(2)}`,
        status: 'ready',
        processingStatus: 'pending',
      },
    });
    await storage.write(file.storageKey, Readable.from(bytes), bytes.length);
    await t.prisma.group.update({ where: { id: groupId }, data: { storageUsedBytes: { increment: bytes.length } } });
    return file;
  }

  beforeAll(async () => {
    t = await createTestApp();
    storage = t.app.get(StorageDriver);
    processor = t.app.get(MediaProcessor);
    dir = await mkdtemp(path.join(tmpdir(), 'studybook-media-spec-'));

    // A phone photo: big, with its location in the EXIF data.
    fixtures.photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a7' } })
      .composite([{ input: Buffer.from('<svg width="3000" height="2000"><circle cx="1500" cy="1000" r="800" fill="#e44"/></svg>'), top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '4/1 3/1 0/1' } })
      .toBuffer();
    fixtures.wav = await ffmpeg(dir, 'voice.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ac', '2']);
    // Already tiny: 64 kbps AAC would be bigger.
    fixtures.tinyMp3 = await ffmpeg(dir, 'tiny.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-ar', '8000', '-ac', '1', '-b:a', '8k']);
    const clip = (size: string) => ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=25:duration=2`, '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest'];
    fixtures.landscape = await ffmpeg(dir, 'landscape.mov', [...clip('1280x720'), '-c:v', 'libx264', '-crf', '8', '-c:a', 'aac', '-f', 'mov']);
    fixtures.portrait = await ffmpeg(dir, 'portrait.mp4', [...clip('720x1280'), '-c:v', 'libx264', '-crf', '8', '-an']);
  }, 120_000);

  beforeEach(async () => {
    await t.reset();
    const leader = await createActiveUser(t.prisma, 'leader');
    leaderId = leader.id;
    const group = await t.prisma.group.create({ data: { ownerId: leader.id, name: 'Club', slug: `club-${Math.random()}` } });
    groupId = group.id;
  });

  afterAll(async () => {
    await t.app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('turns a photo into a smaller WebP without its location data', async () => {
    const file = await pendingFile('image', fixtures.photo!, 'image/jpeg', 'Photo du tableau.JPG');
    await processor.process(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after).toMatchObject({ processingStatus: 'ready', mime: 'image/webp', filename: 'Photo du tableau.webp', storageKey: `${file.storageKey}.webp` });
    const bytes = await read(after.storageKey);
    const meta = await sharp(bytes).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 1067 });
    expect(meta.exif).toBeUndefined();
    expect(Number(after.sizeBytes)).toBe(bytes.length);
    expect(bytes.length).toBeLessThan(fixtures.photo!.length);
    // The quota counts what is stored now, and the original is gone.
    expect(await used()).toBe(bytes.length);
    await expect(read(file.storageKey)).rejects.toThrow();
  });

  it('turns audio into 64 kbps AAC', async () => {
    const file = await pendingFile('audio', fixtures.wav!, 'audio/wav', 'cours.wav');
    await processor.process(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after).toMatchObject({ processingStatus: 'ready', mime: 'audio/mp4', filename: 'cours.m4a' });
    expect(await describeMedia(await read(after.storageKey), dir)).toMatch(/Audio: aac/);
    expect(Number(after.sizeBytes)).toBeLessThan(fixtures.wav!.length / 5);
  });

  it('turns video into 480p H.264 that plays while downloading', async () => {
    const file = await pendingFile('video', fixtures.landscape!, 'video/quicktime', 'cours.mov');
    await processor.process(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after).toMatchObject({ processingStatus: 'ready', mime: 'video/mp4', filename: 'cours.mp4' });
    const bytes = await read(after.storageKey);
    const description = await describeMedia(bytes, dir);
    expect(description).toMatch(/Video: h264.*854x480/);
    expect(description).toMatch(/Audio: aac/);
    // faststart: the index (moov) comes before the media data (mdat).
    expect(bytes.indexOf('moov')).toBeGreaterThan(-1);
    expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));
  }, 60_000);

  it('keeps portrait videos 480 wide, and handles videos without sound', async () => {
    const file = await pendingFile('video', fixtures.portrait!, 'video/mp4', 'vertical.mp4');
    await processor.process(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after.processingStatus).toBe('ready');
    expect(await describeMedia(await read(after.storageKey), dir)).toMatch(/Video: h264.*480x854/);
  }, 60_000);

  it('keeps the original when processing would not make it smaller', async () => {
    const file = await pendingFile('audio', fixtures.tinyMp3!, 'audio/mpeg', 'tiny.mp3');
    await processor.process(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after).toMatchObject({ processingStatus: 'ready', mime: 'audio/mpeg', storageKey: file.storageKey, filename: 'tiny.mp3' });
    expect(await used()).toBe(fixtures.tinyMp3!.length);
    expect(await read(file.storageKey)).toEqual(fixtures.tinyMp3);
  });

  it('a file that fails keeps being served as uploaded', async () => {
    const broken = Buffer.from('not really a video'.repeat(100));
    const file = await pendingFile('video', broken, 'video/mp4', 'broken.mp4');

    await expect(processor.process(file.id)).rejects.toThrow(/ffmpeg exited/);
    await processor.markFailed(file.id);

    const after = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(after).toMatchObject({ processingStatus: 'failed', storageKey: file.storageKey, status: 'ready' });
    expect(await read(file.storageKey)).toEqual(broken);
  });

  it('a file deleted while it is processed leaves no bytes behind and the quota exact', async () => {
    const file = await pendingFile('image', fixtures.photo!, 'image/jpeg', 'photo.jpg');
    const files = t.app.get(FilesService);
    // Deleted just as the processed bytes are being stored.
    const original = storage.write.bind(storage);
    const spy = vi.spyOn(storage, 'write').mockImplementationOnce(async (key, body, max) => {
      await files.discard(file);
      return original(key, body, max);
    });

    await processor.process(file.id);
    spy.mockRestore();

    expect(await t.prisma.file.count()).toBe(0);
    expect(await used()).toBe(0);
    await expect(read(`${file.storageKey}.webp`)).rejects.toThrow();
  });

  it('a file deleted after processing gives back its new, smaller size', async () => {
    const file = await pendingFile('image', fixtures.photo!, 'image/jpeg', 'photo.jpg');
    await processor.process(file.id);
    const files = t.app.get(FilesService);

    // `file` still says the old size and key; deleting must use the row as it is now.
    await files.discard(file);
    expect(await used()).toBe(0);
    await expect(read(`${file.storageKey}.webp`)).rejects.toThrow();
  });

  it('does nothing for a file already processed or deleted', async () => {
    const file = await pendingFile('image', fixtures.photo!, 'image/jpeg', 'photo.jpg');
    await processor.process(file.id);
    const once = await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    await processor.process(file.id);
    expect(await t.prisma.file.findUniqueOrThrow({ where: { id: file.id } })).toEqual(once);
    await expect(processor.process('01a13d96-0000-7000-8000-000000000000')).resolves.toBeUndefined();
  });

  describe('which uploads are queued (instance setting media_processing)', () => {
    /** Uploads through the API like the web app, as the group's leader. */
    async function upload(kind: FileKind, bytes: Buffer, filename: string) {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: leaderId } });
      await t.prisma.membership.upsert({
        where: { groupId_userId: { groupId, userId: leaderId } },
        create: { groupId, userId: leaderId, role: 'leader' },
        update: {},
      });
      const server = t.app.getHttpServer();
      const login = await request(server).post('/api/v1/auth/login').set('origin', ORIGIN).send({ email: user.email, password: TEST_PASSWORD });
      const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='))!;
      const ticket = await request(server)
        .post(`/api/v1/groups/${groupId}/uploads`)
        .set('cookie', cookie)
        .set('origin', ORIGIN)
        .send({ kind, sizeBytes: bytes.length, filename });
      const res = await request(server)
        .put(ticket.body.uploadUrl)
        .set('cookie', cookie)
        .set('origin', ORIGIN)
        .set('content-type', 'application/octet-stream')
        .send(bytes);
      expect(res.status).toBe(200);
      return t.prisma.file.findUniqueOrThrow({ where: { id: res.body.id } });
    }

    it('by default, images only', async () => {
      const image = await upload('image', fixtures.photo!, 'photo.jpg');
      const audio = await upload('audio', fixtures.wav!, 'voice.wav');
      expect(image.processingStatus).toBe('pending');
      expect(audio.processingStatus).toBe('ready');
      expect(t.media.queued).toEqual([image.id]);
    });

    it('"all" adds audio and video; PDFs are never processed', async () => {
      await t.prisma.instanceSettings.create({ data: { id: 1, mediaProcessing: 'all' } });
      const audio = await upload('audio', fixtures.wav!, 'voice.wav');
      const pdf = await upload('pdf', Buffer.from('%PDF-1.4\n%âãÏÓ\n'.padEnd(400, ' ')), 'notes.pdf');
      expect(t.media.queued).toEqual([audio.id]);
      expect(pdf.processingStatus).toBe('ready');
    });

    it('"off" processes nothing', async () => {
      await t.prisma.instanceSettings.create({ data: { id: 1, mediaProcessing: 'off' } });
      const image = await upload('image', fixtures.photo!, 'photo.jpg');
      expect(image.processingStatus).toBe('ready');
      expect(t.media.queued).toEqual([]);
    });
  });
});
