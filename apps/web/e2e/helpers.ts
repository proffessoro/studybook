import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Sign-up tests need the API, the email worker (or WORKER_IN_PROCESS=true), and
 * Mailpit from deploy/docker-compose.dev.yml, which catches the verification email.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'correct horse';

/** Random values, so parallel tests and earlier runs don't collide. Test users end in @e2e.test. */
export function uniqueUser() {
  const n = `${Math.floor(Math.random() * 1e8)}`.padStart(8, '0');
  return {
    email: `e2e-${n}@e2e.test`,
    pseudo: `e2e${n}`,
    // A valid Cameroon mobile number
    phone: `6${n.padStart(8, '0')}`,
  };
}

export async function emailedCode(request: APIRequestContext, email: string): Promise<string> {
  let code = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
        const { messages } = (await res.json()) as { messages: { Subject: string }[] };
        code = messages[0]?.Subject.match(/\d{6}/)?.[0] ?? '';
        return code;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

/** Signs up through the API and, unless told otherwise, verifies the email. */
export async function createUser(request: APIRequestContext, { verified = true } = {}) {
  const user = uniqueUser();
  const res = await request.post('/api/v1/auth/signup', {
    data: { fullName: 'Test E2E', ...user, password: PASSWORD, locale: 'fr', acceptPrivacy: true },
  });
  expect(res.status()).toBe(201);
  const code = await emailedCode(request, user.email);
  if (verified) {
    expect((await request.post('/api/v1/auth/verify-email', { data: { email: user.email, code } })).status()).toBe(200);
  }
  return { ...user, code };
}
