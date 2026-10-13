'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

export function ForgotPasswordForm({ email: initialEmail }: { email: string }) {
  const t = useTranslations('ForgotPassword');
  const messages = useApiErrorMessages();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const [error, setError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setPending(true);
    setError(undefined);
    try {
      const { error: apiError } = await api.POST('/api/v1/auth/recover', { body: { email } });
      if (!apiError) setSentTo(email);
      else if (apiError.code === 'VALIDATION_FAILED') setError(messages.field('email', fieldErrorsOf(apiError).email));
      else setError(messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p>{t('sent', { email: sentTo })}</p>
        <Button variant="outline" asChild>
          <Link href="/login">{t('backToLogin')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="email" label={t('email')} error={error}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={initialEmail} required />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
