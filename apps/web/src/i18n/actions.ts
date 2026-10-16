'use server';

import { cookies } from 'next/headers';
import { Locale } from '@studybook/shared';

/** Saves the user's language choice in the cookie read by `request.ts` (NFR-04). */
export async function setLocale(value: Locale) {
  const locale = Locale.parse(value);
  (await cookies()).set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
