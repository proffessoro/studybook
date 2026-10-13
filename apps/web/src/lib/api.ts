import { createApiClient } from '@studybook/api-client';

/**
 * Client for use in the browser. Requests go to the site's own origin: Caddy
 * routes /api/v1 to the API in production, and next.config.ts does in development.
 */
export const api = createApiClient({ baseUrl: '' });
