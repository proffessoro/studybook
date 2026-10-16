import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { type ApiErrorBody, ErrorCode } from '@studybook/shared';

const codeByStatus: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  429: ErrorCode.RATE_LIMITED,
};

/** The part of Fastify's reply used here. */
type Reply = { status(code: number): { send(body: unknown): unknown } };

const knownCodes = new Set<string>(Object.values(ErrorCode));

/**
 * Sends every error as `{ code, message, details }` (design §6). Unexpected errors
 * become a 500 `INTERNAL_ERROR` and are logged; their message is never sent.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<Reply>();
    const { status, body } = this.toApiError(exception);
    reply.status(status).send(body);
  }

  private toApiError(exception: unknown): { status: number; body: ApiErrorBody } {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    if (status >= 500) {
      if (!(exception instanceof HttpException)) this.logger.error(exception);
      const own = exception instanceof HttpException ? readOwnError(exception) : undefined;
      return { status, body: own ?? { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } };
    }

    const httpException = exception as HttpException;
    const own = readOwnError(httpException);
    if (own) return { status, body: own };

    return {
      status,
      body: { code: codeByStatus[status] ?? ErrorCode.BAD_REQUEST, message: httpException.message },
    };
  }
}

/** Reads `{ code, message, details }` when the exception was built with one of our codes. */
function readOwnError(exception: HttpException): ApiErrorBody | undefined {
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null) return undefined;
  const { code, message, details } = response as Record<string, unknown>;
  if (typeof code !== 'string' || !knownCodes.has(code)) return undefined;
  return {
    code: code as ErrorCode,
    message: typeof message === 'string' ? message : exception.message,
    ...(details && typeof details === 'object' ? { details: details as Record<string, unknown> } : {}),
  };
}
