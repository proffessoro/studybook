import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** false while the server-rendered page waits for its JavaScript, true once it runs. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
