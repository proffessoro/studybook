import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Req, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  LoginInput,
  Me,
  ResendVerificationInput,
  SignUpInput,
  SignUpResult,
  VerifyEmailInput,
  VerifyEmailResult,
} from '@studybook/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { AuthService, toMe } from './auth.service.js';
import { sessionToken } from './session.guard.js';
import { clearSessionCookie, setSessionCookie } from './sessions.js';

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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(LoginInput)
  @ApiZodResponse(200, Me, 'Logged in; the session cookie is set')
  async login(
    @Body(new ZodValidationPipe(LoginInput)) body: z.output<typeof LoginInput>,
    @Ip() ip: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Me> {
    const { user, token } = await this.auth.login(body, ip);
    setSessionCookie(reply, token);
    return toMe(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Session ended (also fine without one)' })
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.logout(sessionToken(request));
    clearSessionCookie(reply);
  }
}
