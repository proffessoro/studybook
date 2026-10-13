/**
 * Environment settings (design §7, OPS-02). Read once at start; development
 * defaults match deploy/docker-compose.dev.yml.
 */
const isProduction = process.env.NODE_ENV === 'production';

function required(name: string, devDefault: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) throw new Error(`Missing required environment variable ${name}`);
  return devDefault;
}

export const env = {
  isProduction,
  /** Where people open the web app, used in links inside emails */
  publicUrl: (process.env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** Keys the HMAC of one-time codes (and, later, session tokens) */
  sessionSecret: required('SESSION_SECRET', 'dev-only-secret-change-me'),
  /** Trust X-Forwarded-For from the reverse proxy (Caddy) for client IPs */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Run the background worker inside the API process (handy in development and on tiny servers) */
  workerInProcess: process.env.WORKER_IN_PROCESS === 'true',
  /**
   * Google login (ACC-04), on only when both client values are set. Read on
   * each use, so tests can point the issuer at a fake provider.
   */
  get google() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    return {
      enabled: Boolean(clientId && clientSecret),
      clientId: clientId ?? '',
      clientSecret: clientSecret ?? '',
      issuer: process.env.GOOGLE_ISSUER ?? 'https://accounts.google.com',
    };
  },
  /** Where uploaded files live with the local driver (design §2: `local` by default, S3 later). */
  get storageDir() {
    return process.env.STORAGE_DIR ?? 'storage';
  },
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? 'Studybook <no-reply@localhost>',
  },
};
