'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreVerticalIcon } from 'lucide-react';
import type { MemberView } from '@studybook/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { useApiErrorMessages } from '@/lib/api-errors';

type Confirm = 'transfer' | 'remove' | 'ban';

/** MEM-02, MEM-03: what the leader can do with one member. Lasting changes ask first. */
export function MemberActions({ groupId, member }: { groupId: string; member: MemberView }) {
  const t = useTranslations('Members');
  const messages = useApiErrorMessages();
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const path = { groupId, userId: member.userId };

  async function run(action: () => Promise<{ error?: Parameters<typeof messages.api>[0] }>, after?: string) {
    setPending(true);
    setError(undefined);
    try {
      const { error: apiError } = await action();
      if (apiError) setError(messages.api(apiError));
      else {
        setConfirm(undefined);
        if (after) router.push(after);
        router.refresh();
      }
    } catch {
      setError(messages.network());
    }
    setPending(false);
  }

  const setRole = (role: 'moderator' | 'member') =>
    run(() => api.PATCH('/api/v1/groups/{groupId}/members/{userId}', { params: { path }, body: { role } }));
  const remove = (ban: boolean) =>
    run(() => api.DELETE('/api/v1/groups/{groupId}/members/{userId}', { params: { path }, body: { ban } }));
  const transfer = () =>
    run(
      () => api.POST('/api/v1/groups/{groupId}/transfer-leadership', { params: { path: { groupId } }, body: { userId: member.userId } }),
      `/groups/${groupId}`,
    );

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending} aria-label={t('actionsFor', { pseudo: member.pseudo })}>
            <MoreVerticalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {member.role === 'member' ? (
            <DropdownMenuItem onSelect={() => setRole('moderator')}>{t('makeModerator')}</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setRole('member')}>{t('makeMember')}</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setConfirm('transfer')}>{t('transfer')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm('remove')}>{t('remove')}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('ban')}>
            {t('ban')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirm && (
        <div role="alertdialog" aria-label={t(`${confirm}Title`, { pseudo: member.pseudo })} className="flex max-w-64 flex-col gap-2 rounded-md bg-muted p-3 text-sm">
          <p>{t(`${confirm}Confirm`, { pseudo: member.pseudo })}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={confirm === 'transfer' ? 'default' : 'destructive'}
              disabled={pending}
              onClick={() => (confirm === 'transfer' ? transfer() : remove(confirm === 'ban'))}
            >
              {t(`${confirm}Yes`)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(undefined)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
