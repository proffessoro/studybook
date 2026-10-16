import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@studybook/shared';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

async function createApp(queryRaw: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } }],
  }).compile();

  const app = configureApp(moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter()));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /api/v1/health', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns ok when the database answers', async () => {
    app = await createApp(async () => [{ '?column?': 1 }]);

    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns 503 with an error code when the database is unreachable', async () => {
    app = await createApp(async () => {
      throw new Error('connection refused');
    });

    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe(ErrorCode.INTERNAL_ERROR);
  });
});
