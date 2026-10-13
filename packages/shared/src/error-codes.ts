/**
 * Error codes returned by the API as `{ code, message, details }`.
 * Clients translate the code into FR/EN; the message is for developers only.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  GROUP_FULL: 'GROUP_FULL',
  TASK_DEADLINE_PASSED: 'TASK_DEADLINE_PASSED',
  TASK_NOT_APPLICABLE: 'TASK_NOT_APPLICABLE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
