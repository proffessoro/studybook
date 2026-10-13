'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { JoinRequestView } from '@studybook/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

/** MEM-04: the leader accepts or refuses people asking to join. */
export function JoinRequests({ groupId, requests }: { groupId: string; requests: JoinRequestView[] }) {
  const t = useTranslations('JoinRequests');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  if (requests.length === 0) return null;

  async function decide(requestId: string, decision: 'accept' | 'reject') {
    setBusy(requestId);
    setError(undefined);
    try {
      const { error: apiError } = await api.PATCH('/api/v1/groups/{groupId}/join-requests/{requestId}', {
        params: { path: { groupId, requestId } },
        body: { decision },
      });
      if (apiError) setError(messages.api(apiError));
      router.refresh();
    } catch {
      setError(messages.network());
    }
    setBusy(undefined);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="requests-heading">
      <h2 id="requests-heading" className="font-semibold">
        {t('title', { count: requests.length })}
      </h2>
      <ul className="flex flex-col divide-y">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 py-3">
            <div className="flex flex-col">
              <span className="font-medium">{r.user.pseudo}</span>
              <span className="text-sm text-muted-foreground break-all">
                {r.user.fullName} · {r.user.email}
                {r.user.phone && ` · ${r.user.phone}`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(r.id, 'accept')} disabled={busy === r.id} aria-label={t('acceptLabel', { pseudo: r.user.pseudo })}>
                {t('accept')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide(r.id, 'reject')} disabled={busy === r.id} aria-label={t('rejectLabel', { pseudo: r.user.pseudo })}>
                {t('reject')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
