import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

/** Settings shared by the server, the tests, and the OpenAPI generator. */
export function configureApp(app: NestFastifyApplication): NestFastifyApplication {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
