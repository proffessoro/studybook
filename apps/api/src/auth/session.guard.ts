import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { User } from '../generated/prisma/client.js';
import { SESSION_COOKIE, Sessions, setSessionCookie } from './sessions.js';

type AuthedRequest = FastifyRequest & { user?: User };

/** The session token from the cookie (web) or the `Authorization: Bearer` header (Phase 3 app). */
export function sessionToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || undefined;
  return request.cookies[SESSION_COOKIE] || undefined;
}

/** Lets a request through only with a valid session, and puts its user on the request. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: Sessions) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthedRequest>();
    const token = sessionToken(request);
    const resolved = token ? await this.sessions.resolve(token) : null;
    if (!token || !resolved) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, 'Log in first');
    }

    request.user = resolved.user;
    // Keep the browser's cookie in step with the extended expiry.
    if (resolved.refreshed && !request.headers.authorization) setSessionCookie(http.getResponse<FastifyReply>(), token);
    return true;
  }
}

/** The logged-in user. Only for handlers behind `SessionGuard`. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new Error('CurrentUser used without SessionGuard');
  return user;
});
