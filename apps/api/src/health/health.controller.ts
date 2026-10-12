import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '@studybook/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ code: ErrorCode.INTERNAL_ERROR, message: 'Database unreachable' });
    }
    return { status: 'ok' };
  }
}
