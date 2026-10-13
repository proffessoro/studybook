import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorBody } from '@studybook/shared';
import { schemaRef, zodComponents } from './zod-openapi.js';

const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;

/** The OpenAPI spec (NFR-11). `packages/api-client` is generated from it. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Studybook API')
    .setVersion(process.env.APP_VERSION ?? '0.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...(zodComponents() as OpenAPIObject['components']) },
  } as OpenAPIObject['components'];

  // Every operation can fail with the standard error body.
  for (const pathItem of Object.values(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.responses.default ??= {
        description: 'Error',
        content: { 'application/json': { schema: schemaRef(ApiErrorBody) } },
      };
    }
  }

  return document;
}
