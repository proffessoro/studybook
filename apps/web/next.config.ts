import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace files from the monorepo root so the standalone build includes workspace packages.
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  // In production Caddy routes /api/v1 to the API. In development, Next proxies it.
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default withNextIntl(nextConfig);
