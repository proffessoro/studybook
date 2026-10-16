import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from './reset-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('ResetPassword');
  return { title: `${t('title')} · Studybook` };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = await getTranslations('ResetPassword');
  const { token = '' } = await searchParams;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <ResetPasswordForm token={token} />
    </main>
  );
}
