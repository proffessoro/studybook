import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { env } from './config/env.js';
import { HealthController } from './health/health.controller.js';
import { InstanceController } from './instance/instance.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkerModule } from './worker.module.js';

@Module({
  imports: [PrismaModule, RedisModule, AuthModule, UsersModule, ...(env.workerInProcess ? [WorkerModule] : [])],
  controllers: [HealthController, InstanceController],
})
export class AppModule {}
