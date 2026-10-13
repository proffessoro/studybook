'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

/** MEM-05, for anyone but the leader. */
export function LeaveGroup({ groupId }: { groupId: string }) {
  const t = useTranslations('Members');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  async function leave() {
    setError(undefined);
    try {
      const { error: apiError } = await api.POST('/api/v1/groups/{groupId}/leave', { params: { path: { groupId } } });
      if (apiError) setError(messages.api(apiError));
      else {
        router.push('/groups');
        router.refresh();
      }
    } catch {
      setError(messages.network());
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      {confirming ? (
        <div role="alertdialog" aria-label={t('leaveTitle')} className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
          <p>{t('leaveConfirm')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={leave}>
              {t('leaveYes')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="self-start text-destructive" onClick={() => setConfirming(true)}>
          {t('leave')}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
