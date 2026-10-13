import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMe } from '@/lib/server-api';
import { EmailChange } from './email-change';
import { ProfileForm } from './profile-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Profile');
  return { title: `${t('title')} · Studybook` };
}

export default async function ProfilePage() {
  const me = await getMe();
  if (!me) redirect(`/login?${new URLSearchParams({ next: '/profile' })}`);
  const t = await getTranslations('Profile');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <ProfileForm me={me} />
      <section className="flex flex-col gap-4 border-t pt-6" aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-lg font-semibold">
          {t('emailHeading')}
        </h2>
        <EmailChange currentEmail={me.email} />
      </section>
    </main>
  );
}
