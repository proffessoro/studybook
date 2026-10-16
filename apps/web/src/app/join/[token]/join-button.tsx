'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

export function JoinButton({ token, requiresApproval }: { token: string; requiresApproval: boolean }) {
  const t = useTranslations('Join');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setPending(true);
    setError(undefined);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/invites/{token}/join', { params: { path: { token } } });
      if (data?.status === 'joined') {
        router.push(`/groups/${data.groupId}`);
        router.refresh();
        return;
      }
      if (data?.status === 'requested') setRequested(true);
      else if (apiError) setError(messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  if (requested) {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-2">
        {t('pending')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {requiresApproval && <p className="text-sm text-muted-foreground">{t('approvalNeeded')}</p>}
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" onClick={join} disabled={pending}>
        {requiresApproval ? t('askToJoin') : t('join')}
      </Button>
    </div>
  );
}
