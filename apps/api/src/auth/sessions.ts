import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import type { SessionClient, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A session ends 30 days after it was last used. */
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
/** How often a used session pushes its expiry back (and the cookie is renewed). */
const REFRESH_AFTER_MS = 24 * 3600 * 1000;

/**
 * `__Host-` makes browsers refuse the cookie unless it is Secure, for path `/`,
 * and without a Domain, so no subdomain can set or read it. Needs HTTPS, so not in development.
 */
export const SESSION_COOKIE = env.isProduction ? '__Host-sb_session' : 'sb_session';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/' });
}

/** Opaque session tokens (design §5.6). Only their hash is stored, so a database leak gives no usable sessions. */
@Injectable()
export class Sessions {
  constructor(private readonly prisma: PrismaService) {}

  /** Starts a session and returns its token, to hand to the client once. */
  async create(userId: string, client: SessionClient): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId, client, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return token;
  }

  /**
   * The active user behind a token, or null. `refreshed` is true when the
   * expiry moved, so a cookie client should get the cookie again.
   */
  async resolve(token: string): Promise<{ user: User; refreshed: boolean } | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now) return null;
    if (session.user.status !== 'active') return null;

    const refreshed = now - session.lastSeenAt.getTime() > REFRESH_AFTER_MS;
    if (refreshed) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) },
      });
    }
    return { user: session.user, refreshed };
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}
