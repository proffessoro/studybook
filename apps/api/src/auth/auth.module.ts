import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { SessionGuard } from './session.guard.js';
import { Sessions } from './sessions.js';
import { VerificationCodes } from './verification-codes.js';

@Module({
  imports: [NotifyModule, RateLimitModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, VerificationCodes, Sessions, SessionGuard],
  exports: [Sessions, SessionGuard],
})
export class AuthModule {}
