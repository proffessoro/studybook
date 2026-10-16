import { z } from 'zod';

/**
 * Error codes returned by the API as `{ code, message, details }`.
 * Clients translate the code into FR/EN; the message is for developers only.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  VERIFICATION_CODE_INVALID: 'VERIFICATION_CODE_INVALID',
  VERIFICATION_CODE_EXPIRED: 'VERIFICATION_CODE_EXPIRED',
  GROUP_FULL: 'GROUP_FULL',
  TASK_DEADLINE_PASSED: 'TASK_DEADLINE_PASSED',
  TASK_NOT_APPLICABLE: 'TASK_NOT_APPLICABLE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Body of every error response. `details` depends on the code. */
export const ApiErrorBody = z
  .object({
    code: z.enum(ErrorCode),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'ApiError' });
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/**
 * `details` of a `VALIDATION_FAILED` error: for each invalid field (dotted path,
 * `""` for the whole body), the list of problem codes that clients translate.
 */
export type ValidationDetails = { fields: Record<string, string[]> };
