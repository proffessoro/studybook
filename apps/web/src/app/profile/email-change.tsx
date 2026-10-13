'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

type Step = { name: 'idle' } | { name: 'form' } | { name: 'code'; newEmail: string } | { name: 'done'; newEmail: string };

/**
 * Changing email (ACC-06): the current password, then a code sent to the new
 * address. The email only changes once that code is entered.
 */
export function EmailChange({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations('Profile');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [pending, setPending] = useState(false);
  const [newEmailError, setNewEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setNewEmailError(undefined);
    setPasswordError(undefined);
    try {
      const { data, error } = await api.POST('/api/v1/me/email', {
        body: { newEmail: String(form.get('newEmail') ?? ''), password: String(form.get('password') ?? '') },
      });
      if (data) setStep({ name: 'code', newEmail: data.newEmail });
      else if (error?.code === 'WRONG_PASSWORD') setPasswordError(messages.api(error));
      else if (error) {
        const fields = fieldErrorsOf(error);
        if (fields.newEmail) setNewEmailError(messages.field('newEmail', fields.newEmail));
        else if (fields.password) setPasswordError(messages.field('password', fields.password));
        else setNewEmailError(messages.api(error));
      }
    } catch {
      setNewEmailError(messages.network());
    }
    setPending(false);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== 'code') return;
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '');
    setPending(true);
    setCodeError(undefined);
    try {
      const { data, error } = await api.POST('/api/v1/me/email/confirm', { body: { code } });
      if (data) {
        setStep({ name: 'done', newEmail: data.email });
        router.refresh();
      } else if (error) {
        const fields = fieldErrorsOf(error);
        setCodeError(fields.code ? t('codeFormat') : fields.newEmail ? messages.field('newEmail', fields.newEmail) : messages.api(error));
      }
    } catch {
      setCodeError(messages.network());
    }
    setPending(false);
  }

  if (step.name === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <p>
          {t('currentEmail')} <strong className="break-all">{currentEmail}</strong>
        </p>
        <Button variant="outline" className="self-start" onClick={() => setStep({ name: 'form' })}>
          {t('changeEmail')}
        </Button>
      </div>
    );
  }

  if (step.name === 'done') {
    return (
      <p role="status">
        {t('emailChanged')} <strong className="break-all">{step.newEmail}</strong>
      </p>
    );
  }

  if (step.name === 'code') {
    return (
      <form method="post" onSubmit={confirm} noValidate className="flex flex-col gap-4">
        <p className="text-muted-foreground">{t('codeSent', { email: step.newEmail })}</p>
        <FormField id="code" label={t('code')} error={codeError}>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="text-center text-2xl tracking-[0.5em]"
            required
            {...describedBy('code', { error: codeError })}
          />
        </FormField>
        <SubmitButton pending={pending}>
          {t('confirmEmail')}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setStep({ name: 'form' })}>
          {t('startAgain')}
        </Button>
      </form>
    );
  }

  return (
    <form method="post" onSubmit={requestChange} noValidate className="flex flex-col gap-4">
      <FormField id="newEmail" label={t('newEmail')} error={newEmailError}>
        <Input id="newEmail" name="newEmail" type="email" autoComplete="email" required {...describedBy('newEmail', { error: newEmailError })} />
      </FormField>
      <FormField id="currentPassword" label={t('currentPassword')} hint={t('currentPasswordHint')} error={passwordError}>
        <Input
          id="currentPassword"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          {...describedBy('currentPassword', { hint: t('currentPasswordHint'), error: passwordError })}
        />
      </FormField>
      <div className="flex gap-2">
        <SubmitButton pending={pending}>
          {t('sendCode')}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setStep({ name: 'idle' })}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
