'use client';

import { type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { GroupView } from '@studybook/shared';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

/** GRP-05: archive (read-only, can be undone) or delete (needs the name typed again). */
export function DangerZone({ group }: { group: GroupView }) {
  const t = useTranslations('GroupSettings');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string>();
  const archived = group.status === 'archived';

  async function toggleArchive() {
    setPending(true);
    setError(undefined);
    try {
      const path = archived ? '/api/v1/groups/{groupId}/unarchive' : '/api/v1/groups/{groupId}/archive';
      const { error: apiError } = await api.POST(path, { params: { path: { groupId: group.id } } });
      if (apiError) setError(messages.api(apiError));
      else router.refresh();
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const { error: apiError } = await api.DELETE('/api/v1/groups/{groupId}', {
        params: { path: { groupId: group.id } },
        body: { confirmName },
      });
      if (!apiError) {
        router.push('/groups');
        router.refresh();
        return;
      }
      setError(apiError.code === 'CONFIRMATION_MISMATCH' ? t('deleteMismatch') : messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-6 rounded-lg border border-destructive/40 p-4" aria-labelledby="danger-heading">
      <h2 id="danger-heading" className="font-semibold text-destructive">
        {t('dangerZone')}
      </h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm">{archived ? t('unarchiveHint') : t('archiveHint')}</p>
        <Button variant="outline" className="self-start" onClick={toggleArchive} disabled={pending}>
          {archived ? t('unarchive') : t('archive')}
        </Button>
      </div>

      <form method="post" onSubmit={onDelete} className="flex flex-col gap-3">
        <p className="text-sm">{t('deleteHint')}</p>
        <FormField id="confirmName" label={t('deleteConfirm', { name: group.name })}>
          <Input id="confirmName" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </FormField>
        <SubmitButton variant="destructive" className="self-start" pending={pending} disabled={confirmName.trim() !== group.name}>
          {t('delete')}
        </SubmitButton>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
