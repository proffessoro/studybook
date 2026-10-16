import { HttpStatus, Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
import type { z } from 'zod';
import {
  ErrorCode,
  type LoginInput,
  type Me,
  PRIVACY_POLICY_VERSION,
  type RecoverInput,
  type ResetPasswordInput,
  type ResendVerificationInput,
  type SignUpInput,
  type ValidationDetails,
  type VerifyEmailInput,
} from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { env } from '../config/env.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { Outbox } from '../notify/email-job.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Limit, RateLimiter } from '../rate-limit/rate-limiter.js';
import { Sessions } from './sessions.js';
import { VerificationCodes } from './verification-codes.js';

/** An unverified sign-up stops holding its pseudo and phone after this long. */
export const PENDING_HOLD_MS = 24 * 3600 * 1000;

/**
 * Failed logins: 5 per 15 min for one account from one IP (design §5.6), and
 * 20 per 15 min from one IP across accounts. Per account *and* IP, so a
 * stranger can't lock someone out of their own account.
 */
function loginLimits(email: string, ip: string): Limit[] {
  return [
    { key: `login-fail:acct:${email}:${ip}`, max: 5, windowSeconds: 900 },
    { key: `login-fail:ip:${ip}`, max: 20, windowSeconds: 900 },
  ];
}

/** Reset emails: same budget as verification emails, counted separately. */
function recoverLimits(email: string, ip: string): Limit[] {
  return [
    { key: `recover-email:addr:${email}`, max: 3, windowSeconds: 3600 },
    { key: `recover-email:ip:${ip}`, max: 10, windowSeconds: 24 * 3600 },
  ];
}

/** Compared against when the email is unknown, so both cases take the same time. */
let dummyHash: Promise<string> | undefined;

/** Verification emails: 3 per hour per address, 10 per day per IP (design §5.6). */
export function emailLimits(email: string, ip: string): Limit[] {
  return [
    { key: `verify-email:addr:${email}`, max: 3, windowSeconds: 3600 },
    { key: `verify-email:ip:${ip}`, max: 10, windowSeconds: 24 * 3600 },
  ];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: VerificationCodes,
    private readonly outbox: Outbox,
    private readonly rateLimiter: RateLimiter,
    private readonly sessions: Sessions,
  ) {}

  /**
   * ACC-03: email and password. Wrong credentials give one generic error that
   * doesn't reveal whether the email exists. Returns the new session token.
   */
  async login(input: z.output<typeof LoginInput>, ip: string): Promise<{ user: User; token: string }> {
    const limits = loginLimits(input.email, ip);
    await this.rateLimiter.assertUnder(...limits);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const passwordOk = user?.passwordHash
      ? await verify(user.passwordHash, input.password)
      : (await verify(await (dummyHash ??= hash('no-such-user')), input.password), false);

    if (!user || !passwordOk || user.status === 'deleted') {
      await this.rateLimiter.hit(...limits);
      throw new ApiError(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS, 'Wrong email or password');
    }
    await this.rateLimiter.clear(limits[0]!.key);

    // Only said after the right password, so it reveals nothing to a stranger.
    if (!user.emailVerifiedAt || user.status === 'pending') {
      throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.EMAIL_NOT_VERIFIED, 'Verify your email first');
    }
    if (user.status === 'suspended') {
      throw new ApiError(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_SUSPENDED, 'Account suspended');
    }

    return { user, token: await this.sessions.create(user.id, 'web') };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }

  /**
   * ACC-05: emails a reset link to an active account. Answers the same whether
   * or not the address has one, so it can't be used to find accounts.
   */
  async requestPasswordReset(input: z.output<typeof RecoverInput>, ip: string): Promise<void> {
    await this.rateLimiter.consume(...recoverLimits(input.email, ip));
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.status !== 'active') return;

    const token = await this.codes.issueLinkToken(user.id, 'recover', user.email);
    await this.outbox.send({
      to: user.email,
      locale: user.locale,
      template: 'reset-password',
      data: { pseudo: user.pseudo, link: `${env.publicUrl}/reset-password?${new URLSearchParams({ token })}` },
    });
  }

  /** ACC-05: sets the new password and logs the user out everywhere, in case someone else had access. */
  async resetPassword(input: z.output<typeof ResetPasswordInput>, ip: string): Promise<void> {
    await this.rateLimiter.consume({ key: `reset-confirm:ip:${ip}`, max: 30, windowSeconds: 3600 });
    const passwordHash = await hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      const userId = await this.codes.consumeLinkToken('recover', input.token, tx);
      if (!userId) {
        throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.RESET_LINK_INVALID, 'Reset link expired or already used');
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId } });
    });
  }

  /** ACC-01: creates a pending user and emails a verification code. */
  async signUp(input: z.output<typeof SignUpInput>, ip: string): Promise<{ email: string }> {
    await this.rateLimiter.consume(...emailLimits(input.email, ip));
    const passwordHash = await hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      await releaseStalePending(tx, input);
      await throwIfTaken(tx, input);
      try {
        return await tx.user.create({
          data: {
            fullName: input.fullName,
            pseudo: input.pseudo,
            email: input.email,
            phone: input.phone,
            passwordHash,
            locale: input.locale,
            privacyAcceptedAt: new Date(),
            privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          },
        });
      } catch (error) {
        // Someone took a value between the check and the insert.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw takenError({ fields: { '': ['taken'] } });
        }
        throw error;
      }
    });

    await this.sendVerification(user);
    return { email: user.email };
  }

  /** ACC-01: the email is verified, so the account becomes active. Verifying twice is fine. */
  async verifyEmail(input: z.output<typeof VerifyEmailInput>, ip: string): Promise<void> {
    await this.rateLimiter.consume({ key: `verify-code:ip:${ip}`, max: 30, windowSeconds: 3600 });
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VERIFICATION_CODE_INVALID, 'Wrong code');
    if (user.emailVerifiedAt) return;

    await this.codes.consume(user.id, 'verify', input.code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), status: user.status === 'pending' ? 'active' : user.status },
    });
  }

  /** Sends a new code. Answers the same whether or not the address has a pending account. */
  async resendVerification(input: z.output<typeof ResendVerificationInput>, ip: string): Promise<void> {
    await this.rateLimiter.consume(...emailLimits(input.email, ip));
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user && !user.emailVerifiedAt && user.status === 'pending') await this.sendVerification(user);
  }

  private async sendVerification(user: User): Promise<void> {
    const code = await this.codes.issue(user.id, 'verify', user.email);
    const link = `${env.publicUrl}/verify-email?${new URLSearchParams({ email: user.email, code })}`;
    await this.outbox.send({
      to: user.email,
      locale: user.locale,
      template: 'verify-email',
      data: { pseudo: user.pseudo, code, link },
    });
  }
}

