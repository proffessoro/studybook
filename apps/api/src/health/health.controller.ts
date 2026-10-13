import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ErrorCode } from '@studybook/shared';
import { ApiZodResponse } from '../openapi/zod-openapi.js';
import { PrismaService } from '../prisma/prisma.service.js';

const HealthStatus = z.object({ status: z.literal('ok') }).meta({ id: 'HealthStatus' });

@ApiTags('instance')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiZodResponse(200, HealthStatus, 'The API and its database are up')
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ code: ErrorCode.INTERNAL_ERROR, message: 'Database unreachable' });
    }
    return { status: 'ok' };
  }
}
