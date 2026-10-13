'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

/** GRP-03: the leader copies or shares the invite link, or resets it. */
export function InvitePanel({
  groupId,
  groupName,
  token: initialToken,
  origin,
}: {
  groupId: string;
  groupName: string;
  token: string;
  /** The address people open the site with, e.g. https://studybook.cm */
  origin: string;
}) {
  const t = useTranslations('Invite');
  const messages = useApiErrorMessages();
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string>();

  const url = `${origin}/join/${token}`;
  const whatsapp = `https://wa.me/?${new URLSearchParams({ text: t('shareText', { name: groupName, url }) })}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(t('copyFailed'));
    }
  }

  async function reset() {
    setNotice(undefined);
    try {
      const { data, error } = await api.POST('/api/v1/groups/{groupId}/invite-link/reset', { params: { path: { groupId } } });
      if (data) {
        setToken(data.token);
        setConfirmReset(false);
        setNotice(t('resetDone'));
      } else if (error) setNotice(messages.api(error));
    } catch {
      setNotice(messages.network());
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      <Input readOnly value={url} aria-label={t('linkLabel')} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? t('copied') : t('copy')}
        </Button>
        <Button variant="outline" asChild>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            {t('whatsapp')}
          </a>
        </Button>
        {!confirmReset && (
          <Button variant="ghost" onClick={() => setConfirmReset(true)}>
            <RefreshCwIcon aria-hidden />
            {t('reset')}
          </Button>
        )}
      </div>
      {confirmReset && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
          <p>{t('resetConfirm')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={reset}>
              {t('resetYes')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
