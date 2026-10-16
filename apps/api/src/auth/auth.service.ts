import { HttpStatus, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import type { z } from 'zod';
import {
  ErrorCode,
  PRIVACY_POLICY_VERSION,
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
import { VerificationCodes } from './verification-codes.js';

/** An unverified sign-up stops holding its pseudo and phone after this long. */
const PENDING_HOLD_MS = 24 * 3600 * 1000;

/** Verification emails: 3 per hour per address, 10 per day per IP (design §5.6). */
function emailLimits(email: string, ip: string): Limit[] {
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
  ) {}

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

type Tx = Prisma.TransactionClient;
type Unique = { email: string; pseudo: string; phone: string };

/**
 * Unverified sign-ups can't squat: a new sign-up with the same email replaces
 * them (only the email's owner can verify it), and after 24 h they release
 * their pseudo and phone too.
 */
async function releaseStalePending(tx: Tx, input: Unique): Promise<void> {
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
async function throwIfTaken(tx: Tx, input: Unique): Promise<void> {
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
