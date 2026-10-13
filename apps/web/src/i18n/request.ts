import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { Locale } from '@studybook/shared';

/**
 * The locale is not in the URL: it comes from the user's choice (cookie),
 * then the browser language, then French (NFR-04).
 */
export default getRequestConfig(async () => {
  const fromCookie = Locale.safeParse((await cookies()).get('NEXT_LOCALE')?.value);
  const acceptLanguage = (await headers()).get('accept-language')?.toLowerCase() ?? '';
  const locale: Locale = fromCookie.success ? fromCookie.data : acceptLanguage.startsWith('en') ? 'en' : 'fr';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
