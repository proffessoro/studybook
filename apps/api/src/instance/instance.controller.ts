import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InstanceInfo } from '@studybook/shared';
import { env } from '../config/env.js';
import { ApiZodResponse } from '../openapi/zod-openapi.js';

@ApiTags('instance')
@Controller('instance')
export class InstanceController {
  /** Lets clients (and the Phase 3 app) check that a server address is a Studybook instance. */
  @Get()
  @ApiZodResponse(200, InstanceInfo, 'Instance name, version, and enabled features')
  info(): InstanceInfo {
    return {
      name: process.env.INSTANCE_NAME ?? 'Studybook',
      version: process.env.APP_VERSION ?? '0.0.0',
      features: {
        googleLogin: env.google.enabled,
        catalogue: true,
      },
    };
  }
}
