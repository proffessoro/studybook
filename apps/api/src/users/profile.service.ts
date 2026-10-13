import { HttpStatus, Injectable } from '@nestjs/common';
import { verify } from 'argon2';
import type { z } from 'zod';
import {
  type ChangeEmailInput,
  type ConfirmEmailChangeInput,
  ErrorCode,
  type UpdateProfileInput,
  type ValidationDetails,
} from '@studybook/shared';
import { emailLimits, PENDING_HOLD_MS } from '../auth/auth.service.js';
import { VerificationCodes } from '../auth/verification-codes.js';
import { ApiError } from '../common/api-error.js';
import { Prisma, type User } from '../generated/prisma/client.js';
import { Outbox } from '../notify/email-job.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiter } from '../rate-limit/rate-limiter.js';

type Unique = { pseudo?: string; phone?: string; email?: string };

/** ACC-06: the user edits their own profile. The avatar comes with file storage (step 1.4). */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: VerificationCodes,
    private readonly outbox: Outbox,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** Name, pseudo, phone (format re-checked, not verified in Phase 1), and language. */
  async update(user: User, input: z.output<typeof UpdateProfileInput>): Promise<User> {
    const changed = {
      ...(input.pseudo !== undefined && input.pseudo !== user.pseudo ? { pseudo: input.pseudo } : {}),
      ...(input.phone !== undefined && input.phone !== user.phone ? { phone: input.phone } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      await throwIfTaken(tx, user.id, changed);
      try {
        return await tx.user.update({
          where: { id: user.id },
          data: { fullName: input.fullName, locale: input.locale, ...changed },
        });
      } catch (error) {
        throw raceToTaken(error);
      }
    });
  }

  /** Step 1 of an email change: checks the password and emails a code to the new address. */
  async requestEmailChange(user: User, input: z.output<typeof ChangeEmailInput>, ip: string): Promise<void> {
    await this.rateLimiter.consume({ key: `email-change:user:${user.id}`, max: 5, windowSeconds: 3600 });
    if (!user.passwordHash || !(await verify(user.passwordHash, input.password))) {
      throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.WRONG_PASSWORD, 'Wrong password');
    }
    if (input.newEmail === user.email.toLowerCase()) throw taken({ fields: { newEmail: ['same'] } });
    await throwIfTaken(this.prisma, user.id, { email: input.newEmail }, 'newEmail');
    await this.rateLimiter.consume(...emailLimits(input.newEmail, ip));

    const code = await this.codes.issue(user.id, 'change', input.newEmail);
    await this.outbox.send({
      to: input.newEmail,
      locale: user.locale,
      template: 'confirm-email-change',
      data: { pseudo: user.pseudo, code },
    });
  }

  /** Step 2: the code proves the user owns the new address. The old address is told about the change. */
  async confirmEmailChange(user: User, input: z.output<typeof ConfirmEmailChangeInput>): Promise<User> {
    const { target: newEmail } = await this.codes.consume(user.id, 'change', input.code);

    const updated = await this.prisma.$transaction(async (tx) => {
      // The address may have been taken while the code was on its way.
      await throwIfTaken(tx, user.id, { email: newEmail }, 'newEmail');
      try {
        return await tx.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerifiedAt: new Date() } });
      } catch (error) {
        throw raceToTaken(error);
      }
    });

    await this.outbox.send({
      to: user.email,
      locale: user.locale,
      template: 'email-changed',
      data: { pseudo: user.pseudo, newEmail },
    });
    return updated;
  }
}

/**
 * Reports values held by another account. Unverified sign-ups older than
 * 24 h no longer hold anything (same rule as sign-up), so they are removed.
 */
async function throwIfTaken(
  tx: Prisma.TransactionClient,
  userId: string,
  values: Unique,
  emailField: 'email' | 'newEmail' = 'email',
): Promise<void> {
  const or = Object.entries(values).map(([key, value]) => ({ [key]: value }));
  if (or.length === 0) return;

  await tx.user.deleteMany({
    where: {
      id: { not: userId },
      OR: or,
      status: 'pending',
      emailVerifiedAt: null,
      createdAt: { lt: new Date(Date.now() - PENDING_HOLD_MS) },
    },
  });

  const others = await tx.user.findMany({
    where: { id: { not: userId }, OR: or },
    select: { pseudo: true, phone: true, email: true },
  });
  const fields: ValidationDetails['fields'] = {};
  for (const other of others) {
    if (values.pseudo && other.pseudo.toLowerCase() === values.pseudo.toLowerCase()) fields.pseudo = ['taken'];
    if (values.phone && other.phone === values.phone) fields.phone = ['taken'];
    if (values.email && other.email.toLowerCase() === values.email) fields[emailField] = ['taken'];
  }
  if (Object.keys(fields).length > 0) throw taken({ fields });
}

function taken(details: ValidationDetails) {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Already in use', details);
}

/** A unique value taken between the check and the write. */
function raceToTaken(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return taken({ fields: { '': ['taken'] } });
  }
  return error;
}
