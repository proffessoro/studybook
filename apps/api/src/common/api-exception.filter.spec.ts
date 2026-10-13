import { Body, Controller, Get, HttpStatus, NotFoundException, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiErrorBody, ErrorCode } from '@studybook/shared';
import { configureApp } from '../app.setup.js';
import { ApiError } from './api-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const Input = z.object({
  email: z.email(),
  pseudo: z
    .string()
    .min(3)
    .refine((p) => p !== 'taken', { params: { code: 'pseudo_taken' } }),
});

@Controller('test')
class TestController {
  @Get('api-error')
  apiError() {
    throw new ApiError(HttpStatus.CONFLICT, ErrorCode.GROUP_FULL, 'Group is full', { memberCap: 2 });
  }

  @Get('nest-error')
  nestError() {
    throw new NotFoundException('No such thing');
  }

  @Get('crash')
  crash() {
    throw new Error('secret connection string in message');
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(Input)) body: z.infer<typeof Input>) {
    return body;
  }
}

describe('error responses', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [TestController] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`);

  it('sends an ApiError as-is', async () => {
    const res = await get('/test/api-error');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'GROUP_FULL', message: 'Group is full', details: { memberCap: 2 } });
  });

  it('maps Nest exceptions to a code by status', async () => {
    const res = await get('/test/nest-error');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'No such thing' });
  });

  it('answers unknown routes with NOT_FOUND', async () => {
    const res = await get('/nowhere');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('hides the message of unexpected errors', async () => {
    const res = await get('/test/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  it('reports invalid fields with codes clients can translate', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/validate')
      .send({ email: 'not-an-email', pseudo: 'taken' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Invalid input',
      details: { fields: { email: ['invalid_format'], pseudo: ['pseudo_taken'] } },
    });
  });

  it('passes parsed input through when valid', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/validate')
      .send({ email: 'ama@example.cm', pseudo: 'ama', extra: 'dropped' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ email: 'ama@example.cm', pseudo: 'ama' });
  });

  it('rejects malformed JSON with the standard body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/test/validate')
      .set('content-type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(ApiErrorBody.safeParse(res.body).success).toBe(true);
  });
});
