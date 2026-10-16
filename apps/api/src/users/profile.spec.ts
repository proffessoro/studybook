import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse';

describe('profile editing (ACC-06)', () => {
  let t: TestApp;
  let cookie: string;
  const server = () => t.app.getHttpServer();
  const patch = (body: object) =>
    request(server()).patch('/api/v1/me').set('origin', ORIGIN).set('cookie', cookie).send(body);
  const post = (path: string, body: object) =>
    request(server()).post(`/api/v1${path}`).set('origin', ORIGIN).set('cookie', cookie).send(body);

  async function createUser(data: { email: string; pseudo: string; phone?: string; status?: 'active' | 'pending'; createdAt?: Date }) {
    const status = data.status ?? 'active';
    return t.prisma.user.create({
      data: {
        fullName: 'Someone',
        passwordHash: await hash(PASSWORD),
        locale: 'fr',
        emailVerifiedAt: status === 'active' ? new Date() : null,
        ...data,
        status,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
    await createUser({ email: 'ama@example.cm', pseudo: 'ama', phone: '+237677123456' });
    const login = await request(server())
      .post('/api/v1/auth/login')
      .set('origin', ORIGIN)
      .send({ email: 'ama@example.cm', password: PASSWORD });
    cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='))!;
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('PATCH /me', () => {
    it('changes only the fields sent', async () => {
      const res = await patch({ fullName: '  Ama K. Kouam ', locale: 'en' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ fullName: 'Ama K. Kouam', locale: 'en', pseudo: 'ama', phone: '+237677123456' });
    });

    it('normalises a new phone number and checks its format', async () => {
      expect((await patch({ phone: '6 99 00 00 00' })).body.phone).toBe('+237699000000');
      expect((await patch({ phone: '12' })).body.details.fields).toEqual({ phone: ['invalid_format'] });
    });

    it('refuses a pseudo or phone used by someone else, ignoring case', async () => {
      await createUser({ email: 'bob@example.cm', pseudo: 'Bob', phone: '+237699000000' });

      const res = await patch({ pseudo: 'BOB', phone: '699000000' });

      expect(res.status).toBe(400);
      expect(res.body.details.fields).toEqual({ pseudo: ['taken'], phone: ['taken'] });
    });

    it('lets the user change the case of their own pseudo', async () => {
      expect((await patch({ pseudo: 'Ama' })).body.pseudo).toBe('Ama');
    });

    it('frees a pseudo held by an unverified sign-up older than 24 hours', async () => {
      await createUser({ email: 'old@example.cm', pseudo: 'kofi', status: 'pending', createdAt: new Date(Date.now() - 25 * 3600 * 1000) });
      expect((await patch({ pseudo: 'kofi' })).status).toBe(200);
    });

    it('needs a session and a request from the app itself', async () => {
      expect((await request(server()).patch('/api/v1/me').set('origin', ORIGIN).send({ fullName: 'X Y' })).status).toBe(401);
      const csrf = await request(server()).patch('/api/v1/me').set('origin', 'https://evil.example').set('cookie', cookie).send({ fullName: 'X Y' });
      expect(csrf.status).toBe(403);
    });
  });

  describe('changing email', () => {
    const codeFor = (email: string) => t.outbox.last(email, 'confirm-email-change')?.data.code ?? '';

    it('needs the current password', async () => {
      const res = await post('/me/email', { newEmail: 'new@example.cm', password: 'wrong' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WRONG_PASSWORD');
      expect(t.outbox.sent).toHaveLength(0);
    });

    it('sends a code to the new address, then switches and tells the old address', async () => {
      const start = await post('/me/email', { newEmail: 'New@Example.cm', password: PASSWORD });
      expect(start.status).toBe(202);
      expect(start.body).toEqual({ newEmail: 'new@example.cm' });

      // Nothing changes until the code is entered.
      expect((await request(server()).get('/api/v1/me').set('cookie', cookie)).body.email).toBe('ama@example.cm');

      const res = await post('/me/email/confirm', { code: codeFor('new@example.cm') });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('new@example.cm');
      expect(t.outbox.last('ama@example.cm', 'email-changed')?.data.newEmail).toBe('new@example.cm');
      const login = await request(server())
        .post('/api/v1/auth/login')
        .set('origin', ORIGIN)
        .send({ email: 'new@example.cm', password: PASSWORD });
      expect(login.status).toBe(200);
    });

    it('refuses an address used by another account', async () => {
      await createUser({ email: 'bob@example.cm', pseudo: 'bob' });
      const res = await post('/me/email', { newEmail: 'BOB@example.cm', password: PASSWORD });
      expect(res.body.details.fields).toEqual({ newEmail: ['taken'] });
    });

    it('refuses the current address', async () => {
      const res = await post('/me/email', { newEmail: 'ama@example.cm', password: PASSWORD });
      expect(res.body.details.fields).toEqual({ newEmail: ['same'] });
    });

    it('rejects a wrong code and keeps the old email', async () => {
      await post('/me/email', { newEmail: 'new@example.cm', password: PASSWORD });
      const wrong = codeFor('new@example.cm') === '000000' ? '111111' : '000000';

      const res = await post('/me/email/confirm', { code: wrong });

      expect(res.body.code).toBe('VERIFICATION_CODE_INVALID');
      expect((await t.prisma.user.findFirstOrThrow({ where: { pseudo: 'ama' } })).email).toBe('ama@example.cm');
    });

    it('a sign-up verification code does not confirm an email change', async () => {
      await post('/me/email', { newEmail: 'new@example.cm', password: PASSWORD });
      await t.prisma.verificationCode.updateMany({ data: { purpose: 'verify' } });

      const res = await post('/me/email/confirm', { code: codeFor('new@example.cm') });

      expect(res.status).toBe(400);
    });

    it('refuses to switch if the address was taken while the code was on its way', async () => {
      await post('/me/email', { newEmail: 'new@example.cm', password: PASSWORD });
      await createUser({ email: 'new@example.cm', pseudo: 'quick' });

      const res = await post('/me/email/confirm', { code: codeFor('new@example.cm') });

      expect(res.body.details.fields).toEqual({ newEmail: ['taken'] });
    });
  });
});
