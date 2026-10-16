'use client';

import { type ComponentProps, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const noop = () => () => {};

/** false while the server-rendered page waits for its JavaScript, true once it runs. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * The submit button of a form handled in JavaScript. On a slow phone the page
 * can show before its JavaScript runs; a tap then would make the browser send
 * the form itself (to the wrong place, with the fields in the request). So the
 * button stays disabled until the page is ready, and while `pending`.
 */
export function SubmitButton({ pending = false, disabled, ...props }: ComponentProps<typeof Button> & { pending?: boolean }) {
  const hydrated = useHydrated();
  return <Button type="submit" disabled={!hydrated || pending || disabled} {...props} />;
}
