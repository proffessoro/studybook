import { z } from 'zod';

export const Locale = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof Locale>;

/** Response of `GET /api/v1/instance`, used by clients to check a server address. */
export const InstanceInfo = z.object({
  name: z.string(),
  version: z.string(),
  features: z.object({
    googleLogin: z.boolean(),
    catalogue: z.boolean(),
  }),
}).meta({ id: 'InstanceInfo' });
export type InstanceInfo = z.infer<typeof InstanceInfo>;
