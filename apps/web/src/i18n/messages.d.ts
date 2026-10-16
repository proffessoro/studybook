import type en from '../../messages/en.json';
import type fr from '../../messages/fr.json';

/** Message keys are type-checked against en.json: a missing or misspelt key fails `pnpm typecheck`. */
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof en;
  }
}

/** fr.json must have every key of en.json, or French pages would hit MISSING_MESSAGE at runtime. */
type HasAllKeys<T extends typeof en> = T;
export type FrenchHasAllKeys = HasAllKeys<typeof fr>;
