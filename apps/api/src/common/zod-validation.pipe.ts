import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ErrorCode, type ValidationDetails } from '@studybook/shared';
import { ApiError } from './api-error.js';

/**
 * Validates and parses one input with a shared Zod schema, e.g.
 * `@Body(new ZodValidationPipe(SignUpInput)) body: SignUpInput`.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: ValidationDetails['fields'] = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.');
      // Custom refinements name their problem with `params: { code }`, e.g. `pseudo_taken`.
      const code = issue.code === 'custom' ? String(issue.params?.code ?? 'custom') : issue.code;
      (fields[path] ??= []).push(code);
    }
    throw new ApiError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, 'Invalid input', { fields });
  }
}
