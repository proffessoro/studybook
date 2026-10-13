/** A redirect target from the URL, kept on this site: `/path` only, never `//host`, `/\host`, or `https://…`. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
