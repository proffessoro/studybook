import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { GoogleController } from './google.controller.js';
import { GoogleAuthService } from './google.service.js';
import { MeController } from './me.controller.js';
import { SessionGuard } from './session.guard.js';
import { Sessions } from './sessions.js';
import { VerificationCodes } from './verification-codes.js';

@Module({
  imports: [NotifyModule, RateLimitModule],
  controllers: [AuthController, MeController, GoogleController],
  providers: [AuthService, VerificationCodes, Sessions, SessionGuard, GoogleAuthService],
  exports: [Sessions, SessionGuard, VerificationCodes],
})
export class AuthModule {}
