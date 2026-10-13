import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthController } from './health/health.controller.js';
import { InstanceController } from './instance/instance.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, InstanceController],
})
export class AppModule {}
