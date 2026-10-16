'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { GoogleSignupDraft, Locale } from '@studybook/shared';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { type FieldErrors, fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/**
 * The last step for a new Google user (ACC-04): pseudo, phone, language, and
 * consent. Google already verified the email. The draft sits behind a cookie
 * that only /api/v1/auth/google receives, so the browser loads it.
 */
export function GoogleSignupForm({ next }: { next: string }) {
  const t = useTranslations('Google');
  const tSignUp = useTranslations('SignUp');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const uiLocale = useLocale() as Locale;
  const [draft, setDraft] = useState<GoogleSignupDraft | 'loading' | 'expired'>('loading');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  useEffect(() => {
    api
      .GET('/api/v1/auth/google/signup')
      .then(({ data }) => setDraft(data ?? 'expired'))
      .catch(() => setDraft('expired'));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFormError(undefined);
    try {
      const { data, error } = await api.POST('/api/v1/auth/google/signup', {
        body: {
          fullName: String(form.get('fullName') ?? ''),
          pseudo: String(form.get('pseudo') ?? ''),
          phone: String(form.get('phone') ?? ''),
          locale: form.get('locale') === 'en' ? 'en' : 'fr',
          // Sent even when unticked, so the API reports it with the other fields.
          acceptPrivacy: (form.get('acceptPrivacy') === 'on') as true,
        },
      });
      if (data) {
        router.push(next);
        router.refresh();
        return;
      }
      if (error?.code === 'GOOGLE_SIGNUP_EXPIRED') setDraft('expired');
      else if (error) {
        const fields = fieldErrorsOf(error);
        setFieldErrors(fields);
        if (fields['']) setFormError(messages.field('', fields['']));
        else if (Object.keys(fields).length === 0) setFormError(messages.api(error));
      }
    } catch {
      setFormError(messages.network());
    }
    setPending(false);
  }

  if (draft === 'loading') return <p className="text-muted-foreground">{t('loading')}</p>;

  if (draft === 'expired') {
    return (
      <div role="alert" className="flex flex-col gap-4">
        <p>{t('expired')}</p>
        <Button size="lg" asChild>
          <a href={`/api/v1/auth/google?${new URLSearchParams({ next })}`}>{t('startAgain')}</a>
        </Button>
        <Link href="/signup" className="text-center text-sm underline underline-offset-2">
          {t('useEmail')}
        </Link>
      </div>
    );
  }

  const err = (field: string) => messages.field(field, fieldErrors[field]);

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        {t('connectedAs')} <strong className="break-all">{draft.email}</strong>
      </p>

      <FormField id="fullName" label={tSignUp('fullName')} error={err('fullName')}>
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={draft.fullName} required {...describedBy('fullName', { error: err('fullName') })} />
      </FormField>

      <FormField id="pseudo" label={tSignUp('pseudo')} hint={tSignUp('pseudoHint')} error={err('pseudo')}>
        <Input
          id="pseudo"
          name="pseudo"
          autoComplete="username"
          autoCapitalize="none"
          required
          {...describedBy('pseudo', { hint: tSignUp('pseudoHint'), error: err('pseudo') })}
        />
      </FormField>

      <FormField id="phone" label={tSignUp('phone')} hint={tSignUp('phoneHint')} error={err('phone')}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="6 XX XX XX XX"
          required
          {...describedBy('phone', { hint: tSignUp('phoneHint'), error: err('phone') })}
        />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{tSignUp('language')}</legend>
        <div className="flex gap-6">
          {(['fr', 'en'] as const).map((locale) => (
            <label key={locale} className="flex items-center gap-2 text-base" lang={locale}>
              <input type="radio" name="locale" value={locale} defaultChecked={locale === uiLocale} className="size-4" />
              {tSignUp(`languages.${locale}`)}
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
            {tSignUp.rich('acceptPrivacy', {
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

      <SubmitButton size="lg" pending={pending}>
        {pending ? tSignUp('submitting') : tSignUp('submit')}
      </SubmitButton>
    </form>
  );
}
