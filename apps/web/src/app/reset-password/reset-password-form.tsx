'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/** Opened from the emailed link. Nothing happens until the user submits a new password. */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('ResetPassword');
  const messages = useApiErrorMessages();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setPending(true);
    setPasswordError(undefined);
    setFormError(undefined);
    try {
      const { error } = await api.POST('/api/v1/auth/recover/confirm', { body: { token, password } });
      if (!error) setDone(true);
      else if (error.code === 'RESET_LINK_INVALID') setLinkInvalid(true);
      else if (error.code === 'VALIDATION_FAILED') {
        const fields = fieldErrorsOf(error);
        if (fields.password) setPasswordError(messages.field('password', fields.password));
        else setLinkInvalid(true);
      } else setFormError(messages.api(error));
    } catch {
      setFormError(messages.network());
    }
    setPending(false);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="text-lg font-medium">{t('done')}</p>
        <p className="text-muted-foreground">{t('doneNext')}</p>
        <Button size="lg" asChild>
          <Link href="/login">{t('login')}</Link>
        </Button>
      </div>
    );
  }

  if (linkInvalid) {
    return (
      <div role="alert" className="flex flex-col gap-4">
        <p>{t('linkInvalid')}</p>
        <Button size="lg" asChild>
          <Link href="/forgot-password">{t('newLink')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="password" label={t('password')} hint={t('passwordHint')} error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          {...describedBy('password', { hint: t('passwordHint'), error: passwordError })}
        />
      </FormField>
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      <SubmitButton size="lg" pending={pending}>
        {pending ? t('submitting') : t('submit')}
      </SubmitButton>
    </form>
  );
}
