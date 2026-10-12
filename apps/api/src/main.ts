import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
app.setGlobalPrefix('api/v1');
app.enableShutdownHooks();

await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
