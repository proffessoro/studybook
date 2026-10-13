import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import * as oidc from 'openid-client';
import type { z } from 'zod';
import { type CompleteGoogleSignupInput, ErrorCode, type GoogleSignupDraft, PRIVACY_POLICY_VERSION } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';
import { REDIS } from '../redis/redis.module.js';
import { releaseStalePending, throwIfTaken } from './auth.service.js';
import { Sessions } from './sessions.js';

/** How long a visitor has to come back from Google, and to finish a new Google sign-up. */
const STATE_TTL_SECONDS = 10 * 60;
const DRAFT_TTL_SECONDS = 30 * 60;

type PendingLogin = { verifier: string; nonce: string; next: string };
type Draft = GoogleSignupDraft & { sub: string };

export type GoogleOutcome =
  | { kind: 'session'; token: string; next: string }
  | { kind: 'signup'; draftId: string; next: string }
  | { kind: 'error'; reason: 'failed' | 'suspended' };

export function googleRedirectUri(): string {
  return `${env.publicUrl}/api/v1/auth/google/callback`;
}

/**
 * Google login with OpenID Connect, authorization code + PKCE (design §5.6, ACC-04).
 * Optional per instance: on only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private configuration?: Promise<oidc.Configuration>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: Sessions,
    private readonly rateLimiter: RateLimiter,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Where to send the browser, and the state to bind to it in a cookie. */
  async start(next: string): Promise<{ url: string; state: string }> {
    const config = await this.config();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const pending: PendingLogin = { verifier, nonce, next };
    await this.redis.set(`oauth:google:${state}`, JSON.stringify(pending), 'EX', STATE_TTL_SECONDS);

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: googleRedirectUri(),
      scope: 'openid email profile',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
      prompt: 'select_account',
    });
    return { url: url.href, state };
  }

  /**
   * Back from Google. `cookieState` must match the state in the URL, so an
   * attacker can't finish a login they started in the victim's browser.
   */
  async finish(query: string, cookieState: string | undefined): Promise<GoogleOutcome> {
    const state = new URLSearchParams(query).get('state');
    if (!state || state !== cookieState) return { kind: 'error', reason: 'failed' };
    const stored = await this.redis.getdel(`oauth:google:${state}`);
    if (!stored) return { kind: 'error', reason: 'failed' };
    const pending = JSON.parse(stored) as PendingLogin;

    let claims: oidc.IDToken | undefined;
    try {
      const callbackUrl = new URL(googleRedirectUri());
      callbackUrl.search = query;
      const tokens = await oidc.authorizationCodeGrant(await this.config(), callbackUrl, {
        pkceCodeVerifier: pending.verifier,
        expectedState: state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch (error) {
      this.logger.warn(`Google login failed: ${(error as Error).message}`);
      return { kind: 'error', reason: 'failed' };
    }
    const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : undefined;
    if (!claims || !email || claims.email_verified !== true) return { kind: 'error', reason: 'failed' };

    return this.resolve({ sub: claims.sub, email, fullName: typeof claims.name === 'string' ? claims.name : '' }, pending.next);
  }

  /** The new Google user's details, to prefill the last sign-up step. */
  async draft(draftId: string | undefined): Promise<GoogleSignupDraft> {
    const draft = await this.loadDraft(draftId);
    return { email: draft.email, fullName: draft.fullName };
  }

  /** ACC-04: a new Google user chooses a pseudo and enters a phone number; the account is then active. */
  async complete(
    draftId: string | undefined,
    input: z.output<typeof CompleteGoogleSignupInput>,
    ip: string,
  ): Promise<{ user: User; token: string }> {
    await this.rateLimiter.consume({ key: `google-signup:ip:${ip}`, max: 20, windowSeconds: 3600 });
    const draft = await this.loadDraft(draftId);
    const unique = { email: draft.email, pseudo: input.pseudo, phone: input.phone };

    const user = await this.prisma.$transaction(async (tx) => {
      await releaseStalePending(tx, unique);
      await throwIfTaken(tx, unique);
      return tx.user.create({
        data: {
          fullName: input.fullName,
          pseudo: input.pseudo,
          email: draft.email,
          phone: input.phone,
          locale: input.locale,
          status: 'active',
          // Google already counts as email verification (ACC-04).
          emailVerifiedAt: new Date(),
          privacyAcceptedAt: new Date(),
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          oauthAccounts: { create: { provider: 'google', providerUserId: draft.sub } },
        },
      });
    });

    await this.redis.del(`oauth:google-signup:${draftId}`);
    return { user, token: await this.sessions.create(user.id, 'web') };
  }

  private async resolve(google: Draft, next: string): Promise<GoogleOutcome> {
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: google.sub } },
      include: { user: true },
    });
    if (linked) return this.sessionFor(linked.user, next);

    const byEmail = await this.prisma.user.findUnique({ where: { email: google.email } });
    if (byEmail?.emailVerifiedAt && byEmail.status !== 'pending') {
      // ACC-04: the Google email matches an account, so it logs into that account.
      await this.prisma.oAuthAccount.create({ data: { userId: byEmail.id, provider: 'google', providerUserId: google.sub } });
      return this.sessionFor(byEmail, next);
    }
    if (byEmail) {
      // An unverified sign-up with this email: whoever made it knows its password,
      // so it must not become the Google user's account. Google proves the real owner.
      await this.prisma.user.delete({ where: { id: byEmail.id } });
    }

    const draftId = randomBytes(24).toString('base64url');
    await this.redis.set(`oauth:google-signup:${draftId}`, JSON.stringify(google), 'EX', DRAFT_TTL_SECONDS);
    return { kind: 'signup', draftId, next };
  }

  private async sessionFor(user: User, next: string): Promise<GoogleOutcome> {
    if (user.status === 'suspended') return { kind: 'error', reason: 'suspended' };
    if (user.status !== 'active') return { kind: 'error', reason: 'failed' };
    return { kind: 'session', token: await this.sessions.create(user.id, 'web'), next };
  }

  private async loadDraft(draftId: string | undefined): Promise<Draft> {
    const stored = draftId ? await this.redis.get(`oauth:google-signup:${draftId}`) : null;
    if (!stored) {
      throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.GOOGLE_SIGNUP_EXPIRED, 'Start again with Google');
    }
    return JSON.parse(stored) as Draft;
  }

  private config(): Promise<oidc.Configuration> {
    const google = env.google;
    if (!google.enabled) throw new ApiError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Google login is off');
    this.configuration ??= oidc
      .discovery(
        new URL(google.issuer),
        google.clientId,
        google.clientSecret,
        undefined,
        // Only the test provider is plain HTTP; production always talks to Google over HTTPS.
        !env.isProduction && google.issuer.startsWith('http:') ? { execute: [oidc.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        this.configuration = undefined;
        throw error;
      });
    return this.configuration;
  }
}
