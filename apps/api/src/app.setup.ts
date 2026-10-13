import fastifyCookie from '@fastify/cookie';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { registerCsrfCheck } from './auth/csrf.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

/** Settings shared by the server, the tests, and the OpenAPI generator. */
export function configureApp(app: NestFastifyApplication): NestFastifyApplication {
  const fastify = app.getHttpAdapter().getInstance();
  void fastify.register(fastifyCookie);
  registerCsrfCheck(fastify);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
