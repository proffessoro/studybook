import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const signUpBody = {
  fullName: 'Ama Kouam',
  pseudo: 'Ama_K',
  email: 'Ama@Example.cm',
  phone: '6 77 12 34 56',
  password: 'correct horse',
  locale: 'en',
  acceptPrivacy: true,
};

describe('sign-up and email verification (ACC-01)', () => {
  let t: TestApp;
  const post = (path: string, body: object) => request(t.app.getHttpServer()).post(`/api/v1/auth${path}`).send(body);
  const codeFor = (email: string) => t.outbox.last(email, 'verify-email')?.data.code ?? '';

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('POST /auth/signup', () => {
    it('creates a pending user and emails a code in their language', async () => {
      const res = await post('/signup', signUpBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ email: 'ama@example.cm' });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ama@example.cm' } });
      expect(user).toMatchObject({
        status: 'pending',
        emailVerifiedAt: null,
        phone: '+237677123456',
        phoneVerifiedAt: null,
        locale: 'en',
        privacyPolicyVersion: expect.any(String),
      });
      expect(user.privacyAcceptedAt).toBeInstanceOf(Date);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);

      const email = t.outbox.last('ama@example.cm', 'verify-email');
      expect(email).toMatchObject({ locale: 'en', template: 'verify-email', data: { pseudo: 'Ama_K' } });
      expect(email?.data.code).toMatch(/^\d{6}$/);
      expect(email?.data.link).toBe(
        `http://localhost:3000/verify-email?email=ama%40example.cm&code=${email?.data.code}`,
      );
    });

    it('never stores the code in clear', async () => {
      await post('/signup', signUpBody);
      const stored = await t.prisma.verificationCode.findFirstOrThrow();
      expect(stored.codeHash).not.toContain(codeFor('ama@example.cm'));
      expect(stored.codeHash).toHaveLength(64);
    });

    it('reports invalid fields', async () => {
      const res = await post('/signup', { ...signUpBody, phone: '12', acceptPrivacy: false, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields).sort()).toEqual(['acceptPrivacy', 'password', 'phone']);
      expect(await t.prisma.user.count()).toBe(0);
    });

    it('reports every value already used by an active account, ignoring case', async () => {
      await post('/signup', signUpBody);
      await post('/verify-email', { email: signUpBody.email, code: codeFor('ama@example.cm') });

      const res = await post('/signup', { ...signUpBody, email: 'AMA@example.cm', pseudo: 'ama_k' });

      expect(res.status).toBe(400);
      expect(res.body.details.fields).toEqual({ email: ['taken'], pseudo: ['taken'], phone: ['taken'] });
    });

    it('lets a new sign-up replace an unverified one with the same email', async () => {
      await post('/signup', signUpBody);
      const res = await post('/signup', { ...signUpBody, pseudo: 'ama2', phone: '699000000' });

      expect(res.status).toBe(201);
      const users = await t.prisma.user.findMany();
      expect(users.map((u) => u.pseudo)).toEqual(['ama2']);
    });

    it('keeps the pseudo of a recent unverified sign-up reserved', async () => {
      await post('/signup', signUpBody);
      const res = await post('/signup', { ...signUpBody, email: 'other@example.cm', phone: '699000000' });

      expect(res.status).toBe(400);
      expect(res.body.details.fields).toEqual({ pseudo: ['taken'] });
    });

    it('releases the pseudo and phone of an unverified sign-up after 24 hours', async () => {
      await post('/signup', signUpBody);
      await t.prisma.user.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });

      const res = await post('/signup', { ...signUpBody, email: 'other@example.cm' });

      expect(res.status).toBe(201);
      expect(await t.prisma.user.count()).toBe(1);
    });

    it('limits verification emails to 3 per hour per address', async () => {
      for (let i = 0; i < 3; i++) expect((await post('/signup', signUpBody)).status).toBe(201);

      const res = await post('/signup', signUpBody);

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.body.details.retryAfterSeconds).toBeGreaterThan(3500);
    });
  });

  describe('POST /auth/verify-email', () => {
    beforeEach(async () => {
      await post('/signup', signUpBody);
    });

    it('activates the account with the emailed code', async () => {
      const res = await post('/verify-email', { email: 'ama@example.cm', code: codeFor('ama@example.cm') });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'verified' });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ama@example.cm' } });
      expect(user.status).toBe('active');
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('accepts the link twice (e.g. opened on two devices)', async () => {
      const body = { email: 'ama@example.cm', code: codeFor('ama@example.cm') };
      await post('/verify-email', body);
      expect((await post('/verify-email', body)).status).toBe(200);
    });

    it('rejects a wrong code', async () => {
      const wrong = codeFor('ama@example.cm') === '000000' ? '111111' : '000000';
      const res = await post('/verify-email', { email: 'ama@example.cm', code: wrong });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VERIFICATION_CODE_INVALID');
    });

    it('gives the same answer for an unknown email', async () => {
      const res = await post('/verify-email', { email: 'nobody@example.cm', code: '123456' });
      expect(res.body.code).toBe('VERIFICATION_CODE_INVALID');
    });

    it('stops accepting the code after 5 wrong attempts', async () => {
      const code = codeFor('ama@example.cm');
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) await post('/verify-email', { email: 'ama@example.cm', code: wrong });

      const res = await post('/verify-email', { email: 'ama@example.cm', code });

      expect(res.body.code).toBe('VERIFICATION_CODE_EXPIRED');
    });

    it('rejects an expired code', async () => {
      await t.prisma.verificationCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await post('/verify-email', { email: 'ama@example.cm', code: codeFor('ama@example.cm') });

      expect(res.body.code).toBe('VERIFICATION_CODE_EXPIRED');
    });
  });

  describe('POST /auth/verify-email/resend', () => {
    it('sends a new code and voids the old one', async () => {
      await post('/signup', signUpBody);
      const oldCode = codeFor('ama@example.cm');

      expect((await post('/verify-email/resend', { email: 'ama@example.cm' })).status).toBe(202);
      const newCode = codeFor('ama@example.cm');

      if (oldCode !== newCode) {
        expect((await post('/verify-email', { email: 'ama@example.cm', code: oldCode })).status).toBe(400);
      }
      expect((await post('/verify-email', { email: 'ama@example.cm', code: newCode })).status).toBe(200);
    });

    it('answers the same for an unknown address without sending anything', async () => {
      const res = await post('/verify-email/resend', { email: 'nobody@example.cm' });

      expect(res.status).toBe(202);
      expect(t.outbox.sent).toHaveLength(0);
    });
  });
});
