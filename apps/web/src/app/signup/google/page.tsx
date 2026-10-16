import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { safeNext } from '@/lib/safe-next';
import { GoogleSignupForm } from './google-signup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Google');
  return { title: `${t('signupTitle')} · Studybook` };
}

export default async function GoogleSignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getTranslations('Google');
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('signupTitle')}</h1>
        <p className="text-muted-foreground">{t('signupIntro')}</p>
      </div>
      <GoogleSignupForm next={safeNext(next)} />
    </main>
  );
}
