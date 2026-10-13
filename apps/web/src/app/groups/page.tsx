import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMe, getMyGroups } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Groups');
  return { title: `${t('title')} · Studybook` };
}

/** Home for logged-in users: their groups. */
export default async function MyGroupsPage() {
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: '/groups' })}`);
  const [t, groups] = await Promise.all([getTranslations('Groups'), getMyGroups()]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <Button asChild>
          <Link href="/groups/new">
            <PlusIcon aria-hidden />
            {t('create')}
          </Link>
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
          <p className="font-medium">{t('emptyTitle')}</p>
          <p className="text-muted-foreground">{t('emptyText')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-accent"
              >
                <span className="font-medium">{group.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`roles.${group.myRole}`)} · {t('memberCount', { count: group.memberCount })}
                  {group.status === 'archived' && ` · ${t('archived')}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
