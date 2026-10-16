import { describe, expect, it } from 'vitest';
import { ApiErrorBody, ErrorCode } from './error-codes.js';

describe('ApiErrorBody', () => {
  it('accepts a known code with optional details', () => {
    const body = { code: ErrorCode.GROUP_FULL, message: 'Group is full', details: { memberCap: 500 } };
    expect(ApiErrorBody.parse(body)).toEqual(body);
  });

  it('rejects an unknown code', () => {
    expect(ApiErrorBody.safeParse({ code: 'NOPE', message: '' }).success).toBe(false);
  });
});
