import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotifyModule } from '../notify/notify.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

/** Profile (ACC-06). Data export and account deletion (ACC-07) join it in step 1.8. */
@Module({
  imports: [AuthModule, NotifyModule, RateLimitModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class UsersModule {}
