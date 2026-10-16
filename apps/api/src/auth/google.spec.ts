import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type FakeGoogleUser, startFakeGoogle } from '../testing/fake-oidc.js';
import { createTestApp } from '../testing/test-app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const ORIGIN = 'http://localhost:3000';
const cookiesOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []);
const cookieValue = (res: request.Response, name: string) =>
  cookiesOf(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0];

const googleUser = (over: Partial<FakeGoogleUser> = {}): FakeGoogleUser => ({
  sub: 'google-sub-1',
  email: 'ama@gmail.com',
  email_verified: true,
  name: 'Ama Kouam',
  ...over,
});

describe('Google login (ACC-04)', () => {
  let t: TestApp;
  let fake: Awaited<ReturnType<typeof startFakeGoogle>>;
  const server = () => t.app.getHttpServer();

  /** Clicks "Continue with Google", approves on the fake Google, and follows the redirect back. */
  async function loginWithGoogle(user: FakeGoogleUser, { next, cookie }: { next?: string; cookie?: string } = {}) {
    const start = await request(server()).get(`/api/v1/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`);
    const callbackPath = fake.approve(start.headers.location!, user);
    const back = await request(server())
      .get(callbackPath)
      .set('cookie', cookie ?? cookieValue(start, 'sb_google_state') ?? '');
    return { start, back, callbackPath, stateCookie: cookieValue(start, 'sb_google_state') };
  }

  async function finishSignup(back: request.Response, body: object = {}) {
    return request(server())
      .post('/api/v1/auth/google/signup')
      .set('origin', ORIGIN)
      .set('cookie', cookieValue(back, 'sb_google_signup') ?? '')
      .send({ fullName: 'Ama Kouam', pseudo: 'ama', phone: '677123456', locale: 'fr', acceptPrivacy: true, ...body });
  }

  beforeAll(async () => {
    fake = await startFakeGoogle('test-client');
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_ISSUER = fake.issuer;
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.reset();
  });

  afterAll(async () => {
    await t.app.close();
    await fake.close();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_ISSUER;
  });

  it('sends the browser to Google with PKCE, state, and nonce', async () => {
    const res = await request(server()).get('/api/v1/auth/google');

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location!);
    expect(url.origin + url.pathname).toBe(`${fake.issuer}/authorize`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/google/callback');
    expect(url.searchParams.get('nonce')).toBeTruthy();
    const stateCookie = cookiesOf(res).find((c) => c.startsWith('sb_google_state='))!;
    expect(stateCookie).toContain(url.searchParams.get('state')!);
    expect(stateCookie).toMatch(/HttpOnly/i);
    expect(stateCookie).toMatch(/Path=\/api\/v1\/auth\/google/);
  });

  it('a new Google user picks a pseudo and phone, then is logged in', async () => {
    const { back } = await loginWithGoogle(googleUser(), { next: '/profile' });
    expect(back.status).toBe(302);
    expect(back.headers.location).toBe('http://localhost:3000/signup/google?next=%2Fprofile');
    expect(cookieValue(back, 'sb_session')).toBeUndefined();

    const draft = await request(server())
      .get('/api/v1/auth/google/signup')
      .set('cookie', cookieValue(back, 'sb_google_signup')!);
    expect(draft.body).toEqual({ email: 'ama@gmail.com', fullName: 'Ama Kouam' });

    const done = await finishSignup(back);

    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ email: 'ama@gmail.com', pseudo: 'ama', phone: '+237677123456' });
    const session = cookieValue(done, 'sb_session')!;
    expect((await request(server()).get('/api/v1/me').set('cookie', session)).status).toBe(200);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ama@gmail.com' }, include: { oauthAccounts: true } });
    expect(user).toMatchObject({ status: 'active', passwordHash: null, privacyPolicyVersion: expect.any(String) });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.oauthAccounts).toMatchObject([{ provider: 'google', providerUserId: 'google-sub-1' }]);
  });

  it('logs into an existing account with the same email, and links it', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Ama', pseudo: 'ama', email: 'ama@gmail.com', passwordHash: await hash('pw'), status: 'active', emailVerifiedAt: new Date() },
    });

    const { back } = await loginWithGoogle(googleUser(), { next: '/profile' });

    expect(back.headers.location).toBe('http://localhost:3000/profile');
    expect(cookieValue(back, 'sb_session')).toBeDefined();
    expect(await t.prisma.oAuthAccount.count()).toBe(1);
  });

  it('keeps logging into the linked account after the Google email changes', async () => {
    const { back } = await loginWithGoogle(googleUser());
    await finishSignup(back);

    const again = await loginWithGoogle(googleUser({ email: 'ama.new@gmail.com' }));

    expect(again.back.headers.location).toBe('http://localhost:3000/');
    expect(cookieValue(again.back, 'sb_session')).toBeDefined();
    expect(await t.prisma.user.count()).toBe(1);
  });

  it('replaces an unverified sign-up with the same email instead of logging into it', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Squatter', pseudo: 'squat', email: 'ama@gmail.com', passwordHash: await hash('known to squatter'), status: 'pending' },
    });

    const { back } = await loginWithGoogle(googleUser());

    expect(back.headers.location).toMatch(/\/signup\/google/);
    expect(await t.prisma.user.count()).toBe(0);
  });

  it('refuses a Google email that Google has not verified', async () => {
    const { back } = await loginWithGoogle(googleUser({ email_verified: false }));
    expect(back.headers.location).toBe('http://localhost:3000/login?error=google-failed');
  });

  it('refuses a callback without the matching state cookie (login CSRF)', async () => {
    const { back } = await loginWithGoogle(googleUser(), { cookie: 'sb_google_state=someone-elses-state' });
    expect(back.headers.location).toBe('http://localhost:3000/login?error=google-failed');
    expect(cookieValue(back, 'sb_session')).toBeUndefined();
  });

  it('refuses to use the same callback twice', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Ama', pseudo: 'ama', email: 'ama@gmail.com', status: 'active', emailVerifiedAt: new Date() },
    });
    const { callbackPath, stateCookie } = await loginWithGoogle(googleUser());

    const replay = await request(server()).get(callbackPath).set('cookie', stateCookie!);

    expect(replay.headers.location).toBe('http://localhost:3000/login?error=google-failed');
  });

  it('tells a suspended user so', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Ama', pseudo: 'ama', email: 'ama@gmail.com', status: 'suspended', emailVerifiedAt: new Date() },
    });
    const { back } = await loginWithGoogle(googleUser());
    expect(back.headers.location).toBe('http://localhost:3000/login?error=google-suspended');
  });

  it('keeps the return address inside the site', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Ama', pseudo: 'ama', email: 'ama@gmail.com', status: 'active', emailVerifiedAt: new Date() },
    });
    const { back } = await loginWithGoogle(googleUser(), { next: '//evil.example/steal' });
    expect(back.headers.location).toBe('http://localhost:3000/');
  });

  it('checks the last step like a normal sign-up', async () => {
    await t.prisma.user.create({
      data: { fullName: 'Other', pseudo: 'ama', email: 'other@example.cm', status: 'active', emailVerifiedAt: new Date() },
    });
    const { back } = await loginWithGoogle(googleUser());

    const taken = await finishSignup(back);
    expect(taken.body.details.fields).toEqual({ pseudo: ['taken'] });

    const noConsent = await finishSignup(back, { pseudo: 'ama2', acceptPrivacy: false });
    expect(noConsent.body.details.fields).toEqual({ acceptPrivacy: ['invalid_value'] });
  });

  it('asks to start again when the sign-up step has expired', async () => {
    const res = await request(server())
      .post('/api/v1/auth/google/signup')
      .set('origin', ORIGIN)
      .send({ fullName: 'Ama Kouam', pseudo: 'ama', phone: '677123456', locale: 'fr', acceptPrivacy: true });
    expect(res.body.code).toBe('GOOGLE_SIGNUP_EXPIRED');
  });

  it('reports Google login as available on this instance', async () => {
    expect((await request(server()).get('/api/v1/instance')).body.features.googleLogin).toBe(true);
  });
});

describe('Google login when the instance has not configured it', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('is off', async () => {
    expect((await request(t.app.getHttpServer()).get('/api/v1/instance')).body.features.googleLogin).toBe(false);
    const res = await request(t.app.getHttpServer()).get('/api/v1/auth/google');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
