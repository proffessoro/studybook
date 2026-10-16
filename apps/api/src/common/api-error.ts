import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@studybook/shared';

/** An error the client is meant to see. The filter turns it into `{ code, message, details }`. */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}
