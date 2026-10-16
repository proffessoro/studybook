import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { VerificationCodes } from './verification-codes.js';

@Module({
  imports: [NotifyModule, RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService, VerificationCodes],
})
export class AuthModule {}
