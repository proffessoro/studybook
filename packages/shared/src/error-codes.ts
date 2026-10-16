import { z } from 'zod';

/**
 * Error codes returned by the API as `{ code, message, details }`.
 * Clients translate the code into FR/EN; the message is for developers only.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  VERIFICATION_CODE_INVALID: 'VERIFICATION_CODE_INVALID',
  VERIFICATION_CODE_EXPIRED: 'VERIFICATION_CODE_EXPIRED',
  RESET_LINK_INVALID: 'RESET_LINK_INVALID',
  GOOGLE_SIGNUP_EXPIRED: 'GOOGLE_SIGNUP_EXPIRED',
  GROUP_FULL: 'GROUP_FULL',
  GROUP_ARCHIVED: 'GROUP_ARCHIVED',
  INVITE_INVALID: 'INVITE_INVALID',
  BANNED_FROM_GROUP: 'BANNED_FROM_GROUP',
  REQUEST_ALREADY_DECIDED: 'REQUEST_ALREADY_DECIDED',
  CONFIRMATION_MISMATCH: 'CONFIRMATION_MISMATCH',
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
