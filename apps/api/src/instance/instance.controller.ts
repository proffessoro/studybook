import { Controller, Get } from '@nestjs/common';
import type { InstanceInfo } from '@studybook/shared';

@Controller('instance')
export class InstanceController {
  /** Lets clients (and the Phase 3 app) check that a server address is a Studybook instance. */
  @Get()
  info(): InstanceInfo {
    return {
      name: process.env.INSTANCE_NAME ?? 'Studybook',
      version: process.env.APP_VERSION ?? '0.0.0',
      features: {
        googleLogin: Boolean(process.env.GOOGLE_CLIENT_ID),
        catalogue: true,
      },
    };
  }
}
