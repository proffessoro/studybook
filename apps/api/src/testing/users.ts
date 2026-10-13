import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hash } from 'argon2';
import request from 'supertest';
import type { PrismaService } from '../prisma/prisma.service.js';

export const ORIGIN = 'http://localhost:3000';
export const TEST_PASSWORD = 'correct horse';

let hashed: Promise<string> | undefined;
let counter = 0;

/** An active, verified user. Hashing once keeps tests fast. */
export async function createActiveUser(prisma: PrismaService, name?: string) {
  const n = ++counter;
  name ??= `user${n}`;
  return prisma.user.create({
    data: {
      fullName: `${name} Full Name`,
      pseudo: name,
      email: `${name}@example.cm`,
      phone: `+2376${String(10_000_000 + n).slice(-8)}`,
      passwordHash: await (hashed ??= hash(TEST_PASSWORD)),
      status: 'active',
      emailVerifiedAt: new Date(),
    },
  });
}

/** Logs in through the API and returns helpers that send that session's cookie and the app's Origin. */
export async function loginAs(app: NestFastifyApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('origin', ORIGIN)
    .send({ email, password: TEST_PASSWORD });
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sb_session='));
  if (!cookie) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);

  const server = app.getHttpServer();
  const as = (r: request.Test) => r.set('cookie', cookie).set('origin', ORIGIN);
  return {
    get: (path: string) => as(request(server).get(`/api/v1${path}`)),
    post: (path: string, body: object = {}) => as(request(server).post(`/api/v1${path}`)).send(body),
    patch: (path: string, body: object = {}) => as(request(server).patch(`/api/v1${path}`)).send(body),
    put: (path: string, body: object = {}) => as(request(server).put(`/api/v1${path}`)).send(body),
    delete: (path: string, body: object = {}) => as(request(server).delete(`/api/v1${path}`)).send(body),
  };
}

export type Client = Awaited<ReturnType<typeof loginAs>>;
