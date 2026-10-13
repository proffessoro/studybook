import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const ORIGIN = 'http://localhost:3000';
const password = 'correct horse';

describe('login, sessions, and logout (ACC-03)', () => {
  let t: TestApp;
  const server = () => t.app.getHttpServer();
  const login = (email: string, pw = password) =>
    request(server()).post('/api/v1/auth/login').set('origin', ORIGIN).send({ email, password: pw });
  const sessionCookie = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='));

  async function createUser(overrides: { status?: 'pending' | 'active' | 'suspended'; email?: string } = {}) {
    const status = overrides.status ?? 'active';
    return t.prisma.user.create({
      data: {
        fullName: 'Ama Kouam',
        pseudo: `ama${Math.random().toString(36).slice(2, 8)}`,
        email: overrides.email ?? 'ama@example.cm',
        phone: null,
        passwordHash: await hash(password),
        status,
        emailVerifiedAt: status === 'pending' ? null : new Date(),
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

  it('logs in and sets an httpOnly, SameSite=Lax session cookie', async () => {
    await createUser();

    const res = await login('AMA@example.cm');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'ama@example.cm', fullName: 'Ama Kouam' });
    expect(res.body).not.toHaveProperty('passwordHash');
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it('stores only a hash of the session token', async () => {
    await createUser();
    const token = sessionCookie(await login('ama@example.cm'))!.split(';')[0]!.split('=')[1]!;

    const session = await t.prisma.session.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toHaveLength(64);
  });

  it('GET /me returns the user with the cookie, and 401 without', async () => {
    await createUser();
    const cookie = sessionCookie(await login('ama@example.cm'))!;

    const me = await request(server()).get('/api/v1/me').set('cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('ama@example.cm');

    const anonymous = await request(server()).get('/api/v1/me');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('UNAUTHENTICATED');
  });

  it('accepts the same token as a Bearer header (Phase 3 app)', async () => {
    await createUser();
    const token = sessionCookie(await login('ama@example.cm'))!.split(';')[0]!.split('=')[1]!;

    const me = await request(server()).get('/api/v1/me').set('authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await createUser();

    const wrongPassword = await login('ama@example.cm', 'wrong password');
    const unknownEmail = await login('nobody@example.cm');

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Wrong email or password' });
      expect(sessionCookie(res)).toBeUndefined();
    }
  });

  it('tells an unverified user to verify, but only with the right password', async () => {
    await createUser({ status: 'pending' });

    expect((await login('ama@example.cm', 'wrong password')).body.code).toBe('INVALID_CREDENTIALS');
    const res = await login('ama@example.cm');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(sessionCookie(res)).toBeUndefined();
  });

  it('refuses a suspended account', async () => {
    await createUser({ status: 'suspended' });
    expect((await login('ama@example.cm')).body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('locks the account for this IP after 5 failures, even with the right password', async () => {
    await createUser();
    for (let i = 0; i < 5; i++) expect((await login('ama@example.cm', 'wrong')).status).toBe(401);

    const res = await login('ama@example.cm');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.details.retryAfterSeconds).toBeGreaterThan(800);
  });

  it('resets the failure count after a successful login', async () => {
    await createUser();
    for (let i = 0; i < 4; i++) await login('ama@example.cm', 'wrong');
    expect((await login('ama@example.cm')).status).toBe(200);

    for (let i = 0; i < 4; i++) await login('ama@example.cm', 'wrong');
    expect((await login('ama@example.cm')).status).toBe(200);
  });

  it('logout ends the session', async () => {
    await createUser();
    const cookie = sessionCookie(await login('ama@example.cm'))!;

    const res = await request(server()).post('/api/v1/auth/logout').set('origin', ORIGIN).set('cookie', cookie);
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

    expect((await request(server()).get('/api/v1/me').set('cookie', cookie)).status).toBe(401);
    expect(await t.prisma.session.count()).toBe(0);
  });

  it('rejects an expired session', async () => {
    await createUser();
    const cookie = sessionCookie(await login('ama@example.cm'))!;
    await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await request(server()).get('/api/v1/me').set('cookie', cookie)).status).toBe(401);
  });

  it('pushes the expiry back and renews the cookie when a session is used after a day', async () => {
    await createUser();
    const cookie = sessionCookie(await login('ama@example.cm'))!;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    await t.prisma.session.updateMany({ data: { lastSeenAt: twoDaysAgo, expiresAt: new Date(Date.now() + 1000 * 60) } });

    const res = await request(server()).get('/api/v1/me').set('cookie', cookie);

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toBeDefined();
    const session = await t.prisma.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it('ends sessions when the account is suspended', async () => {
    const user = await createUser();
    const cookie = sessionCookie(await login('ama@example.cm'))!;
    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });

    expect((await request(server()).get('/api/v1/me').set('cookie', cookie)).status).toBe(401);
  });

  describe('CSRF (design §8)', () => {
    it('refuses a change from another site', async () => {
      await createUser();
      const cookie = sessionCookie(await login('ama@example.cm'))!;

      const res = await request(server())
        .post('/api/v1/auth/logout')
        .set('origin', 'https://evil.example')
        .set('cookie', cookie);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(await t.prisma.session.count()).toBe(1);
    });

    it('refuses a login from another site (login CSRF)', async () => {
      await createUser();
      const res = await request(server())
        .post('/api/v1/auth/login')
        .set('origin', 'https://evil.example')
        .send({ email: 'ama@example.cm', password });
      expect(res.status).toBe(403);
    });

    it('refuses a cookie-authenticated change with no Origin or Referer', async () => {
      await createUser();
      const cookie = sessionCookie(await login('ama@example.cm'))!;
      expect((await request(server()).post('/api/v1/auth/logout').set('cookie', cookie)).status).toBe(403);
    });

    it('accepts the Referer when Origin is missing', async () => {
      await createUser();
      const cookie = sessionCookie(await login('ama@example.cm'))!;
      const res = await request(server())
        .post('/api/v1/auth/logout')
        .set('referer', `${ORIGIN}/somewhere`)
        .set('cookie', cookie);
      expect(res.status).toBe(204);
    });
  });
});
