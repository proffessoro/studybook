'use client';

import { type FormEvent, type ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { GroupView } from '@studybook/shared';
import { describedBy, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { type FieldErrors, fieldErrorsOf, useApiErrorMessages } from '@/lib/api-errors';

/** GRP-02: how the group works. */
export function GroupSettingsForm({ group }: { group: GroupView }) {
  const t = useTranslations('GroupSettings');
  const tGroups = useTranslations('Groups');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setSaved(false);
    setFormError(undefined);
    try {
      const { data, error } = await api.PATCH('/api/v1/groups/{groupId}', {
        params: { path: { groupId: group.id } },
        body: {
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          languageLabel: String(form.get('languageLabel') ?? ''),
          visibility: form.get('visibility') === 'listed' ? 'listed' : 'private',
          inviteRequiresApproval: form.get('inviteRequiresApproval') === 'on',
          progressVisibility: form.get('progressVisibility') === 'all' ? 'all' : 'own',
          feedEnabled: form.get('feedEnabled') === 'on',
        },
      });
      if (data) {
        setFieldErrors({});
        setSaved(true);
        router.refresh();
      } else if (error) {
        const fields = fieldErrorsOf(error);
        setFieldErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(messages.api(error));
      }
    } catch {
      setFormError(messages.network());
    }
    setPending(false);
  }

  const err = (field: string) => messages.field(field, fieldErrors[field]);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <FormField id="name" label={tGroups('name')} error={err('name')}>
        <Input id="name" name="name" defaultValue={group.name} required maxLength={80} {...describedBy('name', { error: err('name') })} />
      </FormField>
      <FormField id="description" label={tGroups('description')} error={err('description')}>
        <Textarea id="description" name="description" rows={4} maxLength={2000} defaultValue={group.description} />
      </FormField>
      <FormField id="languageLabel" label={tGroups('languageLabel')} hint={tGroups('languageLabelHint')}>
        <Input id="languageLabel" name="languageLabel" maxLength={40} defaultValue={group.languageLabel ?? ''} />
      </FormField>

      <Choice legend={t('visibility')}>
        <Radio name="visibility" value="private" checked={group.visibility === 'private'} label={t('visibilityPrivate')} hint={t('visibilityPrivateHint')} />
        <Radio name="visibility" value="listed" checked={group.visibility === 'listed'} label={t('visibilityListed')} hint={t('visibilityListedHint')} />
      </Choice>

      <Choice legend={t('progressVisibility')}>
        <Radio name="progressVisibility" value="own" checked={group.progressVisibility === 'own'} label={t('progressOwn')} />
        <Radio name="progressVisibility" value="all" checked={group.progressVisibility === 'all'} label={t('progressAll')} hint={t('progressAllHint')} />
      </Choice>

      <div className="flex flex-col gap-4">
        <Toggle name="inviteRequiresApproval" checked={group.inviteRequiresApproval} label={t('inviteApproval')} hint={t('inviteApprovalHint')} />
        <Toggle name="feedEnabled" checked={group.feedEnabled} label={t('feedEnabled')} hint={t('feedEnabledHint')} />
      </div>

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

function Choice({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Radio({ name, value, checked, label, hint }: { name: string; value: string; checked: boolean; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-1 size-4 shrink-0" />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Toggle({ name, checked, label, hint }: { name: string; checked: boolean; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 size-4 shrink-0" />
      <span className="flex flex-col">
        <span>{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
