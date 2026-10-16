import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getGroup, getMe } from '@/lib/server-api';

type Props = { params: Promise<{ groupId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const group = await getGroup((await params).groupId);
  return { title: group ? `${group.name} · Studybook` : 'Studybook' };
}

/** A group's home. Content, tasks, members, and the feed join it in the next steps. */
export default async function GroupPage({ params }: Props) {
  const { groupId } = await params;
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}` })}`);
  // Not a member looks the same as no such group (the API answers 404 for both).
  const group = await getGroup(groupId);
  if (!group) notFound();
  const t = await getTranslations('Groups');

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      {group.status === 'archived' && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {t('archivedNotice')}
        </p>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold break-words">{group.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`roles.${group.myRole}`)} · {t('memberCount', { count: group.memberCount })}
            {group.languageLabel && ` · ${group.languageLabel}`}
          </p>
        </div>
        {group.myRole === 'leader' && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/groups/${group.id}/settings`}>
              <SettingsIcon aria-hidden />
              {t('settings')}
            </Link>
          </Button>
        )}
      </div>
      {group.description && <p className="whitespace-pre-line">{group.description}</p>}
    </main>
  );
}
