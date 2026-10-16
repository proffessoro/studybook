'use client';

import { useTranslations } from 'next-intl';
import type { ApiError } from '@studybook/api-client';

export type FieldErrors = Record<string, string[]>;

/** The per-field problem codes of a `VALIDATION_FAILED` error, or none. */
export function fieldErrorsOf(error: ApiError | undefined): FieldErrors {
  if (error?.code !== 'VALIDATION_FAILED') return {};
  const fields = (error.details as { fields?: FieldErrors } | undefined)?.fields;
  return fields ?? {};
}

/**
 * Translates API errors (NFR-04: the API sends codes, clients translate them).
 * Field messages look for `Errors.fields.<field>.<code>`, then `Errors.field.<code>`.
 */
export function useApiErrorMessages() {
  const t = useTranslations('Errors');

  return {
    field(field: string, codes: string[] | undefined): string | undefined {
      const code = codes?.[0];
      if (!code) return undefined;
      if (t.has(`fields.${field}.${code}`)) return t(`fields.${field}.${code}`);
      if (t.has(`field.${code}`)) return t(`field.${code}`);
      return t('field.invalid');
    },
    api(error: ApiError): string {
      if (error.code === 'RATE_LIMITED') {
        const seconds = Number((error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60);
        return t('api.RATE_LIMITED', { minutes: Math.max(1, Math.ceil(seconds / 60)) });
      }
      return t.has(`api.${error.code}`) ? t(`api.${error.code}`) : t('api.unknown');
    },
    network(): string {
      return t('api.network');
    },
  };
}
