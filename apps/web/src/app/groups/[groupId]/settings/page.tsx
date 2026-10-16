import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getGroup, getMe } from '@/lib/server-api';
import { DangerZone } from './danger-zone';
import { GroupSettingsForm } from './group-settings-form';

type Props = { params: Promise<{ groupId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('GroupSettings');
  return { title: `${t('title')} · Studybook` };
}

/** GRP-02 and GRP-05, for the leader. The API enforces this too; others never get here. */
export default async function GroupSettingsPage({ params }: Props) {
  const { groupId } = await params;
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}/settings` })}`);
  const group = await getGroup(groupId);
  if (!group) notFound();
  if (group.myRole !== 'leader') redirect(`/groups/${group.id}`);
  const t = await getTranslations('GroupSettings');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground break-words">{group.name}</p>
      </div>
      {group.status === 'archived' ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {t('archivedReadOnly')}
        </p>
      ) : (
        <GroupSettingsForm group={group} />
      )}
      <DangerZone group={group} />
    </main>
  );
}
