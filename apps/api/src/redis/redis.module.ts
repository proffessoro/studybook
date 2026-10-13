import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

export const REDIS = Symbol('REDIS');

/** One shared Valkey connection for rate limits. BullMQ opens its own. */
@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: () => new Redis(env.redisUrl, { lazyConnect: true }) }],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
