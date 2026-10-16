import type { Locale } from '@studybook/shared';

export const EMAIL_QUEUE = 'email';

/** One email to send. Kept small: the worker renders it in the recipient's language. */
export type EmailJob = {
  to: string;
  locale: Locale;
  template: 'verify-email';
  data: { pseudo: string; code: string; link: string };
};

/** Where the API puts emails to send. Tests swap in a fake. */
export abstract class Outbox {
  abstract send(job: EmailJob): Promise<void>;
}
