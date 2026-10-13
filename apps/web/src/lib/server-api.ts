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

/** The groups the logged-in user belongs to. */
export async function getMyGroups() {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/me/groups', { headers: { cookie: cookieHeader }, cache: 'no-store' });
  return data?.groups ?? [];
}

/** A group as the logged-in user sees it, or null when it doesn't exist or they aren't a member. */
export const getGroup = cache(async (groupId: string) => {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/groups/{groupId}', {
    params: { path: { groupId } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data ?? null;
});

/** What an invite link leads to, for the visitor (logged in or not), or null when the link no longer works. */
export async function getInvitePreview(token: string) {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/invites/{token}', {
    params: { path: { token } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data ?? null;
}

/** The group's invite link (leader only), or null. */
export async function getInviteLink(groupId: string) {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/groups/{groupId}/invite-link', {
    params: { path: { groupId } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data ?? null;
}

/** Pending join requests (leader only). */
export async function getJoinRequests(groupId: string) {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/groups/{groupId}/join-requests', {
    params: { path: { groupId } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data?.requests ?? [];
}

/** The group's active members as the logged-in user may see them (contacts for the leader only). */
export async function getMembers(groupId: string) {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/groups/{groupId}/members', {
    params: { path: { groupId } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data?.members ?? [];
}

/** Interest categories, in display order. */
export const getCategories = cache(async () => {
  const { client } = await serverApi();
  const { data } = await client.GET('/api/v1/categories', { cache: 'no-store' });
  return data?.categories ?? [];
});

/** A page of the public catalogue, or null when the catalogue is off. */
export async function getCatalogue(query: { category?: string; q?: string; cursor?: string }) {
  const { client } = await serverApi();
  const { data } = await client.GET('/api/v1/catalogue', { params: { query }, cache: 'no-store' });
  return data ?? null;
}

/** A listed group's public page, with where the visitor stands, or null. */
export const getCatalogueGroup = cache(async (slug: string) => {
  const { client, cookieHeader } = await serverApi();
  const { data } = await client.GET('/api/v1/catalogue/{slug}', {
    params: { path: { slug } },
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  return data ?? null;
});
