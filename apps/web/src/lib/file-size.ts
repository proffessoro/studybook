import type { useFormatter } from 'next-intl';

/** What `useFormatter()` (client) and `getFormatter()` (server) from next-intl give. */
type Formatter = ReturnType<typeof useFormatter>;

/** "850 kB", "12.3 MB" in English; "850 ko", "12,3 Mo" in French. */
export function formatFileSize(format: Formatter, bytes: number): string {
  const [value, unit] = bytes >= 1_000_000_000 ? [bytes / 1e9, 'gigabyte'] : bytes >= 1_000_000 ? [bytes / 1e6, 'megabyte'] : [bytes / 1e3, 'kilobyte'];
  return format.number(value, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: value < 10 ? 1 : 0 });
}
