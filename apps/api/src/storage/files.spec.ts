import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UPLOAD_LIMITS } from '@studybook/shared';
import { createTestApp } from '../testing/test-app.js';
import { type Client, createActiveUser, loginAs, ORIGIN } from '../testing/users.js';
import { FilesService } from './files.service.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Real file starts, so type detection has something to read. */
const pdf = (size = 400) => Buffer.concat([Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n'), Buffer.alloc(size, 0x20)]).subarray(0, size);
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);
const notAPdf = Buffer.from('<html><script>alert(1)</script></html>'.padEnd(400, ' '));

describe('uploads, quotas, and downloads (design §5.5, LIM-01, LIM-03)', () => {
  let t: TestApp;
  let leader: Client;
  let member: Client;
  let groupId: string;
  let leaderCookie: string;

  const used = async () => Number((await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } })).storageUsedBytes);
  const ask = (client: Client, body: object) => client.post(`/groups/${groupId}/uploads`, body);
  /** Sends bytes the way the web app does: a raw body, as the uploader. */
  const send = (url: string, bytes: Buffer, cookie = leaderCookie) =>
    request(t.app.getHttpServer())
      .put(url)
      .set('cookie', cookie)
      .set('origin', ORIGIN)
      .set('content-type', 'application/octet-stream')
      .send(bytes);

  async function upload(bytes: Buffer, kind = 'pdf', filename = 'lesson.pdf') {
    const ticket = (await ask(leader, { kind, sizeBytes: bytes.length, filename })).body;
    return { ticket, res: await send(ticket.uploadUrl, bytes) };
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    const leaderUser = await createActiveUser(t.prisma, 'leader');
    leader = await loginAs(t.app, leaderUser.email);
    const login = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('origin', ORIGIN)
      .send({ email: leaderUser.email, password: 'correct horse' });
    leaderCookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='))!;
    groupId = (await leader.post('/groups', { name: 'Python Club' })).body.id;
    const token = (await leader.get(`/groups/${groupId}/invite-link`)).body.token;
    member = await loginAs(t.app, (await createActiveUser(t.prisma, 'bob')).email);
    await member.post(`/invites/${token}/join`);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('asking to upload', () => {
    it('reserves the bytes against the quota', async () => {
      const res = await ask(leader, { kind: 'pdf', sizeBytes: 400, filename: 'lesson.pdf' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ fileId: expect.any(String), uploadUrl: `/api/v1/uploads/${res.body.fileId}`, expiresAt: expect.any(String) });
      expect(await used()).toBe(400);
    });

    it('refuses a file over the size limit for its kind (LIM-03)', async () => {
      const res = await ask(leader, { kind: 'image', sizeBytes: DEFAULT_UPLOAD_LIMITS.image + 1, filename: 'big.jpg' });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'FILE_TOO_LARGE', details: { maxBytes: DEFAULT_UPLOAD_LIMITS.image, kind: 'image' } });
      expect(await used()).toBe(0);
    });

    it('uses the limits the instance sets', async () => {
      await t.prisma.instanceSettings.create({ data: { id: 1, uploadLimits: { pdf: 1000 } } });
      expect((await ask(leader, { kind: 'pdf', sizeBytes: 1001, filename: 'x.pdf' })).body.details.maxBytes).toBe(1000);
    });

    it('refuses what would go over the group quota (LIM-01)', async () => {
      await t.prisma.group.update({ where: { id: groupId }, data: { storageQuotaBytes: 1000 } });
      expect((await ask(leader, { kind: 'pdf', sizeBytes: 600, filename: 'a.pdf' })).status).toBe(201);

      const res = await ask(leader, { kind: 'pdf', sizeBytes: 600, filename: 'b.pdf' });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED', details: { usedBytes: 600, quotaBytes: 1000 } });
    });

    it("can't be squeezed past the quota by asking several times at once (design §5.5)", async () => {
      await t.prisma.group.update({ where: { id: groupId }, data: { storageQuotaBytes: 1000 } });

      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => ask(leader, { kind: 'pdf', sizeBytes: 300, filename: `${i}.pdf` })));

      expect(results.filter((r) => r.status === 201)).toHaveLength(3);
      expect(await used()).toBe(900);
    });

    it('is for the leader and moderators (members upload proof with tasks, step 1.5)', async () => {
      expect((await ask(member, { kind: 'pdf', sizeBytes: 400, filename: 'x.pdf' })).body.code).toBe('FORBIDDEN');
    });
  });

  describe('sending the bytes', () => {
    it('stores a real PDF and lets members open it', async () => {
      const bytes = pdf();
      const { ticket, res } = await upload(bytes);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: ticket.fileId,
        kind: 'pdf',
        mime: 'application/pdf',
        filename: 'lesson.pdf',
        sizeBytes: 400,
        url: `/api/v1/files/${ticket.fileId}`,
      });
      const download = await member.get(`/files/${ticket.fileId}`).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.body as Buffer, bytes)).toBe(0);
      expect(download.headers['content-type']).toBe('application/pdf');
    });

    it('accepts large files as a stream (no 1 MB body limit)', async () => {
      const { res } = await upload(pdf(3 * 1024 * 1024));
      expect(res.status).toBe(200);
      expect(await used()).toBe(3 * 1024 * 1024);
    });

    it('checks the bytes, not the name: HTML called .pdf is refused and the quota released', async () => {
      const { ticket, res } = await upload(notAPdf, 'pdf', 'lesson.pdf');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(await used()).toBe(0);
      expect(await t.prisma.file.findUnique({ where: { id: ticket.fileId } })).toBeNull();
    });

    it('refuses a PNG sent as a PDF', async () => {
      const ticket = (await ask(leader, { kind: 'pdf', sizeBytes: png.length, filename: 'x.pdf' })).body;
      expect((await send(ticket.uploadUrl, png)).body.code).toBe('FILE_TYPE_NOT_ALLOWED');
    });

    it('accepts a PNG as an image', async () => {
      const { res } = await upload(png, 'image', 'photo.png');
      expect(res.body).toMatchObject({ kind: 'image', mime: 'image/png' });
    });

    it('refuses bytes that are not the size announced, and releases the quota', async () => {
      const short = (await ask(leader, { kind: 'pdf', sizeBytes: 500, filename: 'x.pdf' })).body;
      expect((await send(short.uploadUrl, pdf(400))).body.code).toBe('UPLOAD_SIZE_MISMATCH');

      const long = (await ask(leader, { kind: 'pdf', sizeBytes: 300, filename: 'y.pdf' })).body;
      expect((await send(long.uploadUrl, pdf(400))).body.code).toBe('UPLOAD_SIZE_MISMATCH');
      expect(await used()).toBe(0);
    });

    it('takes the bytes once, and only from the person who asked', async () => {
      const { ticket } = await upload(pdf());
      expect((await send(ticket.uploadUrl, pdf())).body.code).toBe('UPLOAD_EXPIRED');

      const other = (await ask(leader, { kind: 'pdf', sizeBytes: 400, filename: 'x.pdf' })).body;
      const memberLogin = await request(t.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('origin', ORIGIN)
        .send({ email: 'bob@example.cm', password: 'correct horse' });
      const memberCookie = ([] as string[]).concat(memberLogin.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='))!;
      expect((await send(other.uploadUrl, pdf(), memberCookie)).body.code).toBe('UPLOAD_EXPIRED');
    });

    it('gives back reservations nobody finished', async () => {
      const { fileId } = (await ask(leader, { kind: 'pdf', sizeBytes: 400, filename: 'x.pdf' })).body;
      await t.prisma.file.update({ where: { id: fileId }, data: { reservedUntil: new Date(Date.now() - 1000) } });

      expect(await t.app.get(FilesService).releaseExpired()).toBe(1);
      expect(await used()).toBe(0);
    });
  });

  describe('downloading', () => {
    it('serves part of a file for seeking in audio and video', async () => {
      const { ticket } = await upload(pdf());

      const head = await member.get(`/files/${ticket.fileId}`).set('range', 'bytes=0-3');
      expect(head.status).toBe(206);
      expect(head.headers['content-range']).toBe('bytes 0-3/400');
      expect(head.headers['content-length']).toBe('4');

      const tail = await member.get(`/files/${ticket.fileId}`).set('range', 'bytes=-10');
      expect(tail.headers['content-range']).toBe('bytes 390-399/400');

      expect((await member.get(`/files/${ticket.fileId}`).set('range', 'bytes=500-600')).status).toBe(416);
    });

    it('never lets a file run as a page', async () => {
      const { ticket } = await upload(pdf());
      const res = await member.get(`/files/${ticket.fileId}`);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['content-disposition']).toBe("inline; filename*=UTF-8''lesson.pdf");
    });

    it("answers people outside the group as if the file didn't exist", async () => {
      const { ticket } = await upload(pdf());
      const stranger = await loginAs(t.app, (await createActiveUser(t.prisma, 'stranger')).email);

      const hidden = await stranger.get(`/files/${ticket.fileId}`);
      const missing = await stranger.get('/files/00000000-0000-4000-8000-000000000000');
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual(missing.body);
      expect((await request(t.app.getHttpServer()).get(`/api/v1/files/${ticket.fileId}`)).status).toBe(401);
    });

    it('keeps an unfinished upload out of reach', async () => {
      const { fileId } = (await ask(leader, { kind: 'pdf', sizeBytes: 400, filename: 'x.pdf' })).body;
      expect((await leader.get(`/files/${fileId}`)).status).toBe(404);
    });
  });

  describe('deleting', () => {
    it('frees the quota; members other than the uploader may not delete', async () => {
      const { ticket } = await upload(pdf());

      expect((await member.delete(`/files/${ticket.fileId}`)).body.code).toBe('FORBIDDEN');
      expect((await leader.delete(`/files/${ticket.fileId}`)).status).toBe(204);
      expect(await used()).toBe(0);
      expect((await member.get(`/files/${ticket.fileId}`)).status).toBe(404);
    });
  });
});
