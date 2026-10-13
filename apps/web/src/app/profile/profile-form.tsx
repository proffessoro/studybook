'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Me } from '@studybook/shared';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setLocale } from '@/i18n/actions';
import { api } from '@/lib/api';
import { type FieldErrors, fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/** Name, pseudo, phone, and language (ACC-06). The photo comes with file storage (step 1.4). */
export function ProfileForm({ me }: { me: Me }) {
  const t = useTranslations('Profile');
  const tSignUp = useTranslations('SignUp');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const locale = form.get('locale') === 'en' ? 'en' : 'fr';
    setPending(true);
    setSaved(false);
    setFormError(undefined);

    try {
      const { data, error } = await api.PATCH('/api/v1/me', {
        body: {
          fullName: String(form.get('fullName') ?? ''),
          pseudo: String(form.get('pseudo') ?? ''),
          phone: String(form.get('phone') ?? ''),
          locale,
        },
      });
      if (data) {
        setFieldErrors({});
        // The interface follows the user's language (NFR-04).
        if (data.locale !== me.locale) await setLocale(data.locale);
        setSaved(true);
        router.refresh();
      } else if (error) {
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

  const err = (field: string) => messages.field(field, fieldErrors[field]);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="fullName" label={tSignUp('fullName')} error={err('fullName')}>
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={me.fullName} required {...describedBy('fullName', { error: err('fullName') })} />
      </FormField>

      <FormField id="pseudo" label={tSignUp('pseudo')} hint={tSignUp('pseudoHint')} error={err('pseudo')}>
        <Input
          id="pseudo"
          name="pseudo"
          autoComplete="username"
          autoCapitalize="none"
          defaultValue={me.pseudo}
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
          defaultValue={me.phone ?? ''}
          required
          {...describedBy('phone', { hint: tSignUp('phoneHint'), error: err('phone') })}
        />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">{tSignUp('language')}</legend>
        <div className="flex gap-6">
          {(['fr', 'en'] as const).map((locale) => (
            <label key={locale} className="flex items-center gap-2 text-base" lang={locale}>
              <input type="radio" name="locale" value={locale} defaultChecked={locale === me.locale} className="size-4" />
              {tSignUp(`languages.${locale}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('saved')}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
