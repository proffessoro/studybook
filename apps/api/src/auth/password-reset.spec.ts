import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const ORIGIN = 'http://localhost:3000';

describe('password reset by email (ACC-05)', () => {
  let t: TestApp;
  const post = (path: string, body: object) =>
    request(t.app.getHttpServer()).post(`/api/v1/auth${path}`).set('origin', ORIGIN).send(body);
  const tokenFor = (email: string) => {
    const link = t.outbox.last(email, 'reset-password')?.data.link ?? '';
    return new URL(link).searchParams.get('token') ?? '';
  };

  async function createUser(status: 'active' | 'pending' = 'active') {
    return t.prisma.user.create({
      data: {
        fullName: 'Ama Kouam',
        pseudo: 'ama',
        email: 'ama@example.cm',
        passwordHash: await hash('old password'),
        status,
        emailVerifiedAt: status === 'active' ? new Date() : null,
        locale: 'fr',
      },
    });
  }

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('emails a reset link in the user language', async () => {
    await createUser();

    const res = await post('/recover', { email: 'AMA@example.cm' });

    expect(res.status).toBe(202);
    const email = t.outbox.last('ama@example.cm', 'reset-password');
    expect(email?.locale).toBe('fr');
    expect(email?.data.link).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}$/);
  });

  it('answers the same for an unknown or unverified address, without sending anything', async () => {
    await createUser('pending');

    for (const email of ['nobody@example.cm', 'ama@example.cm']) {
      expect((await post('/recover', { email })).status).toBe(202);
    }
    expect(t.outbox.sent).toHaveLength(0);
  });

  it('sets the new password, which then logs in, and the old one no longer does', async () => {
    await createUser();
    await post('/recover', { email: 'ama@example.cm' });

    const res = await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'new password' });

    expect(res.status).toBe(204);
    expect((await post('/login', { email: 'ama@example.cm', password: 'new password' })).status).toBe(200);
    expect((await post('/login', { email: 'ama@example.cm', password: 'old password' })).status).toBe(401);
  });

  it('logs the user out on every device', async () => {
    await createUser();
    await post('/login', { email: 'ama@example.cm', password: 'old password' });
    await post('/login', { email: 'ama@example.cm', password: 'old password' });
    expect(await t.prisma.session.count()).toBe(2);

    await post('/recover', { email: 'ama@example.cm' });
    await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'new password' });

    expect(await t.prisma.session.count()).toBe(0);
  });

  it('works only once', async () => {
    await createUser();
    await post('/recover', { email: 'ama@example.cm' });
    const token = tokenFor('ama@example.cm');
    await post('/recover/confirm', { token, password: 'new password' });

    const res = await post('/recover/confirm', { token, password: 'another password' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESET_LINK_INVALID');
  });

  it('expires after an hour', async () => {
    await createUser();
    await post('/recover', { email: 'ama@example.cm' });
    const stored = await t.prisma.verificationCode.findFirstOrThrow();
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeLessThanOrEqual(3600 * 1000);
    await t.prisma.verificationCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'new password' });

    expect(res.body.code).toBe('RESET_LINK_INVALID');
  });

  it('voids the earlier link when a new one is requested', async () => {
    await createUser();
    await post('/recover', { email: 'ama@example.cm' });
    const first = tokenFor('ama@example.cm');
    await post('/recover', { email: 'ama@example.cm' });

    expect((await post('/recover/confirm', { token: first, password: 'new password' })).body.code).toBe(
      'RESET_LINK_INVALID',
    );
    expect((await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'new password' })).status).toBe(
      204,
    );
  });

  it('rejects a made-up token and a short password', async () => {
    await createUser();
    expect((await post('/recover/confirm', { token: 'x'.repeat(43), password: 'new password' })).body.code).toBe(
      'RESET_LINK_INVALID',
    );
    await post('/recover', { email: 'ama@example.cm' });
    const res = await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'short' });
    expect(res.body.details.fields).toEqual({ password: ['too_small'] });
  });

  it("can't be used as another kind of code", async () => {
    await createUser();
    await post('/recover', { email: 'ama@example.cm' });
    // A reset token stored for "recover" must not pass as an email-verification code.
    await t.prisma.verificationCode.updateMany({ data: { purpose: 'verify' } });

    expect((await post('/recover/confirm', { token: tokenFor('ama@example.cm'), password: 'new password' })).status).toBe(
      400,
    );
  });

  it('limits reset emails to 3 per hour per address', async () => {
    await createUser();
    for (let i = 0; i < 3; i++) expect((await post('/recover', { email: 'ama@example.cm' })).status).toBe(202);

    const res = await post('/recover', { email: 'ama@example.cm' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
