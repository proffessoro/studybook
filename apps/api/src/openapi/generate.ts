import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { buildOpenApiDocument } from './document.js';

/** Writes the OpenAPI spec to the path given as argument. Needs no database: nothing connects until a query runs. */
const [outFile] = process.argv.slice(2);
if (!outFile) throw new Error('Usage: node dist/openapi/generate.js <out.json>');

const app = configureApp(
  await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false }),
);
await app.init();
await writeFile(outFile, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
