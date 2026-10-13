import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  ResendVerificationInput,
  SignUpInput,
  SignUpResult,
  VerifyEmailInput,
  VerifyEmailResult,
} from '@studybook/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiZodBody(SignUpInput)
  @ApiZodResponse(201, SignUpResult, 'Account created; a verification code was emailed')
  signUp(
    @Body(new ZodValidationPipe(SignUpInput)) body: z.output<typeof SignUpInput>,
    @Ip() ip: string,
  ): Promise<SignUpResult> {
    return this.auth.signUp(body, ip);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(VerifyEmailInput)
  @ApiZodResponse(200, VerifyEmailResult, 'Email verified, account active')
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailInput)) body: z.output<typeof VerifyEmailInput>,
    @Ip() ip: string,
  ): Promise<VerifyEmailResult> {
    await this.auth.verifyEmail(body, ip);
    return { status: 'verified' };
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiZodBody(ResendVerificationInput)
  @ApiResponse({ status: 202, description: 'A new code was sent if the address has a pending account' })
  async resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationInput)) body: z.output<typeof ResendVerificationInput>,
    @Ip() ip: string,
  ): Promise<void> {
    await this.auth.resendVerification(body, ip);
  }
}
