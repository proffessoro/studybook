import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerifyEmailForm } from './verify-email-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VerifyEmail');
  return { title: `${t('title')} · Studybook` };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; code?: string }>;
}) {
  const t = await getTranslations('VerifyEmail');
  const { email = '', code = '' } = await searchParams;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <VerifyEmailForm email={email} code={code} />
    </main>
  );
}
