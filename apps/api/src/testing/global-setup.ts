import { execSync } from 'node:child_process';

/** Brings the test database (studybook_test) up to the latest migration before the tests run. */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
