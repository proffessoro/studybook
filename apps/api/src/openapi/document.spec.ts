import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { buildOpenApiDocument } from './document.js';

describe('OpenAPI document', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('describes responses with the shared Zod schemas', () => {
    const doc = buildOpenApiDocument(app);
    const instance = doc.paths['/api/v1/instance']?.get;

    expect(instance?.responses['200']).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/InstanceInfo' } } },
    });
    expect(doc.components?.schemas?.InstanceInfo).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['name', 'version', 'features']),
    });
  });

  it('gives every operation the standard error body', () => {
    const doc = buildOpenApiDocument(app);
    expect(doc.paths['/api/v1/health']?.get?.responses.default).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    });
    expect(doc.components?.schemas?.ApiError).toMatchObject({ required: expect.arrayContaining(['code', 'message']) });
  });
});
