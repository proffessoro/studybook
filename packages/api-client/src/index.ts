import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };
export type ApiError = components['schemas']['ApiError'];

/**
 * Typed client for the Studybook API, generated from the OpenAPI spec (NFR-11).
 * In the browser, `baseUrl` is the site's own origin (Caddy routes /api/v1);
 * on the server, it is the API's internal address.
 */
export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>(options);
}

export type ApiClient = ReturnType<typeof createApiClient>;
