import { execSync } from 'node:child_process';
import path from 'node:path';

// Playwright runs from apps/web.
const devCompose = path.resolve('../../deploy/docker-compose.dev.yml');

/**
 * End-to-end runs sign up many users from one IP, which the real limits stop
 * (10 verification emails a day per IP). Before a run, clear the rate-limit
 * counters in the development Valkey (deploy/docker-compose.dev.yml only).
 */
export default function globalSetup(): void {
  execSync(
    `docker compose -f "${devCompose}" exec -T valkey sh -c "valkey-cli --scan --pattern 'rl:*' | xargs -r valkey-cli del"`,
    { stdio: 'pipe' },
  );
}
