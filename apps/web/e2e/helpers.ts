import { execSync } from 'node:child_process';
import path from 'node:path';
import { type APIRequestContext, expect } from '@playwright/test';

/**
 * Sign-up tests need the API, the email worker (or WORKER_IN_PROCESS=true), and
 * Mailpit from deploy/docker-compose.dev.yml, which catches the verification email.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const PASSWORD = 'correct horse';

// Playwright runs from apps/web.
const devCompose = path.resolve('../../deploy/docker-compose.dev.yml');

/**
 * The suite signs up more users from one IP than the real limits allow
 * (10 verification emails a day per IP), so test sign-ups clear the
 * rate-limit counters in the development Valkey first.
 */
export function resetRateLimits(): void {
  execSync(
    `docker compose -f "${devCompose}" exec -T valkey sh -c "valkey-cli --scan --pattern 'rl:*' | xargs -r valkey-cli del"`,
    { stdio: 'pipe' },
  );
}

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
  resetRateLimits();
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

/** The first link in the latest email to `email` whose subject matches. */
export async function emailedLink(request: APIRequestContext, email: string, subject: RegExp): Promise<string> {
  let link = '';
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
        const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
        const message = messages.find((m) => subject.test(m.Subject));
        if (!message) return '';
        const { Text } = (await (await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as { Text: string };
        link = Text.match(/https?:\/\/\S+/)?.[0] ?? '';
        return link;
      },
      { timeout: 15_000 },
    )
    .toMatch(/^https?:\/\//);
  return link;
}

/** Subjects of every email sent to `email`, newest first. */
export async function emailedSubjects(request: APIRequestContext, email: string): Promise<string[]> {
  const res = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${email}` } });
  const { messages } = (await res.json()) as { messages: { Subject: string }[] };
  return messages.map((m) => m.Subject);
}
