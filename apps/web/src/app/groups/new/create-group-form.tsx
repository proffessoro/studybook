'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { type FieldErrors, fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/** GRP-01. The cover image comes with file storage (step 1.4). */
export function CreateGroupForm() {
  const t = useTranslations('Groups');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFormError(undefined);
    try {
      const { data, error } = await api.POST('/api/v1/groups', {
        body: {
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          languageLabel: String(form.get('languageLabel') ?? ''),
        },
      });
      if (data) {
        router.push(`/groups/${data.id}`);
        return;
      }
      const fields = fieldErrorsOf(error);
      setFieldErrors(fields);
      if (Object.keys(fields).length === 0 && error) setFormError(messages.api(error));
    } catch {
      setFormError(messages.network());
    }
    setPending(false);
  }

  const err = (field: string) => messages.field(field, fieldErrors[field]);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="name" label={t('name')} error={err('name')}>
        <Input id="name" name="name" required maxLength={80} {...describedBy('name', { error: err('name') })} />
      </FormField>
      <FormField id="description" label={t('description')} hint={t('descriptionHint')} error={err('description')}>
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          {...describedBy('description', { hint: t('descriptionHint'), error: err('description') })}
        />
      </FormField>
      <FormField id="languageLabel" label={t('languageLabel')} hint={t('languageLabelHint')} error={err('languageLabel')}>
        <Input
          id="languageLabel"
          name="languageLabel"
          maxLength={40}
          placeholder="Français"
          {...describedBy('languageLabel', { hint: t('languageLabelHint'), error: err('languageLabel') })}
        />
      </FormField>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t('creating') : t('createSubmit')}
      </Button>
    </form>
  );
}
