import { resetRateLimits } from './helpers';

/** Starts each run with empty rate-limit counters in the development Valkey. */
export default function globalSetup(): void {
  resetRateLimits();
}
