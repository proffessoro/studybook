'use client';

import { type FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@studybook/shared';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { type FieldErrors, fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

export function SignUpForm() {
  const t = useTranslations('SignUp');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const uiLocale = useLocale() as Locale;
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFormError(undefined);

    try {
      const { data, error } = await api.POST('/api/v1/auth/signup', {
        body: {
          fullName: String(form.get('fullName') ?? ''),
          pseudo: String(form.get('pseudo') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: String(form.get('phone') ?? ''),
          password: String(form.get('password') ?? ''),
          locale: form.get('locale') === 'en' ? 'en' : 'fr',
          // Sent even when unticked, so the API reports it with the other fields.
          acceptPrivacy: (form.get('acceptPrivacy') === 'on') as true,
        },
      });
      if (data) {
        router.push(`/verify-email?${new URLSearchParams({ email: data.email })}`);
        return;
      }
      const fields = fieldErrorsOf(error);
      setFieldErrors(fields);
      if (fields['']) setFormError(messages.field('', fields['']));
      else if (Object.keys(fields).length === 0 && error) setFormError(messages.api(error));
    } catch {
      setFormError(messages.network());
    }
    setPending(false);
  }

  const err = (field: string) => messages.field(field, fieldErrors[field]);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="fullName" label={t('fullName')} error={err('fullName')}>
        <Input id="fullName" name="fullName" autoComplete="name" required {...describedBy('fullName', { error: err('fullName') })} />
      </FormField>

      <FormField id="pseudo" label={t('pseudo')} hint={t('pseudoHint')} error={err('pseudo')}>
        <Input
          id="pseudo"
          name="pseudo"
          autoComplete="username"
          autoCapitalize="none"
          required
          {...describedBy('pseudo', { hint: t('pseudoHint'), error: err('pseudo') })}
        />
      </FormField>

      <FormField id="email" label={t('email')} error={err('email')}>
        <Input id="email" name="email" type="email" autoComplete="email" required {...describedBy('email', { error: err('email') })} />
      </FormField>

      <FormField id="phone" label={t('phone')} hint={t('phoneHint')} error={err('phone')}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="6 XX XX XX XX"
          required
          {...describedBy('phone', { hint: t('phoneHint'), error: err('phone') })}
        />
      </FormField>

      <FormField id="password" label={t('password')} hint={t('passwordHint')} error={err('password')}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          {...describedBy('password', { hint: t('passwordHint'), error: err('password') })}
        />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{t('language')}</legend>
        <div className="flex gap-6">
          {(['fr', 'en'] as const).map((locale) => (
            <label key={locale} className="flex items-center gap-2 text-base" lang={locale}>
              <input type="radio" name="locale" value={locale} defaultChecked={locale === uiLocale} className="size-4" />
              {t(`languages.${locale}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="acceptPrivacy"
            required
            className="mt-0.5 size-4 shrink-0"
            {...describedBy('acceptPrivacy', { error: err('acceptPrivacy') })}
          />
          <span>
            {t.rich('acceptPrivacy', {
              link: (chunks) => (
                <Link href="/privacy" target="_blank" className="underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        {err('acceptPrivacy') && (
          <p id="acceptPrivacy-error" className="text-sm text-destructive">
            {err('acceptPrivacy')}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
