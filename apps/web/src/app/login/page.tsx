import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { GoogleButton } from '@/components/google-button';
import { getMe } from '@/lib/server-api';
import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Login');
  return { title: `${t('title')} · Studybook` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; error?: string }>;
}) {
  const { email = '', next, error } = await searchParams;
  if (await getMe()) redirect(safeNext(next));
  const t = await getTranslations('Login');

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {(error === 'google-failed' || error === 'google-suspended') && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error === 'google-suspended' ? 'googleSuspended' : 'googleFailed')}
        </p>
      )}
      <GoogleButton next={safeNext(next)} />
      <LoginForm email={email} next={safeNext(next)} />
      <p className="text-center text-sm text-muted-foreground">
        {t.rich('noAccount', {
          link: (chunks) => (
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </main>
  );
}
