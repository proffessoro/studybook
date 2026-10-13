import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './openapi/document.js';

const app = configureApp(await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: env.trustProxy })));
app.enableShutdownHooks();

SwaggerModule.setup('api/v1/docs', app, buildOpenApiDocument(app), {
  jsonDocumentUrl: 'api/v1/openapi.json',
});

await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
