import { Body, Controller, Get, HttpStatus, Ip, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { CompleteGoogleSignupInput, GoogleSignupDraft, Me } from '@studybook/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { env } from '../config/env.js';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi.js';
import { toMe } from './auth.service.js';
import { GoogleAuthService } from './google.service.js';
import { setSessionCookie } from './sessions.js';

const STATE_COOKIE = 'sb_google_state';
const DRAFT_COOKIE = 'sb_google_signup';
/** Both cookies are only ever needed by these endpoints. */
const cookieOptions = { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/api/v1/auth/google' } as const;

/** A redirect target inside the web app: `/path` only. */
function safeNext(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

@ApiTags('auth')
@Controller('auth/google')
export class GoogleController {
  constructor(private readonly google: GoogleAuthService) {}

  /** The "Continue with Google" link points here. */
  @Get()
  @ApiExcludeEndpoint()
  async start(@Query('next') next: string | undefined, @Res() reply: FastifyReply): Promise<void> {
    const { url, state } = await this.google.start(safeNext(next));
    reply.setCookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60 });
    await reply.redirect(url, HttpStatus.FOUND);
  }

  /** Google sends the browser back here. Every outcome ends on a web page. */
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?') + 1) : '';
    const outcome = await this.google.finish(query, request.cookies[STATE_COOKIE]);
    reply.clearCookie(STATE_COOKIE, cookieOptions);

    switch (outcome.kind) {
      case 'session':
        setSessionCookie(reply, outcome.token);
        return reply.redirect(`${env.publicUrl}${outcome.next}`, HttpStatus.FOUND);
      case 'signup':
        reply.setCookie(DRAFT_COOKIE, outcome.draftId, { ...cookieOptions, maxAge: 30 * 60 });
        return reply.redirect(`${env.publicUrl}/signup/google?${new URLSearchParams({ next: outcome.next })}`, HttpStatus.FOUND);
      case 'error':
        return reply.redirect(`${env.publicUrl}/login?error=google-${outcome.reason}`, HttpStatus.FOUND);
    }
  }

  @Get('signup')
  @ApiZodResponse(200, GoogleSignupDraft, 'What Google told us, to prefill the form')
  draft(@Req() request: FastifyRequest): Promise<GoogleSignupDraft> {
    return this.google.draft(request.cookies[DRAFT_COOKIE]);
  }

  @Post('signup')
  @ApiZodBody(CompleteGoogleSignupInput)
  @ApiZodResponse(201, Me, 'Account created and logged in')
  async complete(
    @Body(new ZodValidationPipe(CompleteGoogleSignupInput)) body: z.output<typeof CompleteGoogleSignupInput>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Ip() ip: string,
  ): Promise<Me> {
    const { user, token } = await this.google.complete(request.cookies[DRAFT_COOKIE], body, ip);
    reply.clearCookie(DRAFT_COOKIE, cookieOptions);
    setSessionCookie(reply, token);
    return toMe(user);
  }
}
