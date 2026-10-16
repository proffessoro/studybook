import { cache } from 'react';
import { cookies } from 'next/headers';
import { createApiClient } from '@studybook/api-client';

/**
 * Client for server components. Forwards the visitor's cookies so the API sees
 * their session. GET only: the API refuses changes without the browser's Origin (CSRF check).
 */
async function serverApi() {
  const cookieHeader = (await cookies()).toString();
  const client = createApiClient({ baseUrl: process.env.API_URL ?? 'http://localhost:4000' });
  return { client, cookieHeader };
}

/** This instance's name and enabled features (e.g. Google login). */
export const getInstance = cache(async () => {
  const { client } = await serverApi();
  try {
    const { data } = await client.GET('/api/v1/instance', { cache: 'no-store' });
    return data ?? null;
  } catch {
    return null;
  }
});

/** The logged-in user, or null. Called once per request however many components ask. */
export const getMe = cache(async () => {
  const { client, cookieHeader } = await serverApi();
  // Visitors without a session cookie need no API call.
  if (!cookieHeader.includes('sb_session=')) return null;
  try {
    const { data } = await client.GET('/api/v1/me', { headers: { cookie: cookieHeader }, cache: 'no-store' });
    return data ?? null;
  } catch {
    return null;
  }
});