/** What a user sees about themselves. */
export function toMe(user: User): Me {
  return {
    id: user.id,
    fullName: user.fullName,
    pseudo: user.pseudo,
    email: user.email,
    phone: user.phone,
    locale: user.locale,
    isInstanceAdmin: user.isInstanceAdmin,
  };
}

type Tx = Prisma.TransactionClient;
export type Unique = { email: string; pseudo: string; phone: string };

/**
 * Unverified sign-ups can't squat: a new sign-up with the same email replaces
 * them (only the email's owner can verify it), and after 24 h they release
 * their pseudo and phone too.
 */
export async function releaseStalePending(tx: Tx, input: Unique): Promise<void> {
  await tx.user.deleteMany({
    where: {
      status: 'pending',
      emailVerifiedAt: null,
      OR: [
        { email: input.email },
        {
          createdAt: { lt: new Date(Date.now() - PENDING_HOLD_MS) },
          OR: [{ pseudo: input.pseudo }, { phone: input.phone }],
        },
      ],
    },
  });
}

/** Reports every taken field at once, so the form can show them together. */
export async function throwIfTaken(tx: Tx, input: Unique): Promise<void> {
  const existing = await tx.user.findMany({
    where: { OR: [{ email: input.email }, { pseudo: input.pseudo }, { phone: input.phone }] },
    select: { email: true, pseudo: true, phone: true },
  });
  const fields: ValidationDetails['fields'] = {};
  for (const user of existing) {
    if (user.email.toLowerCase() === input.email) fields.email = ['taken'];
    if (user.pseudo.toLowerCase() === input.pseudo.toLowerCase()) fields.pseudo = ['taken'];
    if (user.phone === input.phone) fields.phone = ['taken'];
  }
  if (Object.keys(fields).length > 0) throw takenError({ fields });
}

function takenError(details: ValidationDetails) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Already in use', details);
}
