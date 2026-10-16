import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { InstanceController } from './instance/instance.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { WorkerModule } from './worker.module.js';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule, ...(env.workerInProcess ? [WorkerModule] : [])],
  controllers: [HealthController, InstanceController],
})
export class AppModule {}
