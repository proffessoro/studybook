import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type ApiErrorBody, ErrorCode } from '@studybook/shared';
import { env } from '../config/env.js';
import { SESSION_COOKIE } from './sessions.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestOrigin(request: FastifyRequest): string | undefined {
  const { origin, referer } = request.headers;
  if (origin) return origin;
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

/**
 * CSRF protection for cookie sessions (design §8). Besides `SameSite=Lax`, a
 * request that changes something must come from the web app's own origin.
 * Browsers always send `Origin` on such requests, so:
 * - a foreign `Origin` is refused, which also stops login CSRF;
 * - no `Origin` is fine for non-browser clients, unless the request carries the session cookie;
 * - `Authorization: Bearer` requests (Phase 3 app) carry no ambient credentials, so they pass.
 * The web server therefore calls the API with GET only; changes go from the browser.
 */
export function registerCsrfCheck(fastify: FastifyInstance): void {
  const allowed = new URL(env.publicUrl).origin;

  fastify.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    if (request.headers.authorization?.startsWith('Bearer ')) return;

    const origin = requestOrigin(request);
    const hasSessionCookie = request.headers.cookie?.includes(`${SESSION_COOKIE}=`) ?? false;
    if (origin === allowed || (origin === undefined && !hasSessionCookie)) return;

    const body: ApiErrorBody = { code: ErrorCode.FORBIDDEN, message: 'Cross-site request refused' };
    return reply.status(403).send(body);
  });
}
