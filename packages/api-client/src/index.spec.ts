import { describe, expect, it } from 'vitest';
import { createApiClient } from './index.js';

function fakeFetch(status: number, body: unknown) {
  return async (input: Request) => {
    expect(new URL(input.url).pathname).toBe('/api/v1/instance');
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

describe('createApiClient', () => {
  it('returns typed data on success', async () => {
    const info = { name: 'Studybook', version: '0.0.0', features: { googleLogin: false, catalogue: true } };
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: fakeFetch(200, info) });

    const { data, error } = await client.GET('/api/v1/instance');

    expect(error).toBeUndefined();
    expect(data?.features.catalogue).toBe(true);
  });

  it('returns the standard error body on failure', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fakeFetch(503, { code: 'INTERNAL_ERROR', message: 'Database unreachable' }),
    });

    const { data, error } = await client.GET('/api/v1/instance');

    expect(data).toBeUndefined();
    expect(error?.code).toBe('INTERNAL_ERROR');
  });
});
