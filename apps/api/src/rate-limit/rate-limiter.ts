import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ErrorCode } from '@studybook/shared';
import { ApiError } from '../common/api-error.js';
import { REDIS } from '../redis/redis.module.js';

export type Limit = { key: string; max: number; windowSeconds: number };

/** Fixed-window counters in Valkey (design §5.6). */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Counts one hit against every limit and throws `RATE_LIMITED` if any is over.
   * `details.retryAfterSeconds` tells the client when to try again.
   */
  async consume(...limits: Limit[]): Promise<void> {
    const multi = this.redis.multi();
    for (const { key, windowSeconds } of limits) {
      multi.incr(`rl:${key}`).expire(`rl:${key}`, windowSeconds, 'NX').ttl(`rl:${key}`);
    }
    const results = (await multi.exec()) ?? [];

    let retryAfterSeconds = 0;
    limits.forEach((limit, i) => {
      const count = Number(results[i * 3]?.[1]);
      const ttl = Number(results[i * 3 + 2]?.[1]);
      if (count > limit.max) retryAfterSeconds = Math.max(retryAfterSeconds, ttl);
    });

    if (retryAfterSeconds > 0) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many requests', {
        retryAfterSeconds,
      });
    }
  }
}
