'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

/** GRP-04: from the catalogue, people ask; the leader accepts or refuses. */
export function RequestToJoin({ slug }: { slug: string }) {
  const t = useTranslations('Catalogue');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function send() {
    setPending(true);
    setError(undefined);
    try {
      const { data, error: apiError } = await api.POST('/api/v1/catalogue/{slug}/request', { params: { path: { slug } } });
      if (data?.status === 'joined') {
        router.push(`/groups/${data.groupId}`);
        return;
      }
      if (data) setSent(true);
      else if (apiError) setError(messages.api(apiError));
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-md bg-muted px-3 py-2">
        {t('pending')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('approvalNote')}</p>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" onClick={send} disabled={pending}>
        {t('request')}
      </Button>
    </div>
  );
}
