import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMe } from '@/lib/server-api';
import { CreateGroupForm } from './create-group-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Groups');
  return { title: `${t('newTitle')} · Studybook` };
}

export default async function NewGroupPage() {
  if (!(await getMe())) redirect(`/login?${new URLSearchParams({ next: '/groups/new' })}`);
  const t = await getTranslations('Groups');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('newTitle')}</h1>
        <p className="text-muted-foreground">{t('newIntro')}</p>
      </div>
      <CreateGroupForm />
    </main>
  );
}
