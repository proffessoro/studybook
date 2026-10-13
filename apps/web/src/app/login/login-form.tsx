'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

export function LoginForm({ email: initialEmail, next }: { email: string; next: string }) {
  const t = useTranslations('Login');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    setPending(true);
    setError(undefined);
    setUnverifiedEmail(undefined);

    try {
      const { data, error: apiError } = await api.POST('/api/v1/auth/login', {
        body: { email, password: String(form.get('password') ?? '') },
      });
      if (data) {
        router.push(next);
        router.refresh();
        return;
      }
      if (apiError?.code === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(email);
      else if (apiError?.code === 'VALIDATION_FAILED') setError(t('fillBoth'));
      else if (apiError) setError(messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="email" label={t('email')}>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={initialEmail} required />
      </FormField>

      <FormField id="password" label={t('password')}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      <Link href="/forgot-password" className="-mt-3 self-end text-sm underline underline-offset-2">
        {t('forgot')}
      </Link>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {unverifiedEmail && (
        <div role="alert" className="flex flex-col gap-2 rounded-md bg-muted px-3 py-3 text-sm">
          <p>{t('notVerified')}</p>
          <Link
            href={`/verify-email?${new URLSearchParams({ email: unverifiedEmail })}`}
            className="font-medium underline underline-offset-2"
          >
            {t('verifyNow')}
          </Link>
        </div>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
