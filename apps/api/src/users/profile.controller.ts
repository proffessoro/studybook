import { Body, Controller, HttpCode, HttpStatus, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { ChangeEmailInput, ChangeEmailResult, ConfirmEmailChangeInput, Me, UpdateProfileInput } from '@studybook/shared';
import { toMe } from '../auth/auth.service.js';
import { CurrentUser, SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { User } from '../generated/prisma/client.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { ProfileService } from './profile.service.js';

@ApiTags('profile')
@Controller('me')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Patch()
  @ApiZodBody(UpdateProfileInput)
  @ApiZodResponse(200, Me, 'The updated profile')
  async update(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(UpdateProfileInput)) body: z.output<typeof UpdateProfileInput>,
  ): Promise<Me> {
    return toMe(await this.profile.update(user, body));
  }

  @Post('email')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(ChangeEmailInput)
  @ApiZodResponse(202, ChangeEmailResult, 'A code was emailed to the new address')
  async requestEmailChange(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ChangeEmailInput)) body: z.output<typeof ChangeEmailInput>,
    @Ip() ip: string,
  ): Promise<ChangeEmailResult> {
    await this.profile.requestEmailChange(user, body, ip);
    return { newEmail: body.newEmail };
  }

  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(ConfirmEmailChangeInput)
  @ApiZodResponse(200, Me, 'The email is changed')
  async confirmEmailChange(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(ConfirmEmailChangeInput)) body: z.output<typeof ConfirmEmailChangeInput>,
  ): Promise<Me> {
    return toMe(await this.profile.confirmEmailChange(user, body));
  }
}
