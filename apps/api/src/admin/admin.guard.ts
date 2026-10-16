import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ErrorCode } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import type { User } from '../generated/prisma/client.js';

/** Instance admin only (OPS-06). Runs after `SessionGuard`, which sits on the controller class. */
@Injectable()
export class InstanceAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<FastifyRequest & { user?: User }>().user;
    if (!user) throw new Error('InstanceAdminGuard ran before SessionGuard');
    if (!user.isInstanceAdmin) throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Instance admins only');
    return true;
  }
}
