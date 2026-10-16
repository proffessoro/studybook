import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Me } from '@studybook/shared';
import type { User } from '../generated/prisma/client.js';
import { ApiZodResponse } from '../openapi/zod-openapi.js';
import { toMe } from './auth.service.js';
import { CurrentUser, SessionGuard } from './session.guard.js';

@ApiTags('auth')
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  @ApiZodResponse(200, Me, 'The logged-in user')
  me(@CurrentUser() user: User): Me {
    return toMe(user);
  }
}
