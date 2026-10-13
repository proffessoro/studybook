import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { env } from '../config/env.js';
import type { VerificationPurpose } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHmac('sha256', env.sessionSecret).update(code).digest('hex');
}

/** Six-digit one-time codes sent by email (design §4.1: hashed, short expiry, limited attempts). */
@Injectable()
export class VerificationCodes {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a new code and voids the user's earlier codes for the same purpose. Returns it in clear, to send. */
  async issue(userId: string, purpose: VerificationPurpose, target: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.verificationCode.deleteMany({ where: { userId, purpose, consumedAt: null } }),
      this.prisma.verificationCode.create({
        data: { userId, purpose, target, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
      }),
    ]);
    return code;
  }

  /**
   * Uses up the code if it matches. Throws `VERIFICATION_CODE_INVALID` for a wrong code
   * and `VERIFICATION_CODE_EXPIRED` when it timed out or ran out of attempts.
   */
  async consume(userId: string, purpose: VerificationPurpose, code: string): Promise<void> {
    const current = await this.prisma.verificationCode.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!current) throw invalid();
    if (current.expiresAt < new Date() || current.attempts >= MAX_ATTEMPTS) throw expired();

    const given = Buffer.from(hashCode(code), 'hex');
    if (!timingSafeEqual(given, Buffer.from(current.codeHash, 'hex'))) {
      // Counted in the database, so parallel guesses can't get past the limit.
      await this.prisma.verificationCode.updateMany({
        where: { id: current.id, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }

    const { count } = await this.prisma.verificationCode.updateMany({
      where: { id: current.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count === 0) throw invalid();
  }
}

function invalid() {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VERIFICATION_CODE_INVALID, 'Wrong code');
}

function expired() {
  return new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VERIFICATION_CODE_EXPIRED, 'Code expired, ask for a new one');
}
