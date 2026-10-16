import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from 'lucide-react';
import { getGroup, getMe, getMembers } from '@/lib/server-api';
import { MemberActions } from './member-actions';

type Props = { params: Promise<{ groupId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Members');
  return { title: `${t('title')} · Studybook` };
}

/** MEM-01: everyone sees pseudos; only the leader gets contacts, and the API decides that. */
export default async function MembersPage({ params }: Props) {
  const { groupId } = await params;
  const me = await getMe();
  if (!me) redirect(`/login?${new URLSearchParams({ next: `/groups/${groupId}/members` })}`);
  const group = await getGroup(groupId);
  if (!group) notFound();
  const [t, tGroups, members] = await Promise.all([getTranslations('Members'), getTranslations('Groups'), getMembers(group.id)]);
  const manages = group.myRole === 'leader' && group.status === 'active';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href={`/groups/${group.id}`} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        <span className="break-words">{group.name}</span>
      </Link>
      <h1 className="text-2xl font-bold">
        {t('title')} <span className="text-muted-foreground">({members.length})</span>
      </h1>

      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((member) => (
          <li key={member.userId} className="flex items-start justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium break-words">
                {member.pseudo}
                {member.userId === me.id && <span className="text-muted-foreground"> ({t('you')})</span>}
              </span>
              <span className="text-sm text-muted-foreground">{tGroups(`roles.${member.role}`)}</span>
              {member.contact && (
                <span className="text-sm break-all text-muted-foreground">
                  {member.contact.fullName} · {member.contact.email}
                  {member.contact.phone && ` · ${member.contact.phone}`}
                </span>
              )}
            </div>
            {manages && member.role !== 'leader' && <MemberActions groupId={group.id} member={member} />}
          </li>
        ))}
      </ul>
    </main>
  );
}
